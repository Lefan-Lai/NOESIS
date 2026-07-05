import type {
  AnnotationModel,
  BackfillRecordModel,
  DocumentVersionModel,
  EventLogRecord,
  FlexiblePayload,
  LocalThreadModel,
  MainConversationModel,
  MessageModel,
  ProjectModel,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TextSelectionModel,
  TimelinePathModel
} from "@/types/revision";
import type { ContextSnapshot, LLMCallRecord } from "@/types/context";
import { hashContent } from "./DiffService";
import { DocumentChunkService } from "./DocumentChunkService";
import { FeatureFlagService } from "./FeatureFlagService";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceIndexService } from "./WorkspaceIndexes";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";

const DEFAULT_MIGRATION_VERSION = "phase-10";

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 110);
}

function sortByCreatedAt<T extends { createdAt?: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt ?? "1970-01-01T00:00:00.000Z").getTime();
    const bTime = new Date(b.createdAt ?? "1970-01-01T00:00:00.000Z").getTime();

    return aTime === bTime ? a.id.localeCompare(b.id) : aTime - bTime;
  });
}

function backfillMetadata(migrationJobId: string, legacySourceId: string) {
  return {
    backfilled: true,
    reconstructed: true,
    migration_job_id: migrationJobId,
    legacy_source_id: legacySourceId
  };
}

function conversationMessages(state: RevisionRepositoryState, conversationId: string) {
  return sortByCreatedAt(
    Object.values(state.revisionMessages).filter(
      (message) => message.conversationId === conversationId
    )
  );
}

function mainAssistantMessages(state: RevisionRepositoryState, conversationId: string) {
  return conversationMessages(state, conversationId).filter(
    (message) =>
      message.role === "assistant" &&
      Boolean(message.content?.trim()) &&
      (message.threadType ?? "main") === "main"
  );
}

function createBackfilledEvent(input: {
  state: RevisionRepositoryState;
  migrationJobId: string;
  projectId: string;
  conversationId?: string;
  eventType: EventLogRecord["eventType"];
  objectType: EventLogRecord["objectType"];
  objectId: string;
  actor?: EventLogRecord["actor"];
  timestamp: string;
  payload?: FlexiblePayload;
}) {
  const id = `event-backfill-${safeIdPart(input.eventType)}-${safeIdPart(input.objectId)}`;
  const existing = input.state.eventLogs[id];

  if (existing) {
    return {
      state: input.state,
      event: existing,
      created: false
    };
  }

  const event: EventLogRecord = {
    id,
    projectId: input.projectId,
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    actor: input.actor ?? "system",
    timestamp: input.timestamp,
    immutable: true,
    payload: {
      ...(input.payload ?? {}),
      ...backfillMetadata(input.migrationJobId, input.objectId),
      conversation_id: input.conversationId
    }
  };

  return {
    state: {
      ...input.state,
      eventLogs: {
        ...input.state.eventLogs,
        [event.id]: event
      }
    },
    event,
    created: true
  };
}

function createTimelineNode(input: {
  state: RevisionRepositoryState;
  migrationJobId: string;
  projectId: string;
  conversationId?: string;
  event: EventLogRecord;
  id: string;
  parentNodeId?: string | null;
  targetObjectType: RevisionTimelineNode["targetObjectType"];
  targetObjectId: string;
  label: string;
  memoryScope: RevisionTimelineNode["memoryScope"];
  memoryEffect: RevisionTimelineNode["memoryEffect"];
  activePathId?: string;
  timestamp: string;
  payload?: FlexiblePayload;
}) {
  const existing = input.state.timelineNodes[input.id];

  if (existing) {
    return {
      state: input.state,
      node: existing,
      created: false
    };
  }

  const node: RevisionTimelineNode = {
    id: input.id,
    projectId: input.projectId,
    conversationId: input.conversationId,
    parentNodeId: input.parentNodeId,
    eventId: input.event.id,
    eventType: input.event.eventType,
    targetObjectType: input.targetObjectType,
    targetObjectId: input.targetObjectId,
    label: input.label,
    actor: input.event.actor,
    memoryScope: input.memoryScope,
    memoryEffect: input.memoryEffect,
    status: "active",
    activePathId: input.activePathId,
    createdContentRef: input.targetObjectId,
    timestamp: input.timestamp,
    payload: {
      ...(input.payload ?? {}),
      ...backfillMetadata(input.migrationJobId, input.targetObjectId)
    }
  };

  const stateWithNode = {
    ...input.state,
    timelineNodes: {
      ...input.state.timelineNodes,
      [node.id]: node
    }
  };
  const backfillEvent = createBackfilledEvent({
    state: stateWithNode,
    migrationJobId: input.migrationJobId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    eventType: "backfill.timeline_node.created",
    objectType: "timeline_node",
    objectId: node.id,
    timestamp: input.timestamp,
    payload: {
      target_object_type: input.targetObjectType,
      target_object_id: input.targetObjectId,
      parent_node_id: input.parentNodeId,
      active_path_id: input.activePathId
    }
  });

  return {
    state: backfillEvent.state,
    node,
    created: true
  };
}

function createTimelineEdge(input: {
  state: RevisionRepositoryState;
  migrationJobId: string;
  projectId: string;
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType?: RevisionTimelineEdge["edgeType"];
  timestamp: string;
  label?: string;
}) {
  const existing = input.state.timelineEdges[input.id];

  if (existing) {
    return {
      state: input.state,
      edge: existing,
      created: false
    };
  }

  const edge: RevisionTimelineEdge = {
    id: input.id,
    projectId: input.projectId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    edgeType: input.edgeType ?? "sequence",
    label: input.label,
    status: "active",
    timestamp: input.timestamp,
    payload: {
      ...backfillMetadata(input.migrationJobId, input.id)
    }
  };

  return {
    state: {
      ...input.state,
      timelineEdges: {
        ...input.state.timelineEdges,
        [edge.id]: edge
      }
    },
    edge,
    created: true
  };
}

function createRecordIfNeeded(input: {
  state: RevisionRepositoryState;
  migrationJobId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: BackfillRecordModel["targetEntityType"];
  targetEntityId: string;
  backfillType: string;
  now: string;
}) {
  if (
    MigrationTrackingService.findBackfillRecord(
      input.state,
      input.sourceEntityType,
      input.sourceEntityId,
      input.backfillType
    )
  ) {
    return input.state;
  }

  return MigrationTrackingService.createBackfillRecord(input).state;
}

function nearestPreviousUserMessage(
  messages: MessageModel[],
  assistantMessage: MessageModel
) {
  const assistantTime = new Date(assistantMessage.createdAt).getTime();

  return [...messages]
    .filter(
      (message) =>
        message.role === "user" &&
        new Date(message.createdAt).getTime() <= assistantTime
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}

export class WorkspaceBackfillService {
  static ensureMigrationJob(input: {
    state: RevisionRepositoryState;
    migrationJobId?: string;
    now?: string;
  }) {
    if (input.migrationJobId && input.state.migrationJobs[input.migrationJobId]) {
      return {
        state: input.state,
        migrationJobId: input.migrationJobId
      };
    }

    const result = MigrationTrackingService.createJob({
      state: input.state,
      name: "workspace_revision_backfill",
      version: DEFAULT_MIGRATION_VERSION,
      status: "running",
      createdBy: "system",
      now: input.now,
      suffix: input.migrationJobId ?? "workspace-revision-backfill"
    });

    return {
      state: result.state,
      migrationJobId: result.job.id
    };
  }

  static backfillProject(input: {
    state: RevisionRepositoryState;
    projectId: string;
    migrationJobId?: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const job = WorkspaceBackfillService.ensureMigrationJob({
      state: input.state,
      migrationJobId: input.migrationJobId,
      now
    });
    let state = FeatureFlagService.ensureDefaults(
      WorkspaceIndexService.installIndexes(job.state),
      now
    );
    const project = state.projects[input.projectId];

    if (!project) {
      const issue = MigrationTrackingService.createIssue({
        state,
        migrationJobId: job.migrationJobId,
        entityType: "project",
        entityId: input.projectId,
        severity: "error",
        issueCode: "project_missing",
        message: "Cannot backfill missing project.",
        now
      });

      return {
        state: issue.state,
        migrationJobId: job.migrationJobId
      };
    }

    const conversations = sortByCreatedAt(
      Object.values(state.mainConversations).filter(
        (conversation) => conversation.projectId === project.id
      )
    );
    const activeConversation =
      conversations.find((conversation) => conversation.status === "active") ??
      conversations[conversations.length - 1] ??
      conversations[0];
    const updatedProject: ProjectModel = {
      ...project,
      status: project.status ?? "active",
      activeConversationId:
        project.activeConversationId ?? activeConversation?.id,
      revisionWorkspaceReady: project.revisionWorkspaceReady ?? false,
      migrationVersion: DEFAULT_MIGRATION_VERSION,
      updatedAt: now,
      payload: {
        ...(project.payload ?? {}),
        backfilled_project_defaults: true
      }
    };

    state = {
      ...state,
      projects: {
        ...state.projects,
        [project.id]: updatedProject
      }
    };
    state = createRecordIfNeeded({
      state,
      migrationJobId: job.migrationJobId,
      sourceEntityType: "project",
      sourceEntityId: project.id,
      targetEntityType: "project",
      targetEntityId: project.id,
      backfillType: "project.defaults",
      now
    });

    for (const conversation of conversations) {
      state = WorkspaceBackfillService.backfillConversation({
        state,
        conversationId: conversation.id,
        migrationJobId: job.migrationJobId,
        now
      }).state;
    }

    const latestActiveVersion = sortByCreatedAt(
      Object.values(state.documentVersions).filter(
        (version) => version.projectId === project.id && version.status === "active"
      )
    ).at(-1);
    const activePath = Object.values(state.timelinePaths).find(
      (path) =>
        path.projectId === project.id &&
        (!updatedProject.activeConversationId ||
          path.conversationId === updatedProject.activeConversationId) &&
        path.status === "active"
    );

    state = {
      ...state,
      projects: {
        ...state.projects,
        [project.id]: {
          ...state.projects[project.id],
          activeDocumentVersionId:
            state.projects[project.id].activeDocumentVersionId ??
            latestActiveVersion?.id,
          activeTimelinePathId:
            state.projects[project.id].activeTimelinePathId ?? activePath?.id,
          activeTimelineNodeId:
            state.projects[project.id].activeTimelineNodeId ??
            activePath?.headNodeId,
          updatedAt: now
        }
      }
    };

    return {
      state,
      migrationJobId: job.migrationJobId
    };
  }

  static backfillConversation(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId?: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const job = WorkspaceBackfillService.ensureMigrationJob({
      state: input.state,
      migrationJobId: input.migrationJobId,
      now
    });
    let state = job.state;
    const conversation = state.mainConversations[input.conversationId];

    if (!conversation) {
      return {
        state: MigrationTrackingService.createIssue({
          state,
          migrationJobId: job.migrationJobId,
          entityType: "main_conversation",
          entityId: input.conversationId,
          severity: "error",
          issueCode: "conversation_missing",
          message: "Cannot backfill missing conversation.",
          now
        }).state,
        migrationJobId: job.migrationJobId
      };
    }

    state = {
      ...state,
      mainConversations: {
        ...state.mainConversations,
        [conversation.id]: {
          ...conversation,
          status: conversation.status ?? "active",
          updatedAt: now,
          payload: {
            ...(conversation.payload ?? {}),
            backfilled_conversation_defaults: true
          }
        }
      }
    };
    state = WorkspaceBackfillService.backfillMessages({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillDocumentVersions({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillLLMCalls({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillContextSnapshots({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillEventLogs({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillTimeline({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillLegacyLocalThreads({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillLegacyAnnotations({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;
    state = WorkspaceBackfillService.backfillActivePath({
      state,
      conversationId: conversation.id,
      migrationJobId: job.migrationJobId,
      now
    }).state;

    return {
      state,
      migrationJobId: job.migrationJobId
    };
  }

  static backfillMessages(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const conversation = state.mainConversations[input.conversationId];
    const messages = conversationMessages(state, input.conversationId);
    let warningCount = 0;

    for (const message of messages) {
      try {
        const missingCreatedAt = !message.createdAt;
        const modelUnknown = message.role === "assistant" && !message.model;
        const status = message.status ?? "active";
        const excludedStatus = ["deleted", "discarded", "inactive"].includes(status);
        const updated: MessageModel = {
          ...message,
          projectId: message.projectId || conversation.projectId,
          conversationId: message.conversationId || conversation.id,
          threadType: message.threadType ?? "main",
          threadId: message.threadId ?? conversation.id,
          status,
          memoryScope: message.memoryScope ?? "conversation",
          includeInContext: excludedStatus ? false : message.includeInContext ?? true,
          model:
            message.role === "assistant"
              ? message.model ?? "unknown_legacy_model"
              : message.model,
          createdAt: message.createdAt || conversation.createdAt || now,
          payload: {
            ...(message.payload ?? {}),
            source: message.payload?.source ?? "legacy_import",
            backfilled: true,
            model_unknown: modelUnknown
          }
        };

        state = {
          ...state,
          revisionMessages: {
            ...state.revisionMessages,
            [message.id]: updated
          }
        };
        state = createRecordIfNeeded({
          state,
          migrationJobId: input.migrationJobId,
          sourceEntityType: "message",
          sourceEntityId: message.id,
          targetEntityType: "message",
          targetEntityId: message.id,
          backfillType: "message.defaults",
          now
        });

        if (missingCreatedAt || modelUnknown) {
          warningCount += 1;
          state = MigrationTrackingService.createIssue({
            state,
            migrationJobId: input.migrationJobId,
            entityType: "message",
            entityId: message.id,
            severity: "warning",
            issueCode: missingCreatedAt
              ? "messages_without_created_at"
              : "unknown_legacy_model",
            message: missingCreatedAt
              ? "Message missing created_at; migration timestamp or conversation timestamp was used."
              : "Assistant message missing model; unknown_legacy_model was used.",
            now
          }).state;
        }
      } catch (error) {
        state = MigrationTrackingService.createIssue({
          state,
          migrationJobId: input.migrationJobId,
          entityType: "message",
          entityId: message.id,
          severity: "error",
          issueCode: "message_backfill_failed",
          message: error instanceof Error ? error.message : "Message backfill failed.",
          now
        }).state;
      }
    }

    state = WorkspaceObservabilityService.recordMetric({
      state,
      name: "migration_messages_backfilled",
      value: messages.length,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      now
    }).state;

    return {
      state,
      warningCount
    };
  }

  static backfillDocumentVersions(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const conversation = state.mainConversations[input.conversationId];
    const assistants = mainAssistantMessages(state, input.conversationId);
    let previousVersionId: string | null = null;
    let createdCount = 0;

    assistants.forEach((message, index) => {
      const existing =
        Object.values(state.documentVersions).find(
          (version) => version.sourceId === message.id
        ) ??
        state.documentVersions[`document-version-backfill-${safeIdPart(message.id)}`];
      const versionId = existing?.id ?? `document-version-backfill-${safeIdPart(message.id)}`;
      const isLatest = index === assistants.length - 1;
      const documentVersion: DocumentVersionModel = existing
        ? {
            ...existing,
            parentDocumentVersionId:
              existing.parentDocumentVersionId ?? previousVersionId,
            parentVersionId: existing.parentVersionId ?? previousVersionId,
            versionNumber: existing.versionNumber ?? index + 1,
            status: isLatest ? "active" : "inactive",
            contentHash: existing.contentHash ?? hashContent(existing.content),
            metadata: {
              ...(existing.metadata ?? {}),
              backfilled: true
            }
          }
        : {
            id: versionId,
            documentVersionId: versionId,
            projectId: conversation.projectId,
            conversationId: conversation.id,
            documentId: `document-${conversation.id}`,
            parentDocumentVersionId: previousVersionId,
            parentVersionId: previousVersionId,
            versionNumber: index + 1,
            contentHash: hashContent(message.content),
            sourceType: "initial_answer",
            sourceId: message.id,
            createdBy: "assistant",
            status: isLatest ? "active" : "inactive",
            content: message.content,
            title: `Backfilled version ${index + 1}`,
            createdAt: message.createdAt,
            metadata: {
              ...backfillMetadata(input.migrationJobId, message.id)
            },
            payload: {
              content_hash: hashContent(message.content),
              version_number: index + 1,
              source_type: "initial_answer",
              source_id: message.id
            }
          };

      state = {
        ...state,
        documentVersions: {
          ...state.documentVersions,
          [documentVersion.id]: documentVersion
        }
      };
      state = createBackfilledEvent({
        state,
        migrationJobId: input.migrationJobId,
        projectId: conversation.projectId,
        conversationId: conversation.id,
        eventType: "backfill.document_version.created",
        objectType: "document_version",
        objectId: documentVersion.id,
        actor: "system",
        timestamp: documentVersion.createdAt,
        payload: {
          source_message_id: message.id,
          version_number: documentVersion.versionNumber,
          status: documentVersion.status,
          content_hash: documentVersion.contentHash
        }
      }).state;
      state = createRecordIfNeeded({
        state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "message",
        sourceEntityId: message.id,
        targetEntityType: "document_version",
        targetEntityId: documentVersion.id,
        backfillType: "document_version.from_assistant_message",
        now
      });
      previousVersionId = documentVersion.id;

      if (!existing) {
        createdCount += 1;
      }
      state = DocumentChunkService.createChunksForDocumentVersion({
        state,
        documentVersionId: documentVersion.id,
        now
      }).state;
    });

    const activeVersionId = previousVersionId ?? conversation.activeDocumentVersionId;

    if (activeVersionId) {
      state = {
        ...state,
        mainConversations: {
          ...state.mainConversations,
          [conversation.id]: {
            ...state.mainConversations[conversation.id],
            activeDocumentVersionId: activeVersionId,
            updatedAt: now
          }
        },
        projects: {
          ...state.projects,
          [conversation.projectId]: {
            ...state.projects[conversation.projectId],
            activeDocumentVersionId:
              state.projects[conversation.projectId]?.activeDocumentVersionId ??
              activeVersionId,
            updatedAt: now
          }
        }
      };
    }

    state = WorkspaceObservabilityService.recordMetric({
      state,
      name: "migration_document_versions_created",
      value: createdCount,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      now
    }).state;

    return {
      state,
      createdCount
    };
  }

  static backfillLLMCalls(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const messages = conversationMessages(state, input.conversationId);
    const assistants = messages.filter((message) => message.role === "assistant");

    for (const message of assistants) {
      const id = `llm-call-backfill-${safeIdPart(message.id)}`;
      const existing = state.llmCallRecords[id];
      const inputMessage = nearestPreviousUserMessage(messages, message);

      if (!existing) {
        const model = message.model ?? "unknown_legacy_model";
        const llmCallRecord: LLMCallRecord = {
          id,
          projectId: message.projectId,
          callType: message.threadType === "comparison" ? "comparison_chat" : message.threadType === "local" || message.threadType === "nested_local" ? "local_window" : "main_conversation",
          purpose: message.threadType === "local" || message.threadType === "nested_local" ? "local_question" : "general_followup",
          model,
          modelProvider: message.payload?.model_provider ? String(message.payload.model_provider) as never : "unknown",
          status: "completed",
          prompt: inputMessage?.content ?? "",
          contextSnapshotId: `context-snapshot-backfill-${safeIdPart(message.id)}`,
          inputMessageId: inputMessage?.id,
          sessionId: message.conversationId,
          threadId: message.threadId ?? message.conversationId,
          threadType: message.threadType ?? "main",
          outputMessageId: message.id,
          createdAt: message.createdAt,
          completedAt: message.createdAt,
          metadata: {
            ...backfillMetadata(input.migrationJobId, message.id),
            model_unknown: model === "unknown_legacy_model"
          }
        };

        state = {
          ...state,
          llmCallRecords: {
            ...state.llmCallRecords,
            [llmCallRecord.id]: llmCallRecord
          },
          revisionMessages: {
            ...state.revisionMessages,
            [message.id]: {
              ...message,
              llmCallId: llmCallRecord.id
            }
          }
        };
      }

      state = createRecordIfNeeded({
        state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "message",
        sourceEntityId: message.id,
        targetEntityType: "llm_call",
        targetEntityId: id,
        backfillType: "llm_call.from_assistant_message",
        now
      });
    }

    return {
      state
    };
  }

  static backfillContextSnapshots(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const messages = conversationMessages(state, input.conversationId);
    const assistants = messages.filter((message) => message.role === "assistant");
    let reconstructedCount = 0;

    for (const message of assistants) {
      const llmCallId = `llm-call-backfill-${safeIdPart(message.id)}`;
      const snapshotId = `context-snapshot-backfill-${safeIdPart(message.id)}`;

      if (!state.contextSnapshots[snapshotId]) {
        const previousMessages = messages.filter(
          (candidate) =>
            new Date(candidate.createdAt).getTime() <=
              new Date(message.createdAt).getTime() &&
            candidate.id !== message.id
        );
        const previousVersion = sortByCreatedAt(
          Object.values(state.documentVersions).filter(
            (version) =>
              version.conversationId === input.conversationId &&
              new Date(version.createdAt).getTime() <=
                new Date(message.createdAt).getTime() &&
              version.sourceId !== message.id
          )
        ).at(-1);
        const includedItems = [
          ...previousMessages.slice(-8).map((previous) => {
            const excludedStatus = ["deleted", "discarded", "inactive"].includes(
              previous.status
            );

            return {
              id: `ctx-backfill-message-${previous.id}`,
              type: "previous_message",
              sourceId: previous.id,
              text: excludedStatus ? "" : previous.content,
              reason: excludedStatus
                ? `legacy_${previous.status}_message_excluded`
                : "best_effort_previous_legacy_message",
              included: !excludedStatus
            };
          }),
          ...(previousVersion
            ? [
                {
                  id: `ctx-backfill-document-version-${previousVersion.id}`,
                  type: "active_document_version",
                  sourceId: previousVersion.id,
                  text: previousVersion.content,
                  reason: "best_effort_previous_document_version",
                  included: true
                }
              ]
            : [])
        ];
        const snapshot: ContextSnapshot = {
          id: snapshotId,
          llmCallId,
          projectId: message.projectId,
          callType: message.threadType === "local" || message.threadType === "nested_local" ? "local_window" : "main_conversation",
          purpose: message.threadType === "local" || message.threadType === "nested_local" ? "local_question" : "general_followup",
          model: message.model ?? "unknown_legacy_model",
          status: "reconstructed",
          sessionId: message.conversationId,
          threadId: message.threadId ?? message.conversationId,
          threadType: message.threadType ?? "main",
          includedItems,
          excludedItems: [],
          tokenEstimate: Math.ceil(
            includedItems.reduce((total, item) => total + item.text.length, 0) / 4
          ),
          createdAt: message.createdAt,
          metadata: {
            ...backfillMetadata(input.migrationJobId, message.id),
            reconstructed: true,
            reconstruction_quality: "partial",
            warning: "Original runtime context was not stored in legacy system.",
            active_document_version_id: previousVersion?.id
          }
        };

        state = {
          ...state,
          contextSnapshots: {
            ...state.contextSnapshots,
            [snapshot.id]: snapshot
          }
        };
        state = createBackfilledEvent({
          state,
          migrationJobId: input.migrationJobId,
          projectId: message.projectId,
          conversationId: message.conversationId,
          eventType: "backfill.context_snapshot.reconstructed",
          objectType: "context_snapshot",
          objectId: snapshot.id,
          actor: "system",
          timestamp: snapshot.createdAt,
          payload: {
            llm_call_id: llmCallId,
            source_message_id: message.id,
            reconstruction_quality: "partial",
            warning: "Original runtime context was not stored in legacy system."
          }
        }).state;
        reconstructedCount += 1;
      }

      state = createRecordIfNeeded({
        state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "message",
        sourceEntityId: message.id,
        targetEntityType: "context_snapshot",
        targetEntityId: snapshotId,
        backfillType: "context_snapshot.reconstructed",
        now
      });
    }

    state = WorkspaceObservabilityService.recordMetric({
      state,
      name: "migration_context_snapshots_reconstructed",
      value: reconstructedCount,
      conversationId: input.conversationId,
      now
    }).state;

    return {
      state,
      reconstructedCount
    };
  }

  static backfillEventLogs(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const conversation = state.mainConversations[input.conversationId];
    const project = state.projects[conversation.projectId];
    const projectEvent = createBackfilledEvent({
      state,
      migrationJobId: input.migrationJobId,
      projectId: project.id,
      eventType: "project.created",
      objectType: "project",
      objectId: project.id,
      timestamp: project.createdAt ?? now
    });
    state = projectEvent.state;
    const conversationEvent = createBackfilledEvent({
      state,
      migrationJobId: input.migrationJobId,
      projectId: project.id,
      conversationId: conversation.id,
      eventType: "conversation.created",
      objectType: "main_conversation",
      objectId: conversation.id,
      timestamp: conversation.createdAt ?? now
    });
    state = conversationEvent.state;

    for (const message of conversationMessages(state, conversation.id)) {
      state = createBackfilledEvent({
        state,
        migrationJobId: input.migrationJobId,
        projectId: message.projectId,
        conversationId: conversation.id,
        eventType:
          message.role === "user"
            ? "message.user.created"
            : "message.assistant.created",
        objectType: "message",
        objectId: message.id,
        actor: message.role === "assistant" ? "assistant" : "user",
        timestamp: message.createdAt,
        payload: {
          thread_type: message.threadType ?? "main",
          thread_id: message.threadId ?? conversation.id
        }
      }).state;
    }

    for (const version of sortByCreatedAt(
      Object.values(state.documentVersions).filter(
        (documentVersion) => documentVersion.conversationId === conversation.id
      )
    )) {
      state = createBackfilledEvent({
        state,
        migrationJobId: input.migrationJobId,
        projectId: version.projectId,
        conversationId: conversation.id,
        eventType: "document.version.created",
        objectType: "document_version",
        objectId: version.id,
        actor: "assistant",
        timestamp: version.createdAt,
        payload: {
          source_id: version.sourceId,
          version_number: version.versionNumber,
          content_hash: version.contentHash
        }
      }).state;
    }

    return {
      state
    };
  }

  static backfillTimeline(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const conversation = state.mainConversations[input.conversationId];
    const rootNodeId = `timeline-root-backfill-${safeIdPart(conversation.id)}`;
    const pathId = `timeline-path-backfill-${safeIdPart(conversation.id)}`;
    const rootEvent = createBackfilledEvent({
      state,
      migrationJobId: input.migrationJobId,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      eventType: "backfill.active_path.created",
      objectType: "timeline_path",
      objectId: pathId,
      timestamp: conversation.createdAt ?? now
    });
    state = rootEvent.state;

    if (!state.timelineNodes[rootNodeId]) {
      const root = createTimelineNode({
        state,
        migrationJobId: input.migrationJobId,
        projectId: conversation.projectId,
        conversationId: conversation.id,
        event: rootEvent.event,
        id: rootNodeId,
        targetObjectType: "timeline_path",
        targetObjectId: pathId,
        label: "Legacy project upgraded to revision workspace",
        memoryScope: "timeline",
        memoryEffect: "none",
        activePathId: pathId,
        timestamp: conversation.createdAt ?? now
      });
      state = root.state;
    }

    let previousNodeId = rootNodeId;
    const orderedMessages = conversationMessages(state, conversation.id);
    const orderedVersions = sortByCreatedAt(
      Object.values(state.documentVersions).filter(
        (documentVersion) => documentVersion.conversationId === conversation.id
      )
    );
    const versionsBySourceMessageId = new Map(
      orderedVersions
        .filter((version) => Boolean(version.sourceId))
        .map((version) => [version.sourceId!, version])
    );
    const appendedVersionIds = new Set<string>();

    const getMessageEvent = (message: MessageModel) => {
      const eventId = `event-backfill-${message.role === "user" ? "message_user_created" : "message_assistant_created"}-${safeIdPart(message.id)}`;
      const existing = state.eventLogs[eventId];

      if (existing) {
        return existing;
      }

      const created = createBackfilledEvent({
        state,
        migrationJobId: input.migrationJobId,
        projectId: message.projectId,
        conversationId: conversation.id,
        eventType:
          message.role === "user"
            ? "message.user.created"
            : "message.assistant.created",
        objectType: "message",
        objectId: message.id,
        actor: message.role === "assistant" ? "assistant" : "user",
        timestamp: message.createdAt
      });
      state = created.state;

      return created.event;
    };

    const getDocumentVersionEvent = (version: DocumentVersionModel) => {
      const eventId = `event-backfill-document_version_created-${safeIdPart(version.id)}`;
      const existing = state.eventLogs[eventId];

      if (existing) {
        return existing;
      }

      const created = createBackfilledEvent({
        state,
        migrationJobId: input.migrationJobId,
        projectId: version.projectId,
        conversationId: conversation.id,
        eventType: "document.version.created",
        objectType: "document_version",
        objectId: version.id,
        actor: "assistant",
        timestamp: version.createdAt
      });
      state = created.state;

      return created.event;
    };

    const appendDocumentVersionNode = (
      version: DocumentVersionModel,
      sourceNodeId: string
    ) => {
      const event = getDocumentVersionEvent(version);
      const nodeId = `timeline-document-version-backfill-${safeIdPart(version.id)}`;
      const node = createTimelineNode({
        state,
        migrationJobId: input.migrationJobId,
        projectId: version.projectId,
        conversationId: conversation.id,
        event,
        id: nodeId,
        parentNodeId: sourceNodeId,
        targetObjectType: "document_version",
        targetObjectId: version.id,
        label: "Document version created",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        activePathId: pathId,
        timestamp: version.createdAt,
        payload: {
          document_version_id: version.id,
          version_number: version.versionNumber,
          content_hash: version.contentHash,
          source_message_id: version.sourceId
        }
      });
      state = node.state;
      state = createTimelineEdge({
        state,
        migrationJobId: input.migrationJobId,
        projectId: version.projectId,
        id: `timeline-edge-backfill-${safeIdPart(sourceNodeId)}-${safeIdPart(nodeId)}`,
        sourceNodeId,
        targetNodeId: node.node.id,
        edgeType: "sequence",
        timestamp: version.createdAt,
        label: "answer to document"
      }).state;
      appendedVersionIds.add(version.id);

      return node.node.id;
    };

    for (const message of orderedMessages) {
      const event = getMessageEvent(message);
      const nodeId = `timeline-message-backfill-${safeIdPart(message.id)}`;
      const node = createTimelineNode({
        state,
        migrationJobId: input.migrationJobId,
        projectId: message.projectId,
        conversationId: conversation.id,
        event,
        id: nodeId,
        parentNodeId: previousNodeId,
        targetObjectType: "message",
        targetObjectId: message.id,
        label: message.role === "assistant" ? "Assistant answer" : "User message",
        memoryScope:
          message.threadType === "local" || message.threadType === "nested_local"
            ? "local_thread"
            : "conversation",
        memoryEffect:
          message.threadType === "local" || message.threadType === "nested_local"
            ? "local_only"
            : "included",
        activePathId: pathId,
        timestamp: message.createdAt,
        payload: {
          thread_type: message.threadType ?? "main",
          thread_id: message.threadId ?? conversation.id
        }
      });
      state = node.state;
      state = createTimelineEdge({
        state,
        migrationJobId: input.migrationJobId,
        projectId: message.projectId,
        id: `timeline-edge-backfill-${safeIdPart(previousNodeId)}-${safeIdPart(nodeId)}`,
        sourceNodeId: previousNodeId,
        targetNodeId: node.node.id,
        edgeType: "sequence",
        timestamp: message.createdAt
      }).state;
      previousNodeId = node.node.id;

      const version = message.role === "assistant"
        ? versionsBySourceMessageId.get(message.id)
        : undefined;

      if (version) {
        previousNodeId = appendDocumentVersionNode(version, previousNodeId);
      }
    }

    for (const version of orderedVersions.filter(
      (documentVersion) => !appendedVersionIds.has(documentVersion.id)
    )) {
      previousNodeId = appendDocumentVersionNode(version, previousNodeId);
    }

    const path: TimelinePathModel = {
      id: pathId,
      pathId,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      rootNodeId,
      baseNodeId: rootNodeId,
      headNodeId: previousNodeId,
      status: "active",
      createdAt: conversation.createdAt ?? now,
      updatedAt: now,
      metadata: {
        ...backfillMetadata(input.migrationJobId, conversation.id)
      }
    };
    state = {
      ...state,
      timelinePaths: {
        ...state.timelinePaths,
        [path.id]: state.timelinePaths[path.id] ?? path
      },
      mainConversations: {
        ...state.mainConversations,
        [conversation.id]: {
          ...state.mainConversations[conversation.id],
          activeTimelinePathId: path.id,
          activeTimelineNodeId: previousNodeId,
          updatedAt: now
        }
      },
      projects: {
        ...state.projects,
        [conversation.projectId]: {
          ...state.projects[conversation.projectId],
          activeTimelinePathId:
            state.projects[conversation.projectId]?.activeTimelinePathId ??
            path.id,
          activeTimelineNodeId:
            state.projects[conversation.projectId]?.activeTimelineNodeId ??
            previousNodeId,
          updatedAt: now
        }
      }
    };
    state = createRecordIfNeeded({
      state,
      migrationJobId: input.migrationJobId,
      sourceEntityType: "main_conversation",
      sourceEntityId: conversation.id,
      targetEntityType: "timeline_path",
      targetEntityId: path.id,
      backfillType: "timeline.active_path",
      now
    });
    state = WorkspaceObservabilityService.recordMetric({
      state,
      name: "migration_timeline_nodes_created",
      value: Object.values(state.timelineNodes).filter(
        (node) => node.activePathId === path.id
      ).length,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      now
    }).state;

    return {
      state
    };
  }

  static backfillLegacyLocalThreads(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const conversation = state.mainConversations[input.conversationId];
    const threads = Object.values(state.localThreads).filter(
      (thread) => thread.conversationId === input.conversationId
    );

    for (const thread of threads) {
      if (!state.textSelections[thread.sourceSelectionId]) {
        const sourceVersion =
          state.documentVersions[thread.sourceDocumentVersionId ?? ""] ??
          Object.values(state.documentVersions).find(
            (version) =>
              version.conversationId === input.conversationId &&
              version.status === "active"
          );
        const selectedText = thread.payload?.selected_text
          ? String(thread.payload.selected_text)
          : "";
        const sourceContent = sourceVersion?.content ?? "";
        const firstIndex = selectedText
          ? sourceContent.indexOf(selectedText)
          : -1;
        const lastIndex = selectedText
          ? sourceContent.lastIndexOf(selectedText)
          : -1;
        const anchorStatus =
          firstIndex >= 0 && firstIndex === lastIndex
            ? "active"
            : "needs_review";
        const selection: TextSelectionModel = {
          id: thread.sourceSelectionId,
          projectId: thread.projectId,
          conversationId: thread.conversationId,
          sourceType: sourceVersion ? "document_version" : "message",
          sourceId: sourceVersion?.id ?? thread.sourceSelectionId,
          sourceDocumentVersionId: sourceVersion?.id,
          selectedText: selectedText || "[legacy selection unavailable]",
          startOffset: firstIndex >= 0 ? firstIndex : 0,
          endOffset:
            firstIndex >= 0
              ? firstIndex + selectedText.length
              : selectedText.length,
          textHash: hashContent(selectedText || thread.id),
          anchorStatus,
          status: "active",
          createdAt: thread.createdAt,
          payload: {
            ...backfillMetadata(input.migrationJobId, thread.id),
            anchor_status: anchorStatus
          }
        };

        state = {
          ...state,
          textSelections: {
            ...state.textSelections,
            [selection.id]: selection
          }
        };

        if (anchorStatus === "needs_review") {
          state = MigrationTrackingService.createIssue({
            state,
            migrationJobId: input.migrationJobId,
            entityType: "local_thread",
            entityId: thread.id,
            severity: "warning",
            issueCode: "ambiguous_selection_anchor",
            message: "Legacy local thread selection could not be uniquely anchored.",
            now
          }).state;
        }
      }

      state = createRecordIfNeeded({
        state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "local_thread",
        sourceEntityId: thread.id,
        targetEntityType: "local_thread",
        targetEntityId: thread.id,
        backfillType: "legacy_local_thread",
        now
      });
    }

    if (!conversation) {
      return { state };
    }

    return {
      state
    };
  }

  static backfillLegacyAnnotations(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let state = input.state;
    const annotations = Object.values(state.annotations).filter(
      (annotation) => annotation.conversationId === input.conversationId
    );

    for (const annotation of annotations) {
      const scopeKnown = Boolean(annotation.scopeType && annotation.scopeId);
      const status = annotation.status ?? "active";
      const isDeleted = status === "deleted";
      const isDiscarded = status === "discarded";
      const updated: AnnotationModel = {
        ...annotation,
        sourceType: annotation.sourceType ?? "manual_note",
        status,
        memoryPolicy:
          isDeleted
            ? "never_include"
            : isDiscarded
              ? "excluded_by_default"
              : annotation.memoryPolicy ??
                (scopeKnown ? "auto_by_scope" : "manual_only"),
        includeInContext:
          isDeleted || isDiscarded
            ? false
            : annotation.includeInContext ?? scopeKnown,
        updatedAt: annotation.updatedAt ?? now,
        payload: {
          ...(annotation.payload ?? {}),
          ...backfillMetadata(input.migrationJobId, annotation.id),
          scope_inferred: !scopeKnown
        }
      };

      state = {
        ...state,
        annotations: {
          ...state.annotations,
          [annotation.id]: updated
        }
      };

      if (!scopeKnown) {
        state = MigrationTrackingService.createIssue({
          state,
          migrationJobId: input.migrationJobId,
          entityType: "annotation",
          entityId: annotation.id,
          severity: "warning",
          issueCode: "uncertain_annotation_scope",
          message: "Legacy annotation scope was inferred as manual_only.",
          now
        }).state;
      }

      state = createRecordIfNeeded({
        state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "annotation",
        sourceEntityId: annotation.id,
        targetEntityType: "annotation",
        targetEntityId: annotation.id,
        backfillType: "legacy_annotation",
        now
      });
    }

    return {
      state
    };
  }

  static backfillActivePath(input: {
    state: RevisionRepositoryState;
    conversationId: string;
    migrationJobId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const conversation = input.state.mainConversations[input.conversationId];
    const path =
      conversation.activeTimelinePathId &&
      input.state.timelinePaths[conversation.activeTimelinePathId];

    if (!path) {
      return WorkspaceBackfillService.backfillTimeline(input);
    }

    return {
      state: createRecordIfNeeded({
        state: input.state,
        migrationJobId: input.migrationJobId,
        sourceEntityType: "main_conversation",
        sourceEntityId: conversation.id,
        targetEntityType: "timeline_path",
        targetEntityId: path.id,
        backfillType: "active_path.ready",
        now
      })
    };
  }

  static markProjectRevisionWorkspaceReady(input: {
    state: RevisionRepositoryState;
    projectId: string;
    migrationJobId?: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const project = input.state.projects[input.projectId];

    if (!project) {
      return {
        state: input.state
      };
    }

    let state: RevisionRepositoryState = {
      ...input.state,
      projects: {
        ...input.state.projects,
        [project.id]: {
          ...project,
          revisionWorkspaceReady: true,
          migrationVersion: DEFAULT_MIGRATION_VERSION,
          updatedAt: now,
          payload: {
            ...(project.payload ?? {}),
            revision_workspace_ready: true
          }
        }
      }
    };

    if (input.migrationJobId) {
      state = MigrationTrackingService.finishJob({
        state,
        migrationJobId: input.migrationJobId,
        status: "completed",
        now
      });
    }

    state = WorkspaceObservabilityService.increment({
      state,
      name: "migration_projects_completed",
      projectId: project.id,
      now
    }).state;

    return {
      state
    };
  }
}
