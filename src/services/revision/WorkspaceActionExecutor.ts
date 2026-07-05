import type {
  ActionIdempotencyRecord,
  AnnotationSourceType,
  ComparisonExportType,
  MergeMode,
  MergeSourceType,
  RevisionObjectType,
  RevisionRepositoryState
} from "@/types/revision";
import type {
  ExecuteWorkspaceActionPayload,
  ExecuteWorkspaceActionResult,
  WorkspaceActionId,
  WorkspaceUser
} from "@/types/workspaceActions";
import { AnnotationService } from "./AnnotationService";
import {
  ActionGuardService,
  getActionTargetObject
} from "./ActionGuardService";
import { ComparisonService } from "./ComparisonService";
import { ContextSnapshotService } from "./ContextSnapshotService";
import { DiffService } from "./DiffService";
import { DocumentVersionService } from "./DocumentVersionService";
import { EventService } from "./EventService";
import { LocalThreadMessageService } from "./LocalThreadMessageService";
import { LocalThreadService } from "./LocalThreadService";
import { MainConversationRevisionService } from "./MainConversationRevisionService";
import { MergeService } from "./MergeService";
import { ObjectStateService } from "./ObjectStateService";
import { RevertService } from "./RevertService";
import { RevisionBranchService } from "./RevisionBranchService";
import { TimelineService } from "./TimelineService";
import { WorkspaceActionRegistry } from "./WorkspaceActionRegistry";

type HandlerResult = {
  state: RevisionRepositoryState;
  result: unknown;
  refreshHints?: string[];
  resultReference?: Record<string, unknown>;
};

function defaultSuffix(actionId: WorkspaceActionId) {
  return `${actionId.replaceAll(".", "-")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function idempotencyRecordId(key: string) {
  return `idempotency-${key}`;
}

function idempotencyRecord(input: {
  key: string;
  actionId: WorkspaceActionId;
  payload: ExecuteWorkspaceActionPayload;
  status: ActionIdempotencyRecord["status"];
  now: string;
  resultReference?: Record<string, unknown>;
  errorMessage?: string;
}): ActionIdempotencyRecord {
  return {
    id: idempotencyRecordId(input.key),
    idempotencyKey: input.key,
    projectId: input.payload.projectId ?? input.payload.target?.projectId,
    conversationId:
      input.payload.conversationId ?? input.payload.target?.conversationId,
    actionId: input.actionId,
    targetObjectType:
      input.payload.target?.objectType === "window"
        ? undefined
        : input.payload.target?.objectType,
    targetObjectId: input.payload.target?.objectId,
    status: input.status,
    resultReference: input.resultReference,
    errorMessage: input.errorMessage,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function completeIdempotency(
  state: RevisionRepositoryState,
  record: ActionIdempotencyRecord
) {
  return {
    ...state,
    actionIdempotencyRecords: {
      ...state.actionIdempotencyRecords,
      [record.id]: record
    }
  };
}

function activeDocumentVersionForPayload(
  state: RevisionRepositoryState,
  payload: ExecuteWorkspaceActionPayload
) {
  const projectId = payload.projectId ?? payload.target?.projectId;

  return projectId
    ? DocumentVersionService.getActiveDocumentVersion(
        state,
        projectId,
        payload.conversationId ?? payload.target?.conversationId
      )
    : undefined;
}

function textFromTarget(
  state: RevisionRepositoryState,
  objectType?: RevisionObjectType | "window",
  objectId?: string
) {
  if (!objectType || !objectId || objectType === "window") {
    return "";
  }

  const object = getActionTargetObject(state, {
    objectType,
    objectId
  }) as
    | {
        content?: string;
        draftContent?: string;
        selectedText?: string;
        summary?: string;
      }
    | undefined;

  return (
    object?.content ??
    object?.draftContent ??
    object?.selectedText ??
    object?.summary ??
    ""
  );
}

function mergeSourceTypeFromTarget(
  objectType?: RevisionObjectType | "window",
  objectId?: string,
  state?: RevisionRepositoryState
): MergeSourceType {
  if (objectType === "local_selection" && objectId && state) {
    const selection = state.localSelections[objectId];
    return selection?.sourceThreadType === "nested_local"
      ? "nested_local_selection"
      : "local_selection";
  }

  if (objectType === "message" && objectId && state) {
    const message = state.revisionMessages[objectId];
    return message?.threadType === "nested_local"
      ? "nested_local_answer"
      : "local_answer";
  }

  return "revision_branch";
}

function annotationScopeForTarget(
  target: ExecuteWorkspaceActionPayload["target"]
) {
  if (target?.objectType === "text_selection") {
    return {
      scopeType: "selected_text" as const,
      scopeId: target.objectId ?? ""
    };
  }

  if (target?.objectType === "local_thread") {
    return {
      scopeType: "local_thread" as const,
      scopeId: target.objectId ?? ""
    };
  }

  if (target?.objectType === "revision_branch") {
    return {
      scopeType: "branch" as const,
      scopeId: target.objectId ?? ""
    };
  }

  if (target?.objectType === "comparison_graph") {
    return {
      scopeType: "comparison" as const,
      scopeId: target.objectId ?? ""
    };
  }

  if (target?.objectType === "main_conversation") {
    return {
      scopeType: "conversation" as const,
      scopeId: target.objectId ?? ""
    };
  }

  return {
    scopeType: "project" as const,
    scopeId: target?.projectId ?? "default"
  };
}

function deletedSafeSnapshot(snapshot: ReturnType<typeof ContextSnapshotService.getContextSnapshot>) {
  if (!snapshot) {
    return snapshot;
  }

  return {
    ...snapshot,
    includedItems: snapshot.includedItems.filter(
      (item) => !item.reason.includes("deleted_memory_never_included")
    ),
    excludedItems: snapshot.excludedItems.map((item) =>
      item.reason.includes("deleted_memory_never_included")
        ? {
            ...item,
            text: ""
          }
        : item
    )
  };
}

function latestTimelineNodeForObject(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  objectId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === objectType && node.targetObjectId === objectId
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function handleAction(
  state: RevisionRepositoryState,
  actionId: WorkspaceActionId,
  payload: ExecuteWorkspaceActionPayload,
  user: WorkspaceUser,
  now: string,
  suffix: string
): HandlerResult {
  const target = payload.target;
  const projectId = payload.projectId ?? target?.projectId ?? "default";
  const conversationId =
    payload.conversationId ?? target?.conversationId ?? "conversation-main";

  if (actionId === "message.send") {
    const prompt = String(payload.prompt ?? payload.message ?? "");
    const answer = String(payload.answer ?? "Mock action response.");
    const model = String(payload.model ?? "gpt-5.5");

    if (target?.objectType === "local_thread" && target.objectId) {
      const localThread = state.localThreads[target.objectId];
      const activeDocumentVersion = activeDocumentVersionForPayload(state, payload);
      const started = LocalThreadMessageService.createStartedLocalSend({
        state,
        projectId,
        localThreadId: target.objectId,
        question: prompt,
        model,
        activeDocumentVersion,
        documentId: activeDocumentVersion?.documentId,
        now,
        suffix
      });
      const completed = LocalThreadMessageService.completeLocalSend({
        state: started.state,
        projectId,
        localThreadId: target.objectId,
        question: prompt,
        answer,
        model,
        provider: "mock",
        llmCallId: started.llmCallRecord.id,
        contextSnapshotId: started.contextSnapshot.id,
        userMessageId: started.userMessage.id,
        userTimelineNodeId: started.timelineNodes[0].id,
        now,
        suffix
      });

      return {
        state: completed.state,
        result: {
          userMessage: started.userMessage,
          assistantMessage: completed.assistantMessage,
          localThread
        },
        resultReference: {
          objectType: "message",
          objectId: completed.assistantMessage.id
        },
        refreshHints: ["messages", "timeline", "context"]
      };
    }

    const started = MainConversationRevisionService.createStartedMainSend({
      state,
      projectId,
      projectName: String(payload.projectName ?? "Default"),
      conversationId,
      prompt,
      model,
      documentId: String(payload.documentId ?? "doc-1"),
      activeDocumentVersion: activeDocumentVersionForPayload(state, payload),
      activeVersionNodeId: String(payload.activeVersionNodeId ?? ""),
      recentMessages: Object.values(state.revisionMessages).filter(
        (message) =>
          !conversationId || message.conversationId === conversationId
      ),
      now,
      suffix
    });
    const completed = MainConversationRevisionService.completeMainSend({
      state: started.state,
      projectId,
      conversationId,
      prompt,
      answer,
      model,
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now,
      suffix
    });

    return {
      state: completed.state,
      result: {
        userMessage: started.userMessage,
        assistantMessage: completed.assistantMessage
      },
      resultReference: {
        objectType: "message",
        objectId: completed.assistantMessage.id
      },
      refreshHints: ["messages", "timeline", "context"]
    };
  }

  if (actionId === "message.regenerate" && target?.objectId) {
    if (target.objectType === "comparison_run") {
      const run = state.comparisonRuns[target.objectId];
      const result = ComparisonService.regenerateComparison({
        state,
        comparisonId: run.comparisonId,
        model: String(payload.model ?? run.model ?? "gpt-5.5"),
        modelProvider: "mock",
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "comparison_run",
          objectId: result.run.id
        },
        refreshHints: ["comparison", "timeline", "context"]
      };
    }

    if (target.objectType === "message") {
      const sourceMessage = state.revisionMessages[target.objectId];
      const model = String(payload.model ?? sourceMessage.model ?? "gpt-5.5");
      const answer = String(
        payload.answer ??
          payload.content ??
          `Regenerated answer:\n\n${sourceMessage.content}`
      );
      const llmCallId = `llm-call-message-regenerate-${suffix}`;
      const regeneratedMessage = {
        ...sourceMessage,
        id: `rev-message-regenerated-${suffix}`,
        content: answer,
        status: "active" as const,
        includeInContext: true,
        model,
        llmCallId,
        createdAt: now,
        payload: {
          ...(sourceMessage.payload ?? {}),
          regeneratedFromMessageId: sourceMessage.id
        }
      };
      const supersededMessage = {
        ...sourceMessage,
        status: "superseded" as const,
        includeInContext: false,
        payload: {
          ...(sourceMessage.payload ?? {}),
          supersededByMessageId: regeneratedMessage.id
        }
      };
      const activeDocumentVersion = activeDocumentVersionForPayload(state, {
        ...payload,
        projectId: sourceMessage.projectId,
        conversationId: sourceMessage.conversationId
      });
      const recentMessages = Object.values(state.revisionMessages)
        .filter(
          (message) =>
            message.conversationId === sourceMessage.conversationId &&
            message.id !== sourceMessage.id
        )
        .concat(regeneratedMessage);
      const contextSnapshot = ContextSnapshotService.buildContextSnapshot({
        id: `context-snapshot-message-regenerate-${suffix}`,
        llmCallId,
        projectId: sourceMessage.projectId,
        callType: sourceMessage.threadId ? "local_window" : "main_conversation",
        purpose: sourceMessage.threadId ? "local_question" : "general_followup",
        model,
        sessionId: sourceMessage.conversationId,
        threadId: sourceMessage.threadId,
        threadType: sourceMessage.threadType ?? "main",
        activeDocumentVersion,
        documentVersions: Object.values(state.documentVersions).filter(
          (version) => version.projectId === sourceMessage.projectId
        ),
        manualEditDrafts: Object.values(state.manualEditDrafts).filter(
          (draft) => draft.projectId === sourceMessage.projectId
        ),
        recentMessages,
        annotations: Object.values(state.annotations).filter(
          (annotation) => annotation.projectId === sourceMessage.projectId
        ),
        localThreads: Object.values(state.localThreads).filter(
          (thread) => thread.projectId === sourceMessage.projectId
        ),
        revisionBranches: Object.values(state.revisionBranches).filter(
          (branch) => branch.projectId === sourceMessage.projectId
        ),
        mergeRecords: Object.values(state.mergeRecords).filter(
          (merge) => merge.projectId === sourceMessage.projectId
        ),
        comparisonGraphs: Object.values(state.comparisonGraphs).filter(
          (comparison) => comparison.projectId === sourceMessage.projectId
        ),
        comparisonRuns: Object.values(state.comparisonRuns).filter(
          (run) => run.projectId === sourceMessage.projectId
        ),
        timelineNodes: Object.values(state.timelineNodes).filter(
          (node) => node.projectId === sourceMessage.projectId
        ),
        createdAt: now
      });
      const startedCall = ContextSnapshotService.createStartedLLMCall({
        id: llmCallId,
        projectId: sourceMessage.projectId,
        callType: sourceMessage.threadId ? "local_window" : "main_conversation",
        purpose: sourceMessage.threadId ? "local_question" : "general_followup",
        model,
        prompt: String(payload.prompt ?? sourceMessage.content),
        contextSnapshotId: contextSnapshot.id,
        sessionId: sourceMessage.conversationId,
        threadId: sourceMessage.threadId,
        threadType: sourceMessage.threadType ?? "main",
        createdAt: now
      });
      const completedCall = {
        ...startedCall,
        provider: "mock" as const,
        status: "completed" as const,
        outputMessageId: regeneratedMessage.id,
        completedAt: now
      };
      const sourceNode = latestTimelineNodeForObject(
        state,
        "message",
        sourceMessage.id
      );
      const activePath = TimelineService.getActivePath(
        state,
        sourceMessage.projectId,
        sourceMessage.conversationId
      );
      const contextEventResult = EventService.createEvent(state, {
        id: `event-context-snapshot-message-regenerate-${suffix}`,
        projectId: sourceMessage.projectId,
        eventType: "context_snapshot.created",
        objectType: "context_snapshot",
        objectId: contextSnapshot.id,
        actor: "system",
        timestamp: now,
        payload: {
          actionId,
          llmCallId,
          sourceMessageId: sourceMessage.id
        }
      });
      const llmStartedEventResult = EventService.createEvent(
        {
          eventLogs: contextEventResult.eventLogs
        },
        {
          id: `event-llm-message-regenerate-started-${suffix}`,
          projectId: sourceMessage.projectId,
          eventType: "llm.call.started",
          objectType: "llm_call",
          objectId: llmCallId,
          actor: "system",
          timestamp: now,
          payload: {
            actionId,
            model,
            contextSnapshotId: contextSnapshot.id,
            sourceMessageId: sourceMessage.id
          }
        }
      );
      const llmCompletedEventResult = EventService.createEvent(
        {
          eventLogs: llmStartedEventResult.eventLogs
        },
        {
          id: `event-llm-message-regenerate-completed-${suffix}`,
          projectId: sourceMessage.projectId,
          eventType: "llm.call.completed",
          objectType: "llm_call",
          objectId: llmCallId,
          actor: "system",
          timestamp: now,
          payload: {
            actionId,
            model,
            outputMessageId: regeneratedMessage.id
          }
        }
      );
      const regeneratedEventResult = EventService.createEventWithTimelineNode(
        {
          ...state,
          eventLogs: llmCompletedEventResult.eventLogs
        },
        {
          id: `event-message-regenerated-${suffix}`,
          projectId: sourceMessage.projectId,
          eventType: "message.regenerated",
          objectType: "message",
          objectId: regeneratedMessage.id,
          actor: "assistant",
          timestamp: now,
          payload: {
            actionId,
            sourceMessageId: sourceMessage.id,
            regeneratedMessageId: regeneratedMessage.id,
            llmCallId,
            contextSnapshotId: contextSnapshot.id,
            previous_status: sourceMessage.status,
            new_status: "active"
          }
        },
        {
          id: `timeline-message-regenerated-${suffix}`,
          conversationId: sourceMessage.conversationId,
          parentNodeId: sourceNode?.id,
          label: "Regenerated answer",
          model,
          memoryScope: sourceMessage.memoryScope,
          memoryEffect:
            sourceMessage.memoryScope === "conversation"
              ? "included"
              : "local_only",
          activePathId: activePath?.id,
          createdContentRef: regeneratedMessage.id,
          affectedContextRefs: [contextSnapshot.id],
          payload: {
            action_id: actionId,
            source_message_id: sourceMessage.id,
            regenerated_message_id: regeneratedMessage.id,
            llm_call_id: llmCallId,
            context_snapshot_id: contextSnapshot.id,
            memory_effect:
              sourceMessage.memoryScope === "conversation"
                ? "included"
                : "local_only"
          }
        },
        sourceNode
          ? {
              id: `timeline-edge-${sourceNode.id}-timeline-message-regenerated-${suffix}`,
              sourceNodeId: sourceNode.id,
              edgeType: "supersede",
              label: "regenerate"
            }
          : undefined
      );
      const project = state.projects[sourceMessage.projectId];
      const conversation = state.mainConversations[sourceMessage.conversationId];
      const localThread = sourceMessage.threadId
        ? state.localThreads[sourceMessage.threadId]
        : undefined;
      const nextState: RevisionRepositoryState = {
        ...state,
        projects: project
          ? {
              ...state.projects,
              [project.id]: {
                ...project,
                activeTimelineNodeId: regeneratedEventResult.timelineNode.id,
                updatedAt: now
              }
            }
          : state.projects,
        mainConversations: conversation
          ? {
              ...state.mainConversations,
              [conversation.id]: {
                ...conversation,
                activeTimelineNodeId: regeneratedEventResult.timelineNode.id,
                updatedAt: now
              }
            }
          : state.mainConversations,
        localThreads: localThread
          ? {
              ...state.localThreads,
              [localThread.id]: {
                ...localThread,
                updatedAt: now
              }
            }
          : state.localThreads,
        revisionMessages: {
          ...state.revisionMessages,
          [sourceMessage.id]: supersededMessage,
          [regeneratedMessage.id]: regeneratedMessage
        },
        contextSnapshots: {
          ...state.contextSnapshots,
          [contextSnapshot.id]: contextSnapshot
        },
        llmCallRecords: {
          ...state.llmCallRecords,
          [completedCall.id]: completedCall
        },
        eventLogs: regeneratedEventResult.eventLogs,
        timelineNodes: regeneratedEventResult.timelineNodes,
        timelineEdges: regeneratedEventResult.timelineEdges
      };

      if (activePath) {
        nextState.timelinePaths = {
          ...nextState.timelinePaths,
          [activePath.id]: {
            ...activePath,
            headNodeId: regeneratedEventResult.timelineNode.id,
            updatedAt: now
          }
        };
      }

      return {
        state: nextState,
        result: {
          sourceMessage: supersededMessage,
          regeneratedMessage,
          llmCallRecord: completedCall,
          contextSnapshot
        },
        resultReference: {
          objectType: "message",
          objectId: regeneratedMessage.id
        },
        refreshHints: ["messages", "timeline", "context"]
      };
    }
  }

  if (actionId === "revise.open") {
    if (target?.objectType === "local_selection" && target.objectId) {
      const result = LocalThreadService.getOrCreateNestedLocalThreadForLocalSelection({
        state,
        projectId,
        localSelectionId: target.objectId,
        conversationId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "local_thread",
          objectId: result.localThread.id
        },
        refreshHints: ["local_threads", "timeline"]
      };
    }

    if (target?.objectType === "text_selection" && target.objectId) {
      const result = LocalThreadService.getOrCreateLocalThreadForSelection({
        state,
        projectId,
        selectionId: target.objectId,
        conversationId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "local_thread",
          objectId: result.localThread.id
        },
        refreshHints: ["local_threads", "timeline"]
      };
    }
  }

  if (actionId === "branch.create" && target?.objectType === "local_selection" && target.objectId) {
    const result = RevisionBranchService.createBranchFromLocalSelection({
      state,
      projectId,
      localSelectionId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "revision_branch",
        objectId: result.branch.id
      },
      refreshHints: ["branches", "timeline"]
    };
  }

  if (actionId === "annotation.add_context_note") {
    const scope = annotationScopeForTarget(target);
    const result = AnnotationService.createAnnotationFromManualNote({
      state,
      projectId,
      conversationId,
      content: String(payload.content ?? payload.note ?? ""),
      title: payload.title ? String(payload.title) : undefined,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      sourceType: "manual_note",
      sourceId: target?.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "annotation",
        objectId: result.annotation.id
      },
      refreshHints: ["annotations", "context", "timeline"]
    };
  }

  if (actionId === "annotation.keep_as_note" && target?.objectId) {
    if (target.objectType === "comparison_run") {
      const result = ComparisonService.keepSummaryAsNote({
        state,
        comparisonRunId: target.objectId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "annotation",
          objectId: result.annotation.id
        },
        refreshHints: ["annotations", "timeline"]
      };
    }

    if (target.objectType === "local_selection") {
      const selection = state.localSelections[target.objectId];
      const result = AnnotationService.createAnnotationFromLocalSelection({
        state,
        projectId,
        conversationId: selection.conversationId ?? conversationId,
        content: selection.selectedText,
        scopeType: selection.parentSelectionId
          ? "selected_text"
          : "local_thread",
        scopeId: selection.parentSelectionId ?? selection.sourceLocalThreadId,
        sourceId: selection.id,
        sourceText: selection.selectedText,
        sourceLocalSelectionId: selection.id,
        sourceLocalThreadId: selection.sourceLocalThreadId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "annotation",
          objectId: result.annotation.id
        },
        refreshHints: ["annotations", "timeline"]
      };
    }

    const content = textFromTarget(state, target.objectType, target.objectId);
    const explicitScope =
      payload.scopeType && payload.scopeId
        ? {
            scopeType: payload.scopeType as ReturnType<
              typeof annotationScopeForTarget
            >["scopeType"],
            scopeId: String(payload.scopeId)
          }
        : undefined;
    const scope = explicitScope ?? annotationScopeForTarget(target);
    const result = AnnotationService.createAnnotationFromAnswer({
      state,
      projectId,
      conversationId,
      content,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      sourceId: target.objectId,
      sourceText: payload.sourceText ? String(payload.sourceText) : content,
      sourceMessageId: target.objectType === "message" ? target.objectId : undefined,
      sourceSelectionId: payload.sourceSelectionId
        ? String(payload.sourceSelectionId)
        : undefined,
      sourceLocalSelectionId: payload.sourceLocalSelectionId
        ? String(payload.sourceLocalSelectionId)
        : undefined,
      sourceLocalThreadId: payload.sourceLocalThreadId
        ? String(payload.sourceLocalThreadId)
        : undefined,
      sourceBranchId:
        target.objectType === "revision_branch" ? target.objectId : undefined,
      sourceTimelineNodeId: payload.sourceTimelineNodeId
        ? String(payload.sourceTimelineNodeId)
        : undefined,
      sourceType:
        payload.sourceType &&
        [
          "local_answer",
          "nested_local_answer",
          "branch_draft",
          "keep_as_note",
          "assistant_answer"
        ].includes(String(payload.sourceType))
          ? (payload.sourceType as AnnotationSourceType & (
              | "local_answer"
              | "nested_local_answer"
              | "branch_draft"
              | "keep_as_note"
              | "assistant_answer"
            ))
          : target.objectType === "revision_branch"
            ? "branch_draft"
            : "assistant_answer",
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "annotation",
        objectId: result.annotation.id
      },
      refreshHints: ["annotations", "timeline"]
    };
  }

  if (actionId === "merge.into_document" && target?.objectId) {
    if (target.objectType === "merge_record") {
      const record = state.mergeRecords[target.objectId];

      if (!payload.diffAccepted) {
        const diff = record.diff ?? record.diffSummary;

        return {
          state,
          result: {
            mergeRecord: record
          },
          refreshHints: ["merge"],
          resultReference: {
            objectType: "merge_record",
            objectId: record.id,
            diff
          }
        };
      }

      const result = MergeService.confirmMerge({
        state,
        mergeId: target.objectId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: result.ok ? "document_version" : "merge_record",
          objectId: result.ok ? result.documentVersion.id : result.mergeRecord.id
        },
        refreshHints: ["document_versions", "timeline", "context"]
      };
    }

    const sourceType = mergeSourceTypeFromTarget(
      target.objectType,
      target.objectId,
      state
    );
    const proposal = MergeService.createMergeProposal({
      state,
      projectId,
      conversationId,
      sourceType,
      sourceId: target.objectId,
      mergeMode: (payload.mergeMode as MergeMode | undefined) ?? "replace_selection",
      manualTargetRange: payload.manualTargetRange as
        | { start: number; end: number; selectionId?: string }
        | undefined,
      now,
      suffix
    });

    if (!payload.diffAccepted || proposal.mergeRecord.status !== "diff_ready") {
      return {
        state: proposal.state,
        result: proposal,
        resultReference: {
          objectType: "merge_record",
          objectId: proposal.mergeRecord.id
        },
        refreshHints: ["merge", "timeline"]
      };
    }

    const confirmed = MergeService.confirmMerge({
      state: proposal.state,
      mergeId: proposal.mergeRecord.id,
      now,
      suffix: `${suffix}-confirm`
    });

    return {
      state: confirmed.state,
      result: confirmed,
      resultReference: {
        objectType: confirmed.ok ? "document_version" : "merge_record",
        objectId: confirmed.ok
          ? confirmed.documentVersion.id
          : confirmed.mergeRecord.id
      },
      refreshHints: ["document_versions", "timeline", "context"]
    };
  }

  if (actionId === "merge.cancel" && target?.objectType === "merge_record" && target.objectId) {
    const result = MergeService.cancelMerge({
      state,
      mergeId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "merge_record",
        objectId: result.mergeRecord.id
      },
      refreshHints: ["merge", "timeline", "context"]
    };
  }

  if (actionId === "object.discard" && target?.objectType && target.objectId) {
    const result = ObjectStateService.discardObject({
      state,
      objectType: target.objectType as RevisionObjectType,
      objectId: target.objectId,
      reason: String(payload.reason ?? "action_discard"),
      actorType: "user",
      actorId: user.id,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: target.objectType,
        objectId: target.objectId
      },
      refreshHints: ["state", "timeline", "context"]
    };
  }

  if (actionId === "object.delete" && target?.objectType && target.objectId) {
    if (target.objectType === "comparison_graph") {
      const result = ComparisonService.deleteComparison({
        state,
        comparisonId: target.objectId,
        confirmed: true,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: target.objectType,
          objectId: target.objectId
        },
        refreshHints: ["state", "timeline", "context", "comparison"]
      };
    }

    const result = ObjectStateService.deleteObject({
      state,
      objectType: target.objectType as RevisionObjectType,
      objectId: target.objectId,
      reason: String(payload.reason ?? "action_delete"),
      confirmed: true,
      actorType: "user",
      actorId: user.id,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: target.objectType,
        objectId: target.objectId
      },
      refreshHints: ["state", "timeline", "context"]
    };
  }

  if (actionId === "object.restore" && target?.objectType && target.objectId) {
    const result = ObjectStateService.restoreObject({
      state,
      objectType: target.objectType as RevisionObjectType,
      objectId: target.objectId,
      reason: String(payload.reason ?? "action_restore"),
      actorType: "user",
      actorId: user.id,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: target.objectType,
        objectId: target.objectId
      },
      refreshHints: ["state", "timeline", "context"]
    };
  }

  if (actionId === "comparison.regenerate" && target?.objectType === "comparison_graph" && target.objectId) {
    const result = ComparisonService.regenerateComparison({
      state,
      comparisonId: target.objectId,
      model: String(payload.model ?? "gpt-5.5"),
      modelProvider: "mock",
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "comparison_run",
        objectId: result.run.id
      },
      refreshHints: ["comparison", "timeline", "context"]
    };
  }

  if (actionId === "comparison.clear" && target?.objectType === "comparison_graph" && target.objectId) {
    const result = ComparisonService.clearComparison({
      state,
      comparisonId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "comparison_graph",
        objectId: result.comparison.id
      },
      refreshHints: ["comparison", "timeline", "context"]
    };
  }

  if (actionId === "map.export" && target?.objectType === "comparison_graph" && target.objectId) {
    const result = ComparisonService.exportComparison({
      state,
      comparisonId: target.objectId,
      exportType: (payload.exportType as ComparisonExportType | undefined) ?? "markdown",
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "comparison_export",
        objectId: result.export.id
      },
      refreshHints: ["comparison_exports", "timeline"]
    };
  }

  if (actionId === "timeline.revert_to_node" && target?.objectType === "timeline_node" && target.objectId) {
    if (!payload.diffAccepted) {
      const preview = RevertService.recordRevertPreview({
        state,
        projectId,
        conversationId,
        targetNodeId: target.objectId,
        now,
        suffix
      });

      return {
        state: preview.state,
        result: preview,
        resultReference: {
          objectType: "timeline_node",
          objectId: target.objectId,
          diff: preview.preview.documentDiff
        },
        refreshHints: ["timeline"]
      };
    }

    const result = RevertService.confirmRevert({
      state,
      projectId,
      conversationId,
      targetNodeId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "revert_record",
        objectId: result.revertRecord.id
      },
      refreshHints: ["timeline", "document_versions", "context"]
    };
  }

  if (actionId === "document.edit") {
    const result = DocumentVersionService.createManualEditDraft({
      state,
      projectId,
      conversationId,
      baseDocumentVersionId: target?.objectId,
      draftContent: payload.content ? String(payload.content) : undefined,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "manual_edit_draft",
        objectId: result.draft.id
      },
      refreshHints: ["document_edit", "timeline"]
    };
  }

  if (actionId === "document.preview_diff" && target?.objectType === "manual_edit_draft" && target.objectId) {
    const result = DocumentVersionService.generateDiffForDraft({
      state,
      draftId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "manual_edit_draft",
        objectId: result.draft.id,
        diff: result.diff
      },
      refreshHints: ["diff", "timeline"]
    };
  }

  if (actionId === "document.confirm_edit" && target?.objectType === "manual_edit_draft" && target.objectId) {
    if (!payload.diffAccepted) {
      const result = DocumentVersionService.generateDiffForDraft({
        state,
        draftId: target.objectId,
        now,
        suffix
      });

      return {
        state: result.state,
        result,
        resultReference: {
          objectType: "manual_edit_draft",
          objectId: result.draft.id,
          diff: result.diff
        },
        refreshHints: ["diff", "timeline"]
      };
    }

    const result = DocumentVersionService.confirmManualEdit({
      state,
      draftId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.ok ? result.state : state,
      result,
      resultReference: {
        objectType: result.ok ? "document_version" : "manual_edit_draft",
        objectId: result.ok ? result.documentVersion.id : target.objectId
      },
      refreshHints: ["document_versions", "timeline", "context"]
    };
  }

  if (actionId === "document.cancel_edit" && target?.objectType === "manual_edit_draft" && target.objectId) {
    const result = DocumentVersionService.cancelManualEditDraft({
      state,
      draftId: target.objectId,
      now,
      suffix
    });

    return {
      state: result.state,
      result,
      resultReference: {
        objectType: "manual_edit_draft",
        objectId: result.draft.id
      },
      refreshHints: ["document_edit", "timeline"]
    };
  }

  if (actionId === "context.preview") {
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: `llm-call-preview-${suffix}`,
      projectId,
      callType: "main_conversation",
      purpose: "general_followup",
      model: String(payload.model ?? "gpt-5.5"),
      activeDocumentVersion: activeDocumentVersionForPayload(state, payload),
      recentMessages: Object.values(state.revisionMessages),
      annotations: Object.values(state.annotations),
      localThreads: Object.values(state.localThreads),
      revisionBranches: Object.values(state.revisionBranches),
      mergeRecords: Object.values(state.mergeRecords),
      comparisonGraphs: Object.values(state.comparisonGraphs),
      comparisonRuns: Object.values(state.comparisonRuns)
    });

    return {
      state,
      result: snapshot,
      refreshHints: []
    };
  }

  if (actionId === "context.review") {
    const snapshot =
      target?.objectType === "context_snapshot" && target.objectId
        ? state.contextSnapshots[target.objectId]
        : target?.objectType === "llm_call" && target.objectId
          ? ContextSnapshotService.getContextSnapshot(state, target.objectId)
          : undefined;

    return {
      state,
      result: deletedSafeSnapshot(snapshot),
      refreshHints: []
    };
  }

  if (actionId === "diff.view" && target?.objectId) {
    if (target.objectType === "manual_edit_draft") {
      const draft = state.manualEditDrafts[target.objectId];
      const base = draft
        ? state.documentVersions[draft.baseDocumentVersionId]
        : undefined;

      return {
        state,
        result: base
          ? DiffService.createTextDiff(base.content, draft.draftContent)
          : undefined,
        refreshHints: []
      };
    }

    if (target.objectType === "document_version") {
      const toVersionId = String(payload.toVersionId ?? "");
      return {
        state,
        result: toVersionId
          ? DocumentVersionService.compareDocumentVersions({
              state,
              fromVersionId: target.objectId,
              toVersionId
            })
          : undefined,
        refreshHints: []
      };
    }
  }

  if (
    actionId === "window.minimize" ||
    actionId === "window.close" ||
    actionId === "note.open_editor" ||
    actionId === "thread.new" ||
    actionId === "project.new" ||
    actionId === "related_thread.open"
  ) {
    return {
      state,
      result: {
        actionId,
        target,
        historyMode: target?.status === "inactive"
      },
      refreshHints: []
    };
  }

  throw new Error(`Action handler not implemented: ${actionId}`);
}

function resultRequiresDiff(
  actionId: WorkspaceActionId,
  handlerResult: HandlerResult,
  payload: ExecuteWorkspaceActionPayload
) {
  return (
    !payload.diffAccepted &&
    ["merge.into_document", "timeline.revert_to_node", "document.confirm_edit"].includes(
      actionId
    )
  );
}

export function executeWorkspaceAction(
  state: RevisionRepositoryState,
  actionId: WorkspaceActionId,
  payload: ExecuteWorkspaceActionPayload = {},
  user: WorkspaceUser = {
    id: "user",
    role: "owner",
    permissions: "*"
  }
): ExecuteWorkspaceActionResult {
  const definition = WorkspaceActionRegistry.getAction(actionId);
  const now = payload.now ?? new Date().toISOString();
  const suffix = payload.suffix ?? defaultSuffix(actionId);
  const key = payload.idempotencyKey;

  if (!definition) {
    return {
      status: "error",
      actionId,
      error: "unknown_action",
      rolledBack: true,
      state
    };
  }

  if (key) {
    const existing = state.actionIdempotencyRecords[idempotencyRecordId(key)];

    if (existing?.status === "completed") {
      return {
        status: "success",
        actionId,
        result: existing.resultReference,
        refreshHints: ["idempotent_previous_result"],
        stateChanged: false,
        state
      };
    }

    if (existing?.status === "in_progress") {
      return {
        status: "in_progress",
        actionId,
        resultReference: existing.resultReference
      };
    }
  }

  const guard = ActionGuardService.canRunAction(
    actionId,
    payload.target,
    user,
    state
  );

  if (!guard.ok) {
    return {
      status: "blocked",
      actionId,
      reason: guard.reason ?? "action_blocked"
    };
  }

  if (definition.requiresConfirmation && !payload.confirmed) {
    const confirmation = ActionGuardService.getRequiredConfirmation(
      actionId,
      payload.target
    );

    return {
      status: "confirmation_required",
      actionId,
      confirmation: confirmation!
    };
  }

  const stateWithInProgress =
    key && definition.mutatesData
      ? completeIdempotency(
          state,
          idempotencyRecord({
            key,
            actionId,
            payload,
            status: "in_progress",
            now
          })
        )
      : state;

  try {
    const handlerResult = handleAction(
      stateWithInProgress,
      actionId,
      payload,
      user,
      now,
      suffix
    );

    if (resultRequiresDiff(actionId, handlerResult, payload)) {
      const diff = ActionGuardService.getRequiredDiffReview(actionId)!;

      return {
        status: "diff_required",
        actionId,
        diff: {
          ...diff,
          diff: (handlerResult.resultReference?.diff ??
            (handlerResult.result as { diff?: unknown })?.diff) as unknown
        },
        result: handlerResult.result,
        state: handlerResult.state
      };
    }

    const completedState =
      key && definition.mutatesData
        ? completeIdempotency(
            handlerResult.state,
            idempotencyRecord({
              key,
              actionId,
              payload,
              status: "completed",
              now,
              resultReference: handlerResult.resultReference
            })
          )
        : handlerResult.state;

    return {
      status: "success",
      actionId,
      result: handlerResult.result,
      refreshHints: handlerResult.refreshHints ?? [],
      stateChanged: definition.mutatesData,
      state: completedState
    };
  } catch (error) {
    return {
      status: "error",
      actionId,
      error: error instanceof Error ? error.message : "unknown_action_error",
      rolledBack: true,
      state
    };
  }
}
