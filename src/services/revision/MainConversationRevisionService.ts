import type { ContextSnapshot, LLMCallRecord } from "@/types/context";
import type {
  DocumentVersionModel,
  EventLogRecord,
  MainConversationModel,
  MessageModel,
  ProjectModel,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode
} from "@/types/revision";
import { ContextSnapshotService } from "./ContextSnapshotService";
import { DocumentVersionService } from "./DocumentVersionService";
import { EventService } from "./EventService";
import { TimelineService } from "./TimelineService";

type CreateStartedMainSendInput = {
  state: RevisionRepositoryState;
  projectId: string;
  projectName?: string;
  conversationId: string;
  conversationTitle?: string;
  prompt: string;
  model: string;
  documentId?: string;
  activeDocumentVersion?: DocumentVersionModel;
  activeVersionNodeId?: string;
  recentMessages?: MessageModel[];
  now: string;
  suffix: string;
};

type CompleteMainSendInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId: string;
  prompt: string;
  answer: string;
  model: string;
  provider?: "openai" | "mock";
  llmCallId: string;
  contextSnapshotId: string;
  userMessageId: string;
  userTimelineNodeId: string;
  documentId?: string;
  documentTitle?: string;
  documentContent?: string;
  now: string;
  suffix: string;
};

function activeProject(projectId: string, name: string | undefined, now: string): ProjectModel {
  return {
    id: projectId,
    name: name ?? "Default",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function activeConversation(
  projectId: string,
  conversationId: string,
  title: string | undefined,
  now: string
): MainConversationModel {
  return {
    id: conversationId,
    projectId,
    title: title ?? "Main Conversation",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

export class MainConversationRevisionService {
  static createStartedMainSend(input: CreateStartedMainSendInput): {
    state: RevisionRepositoryState;
    project: ProjectModel;
    conversation: MainConversationModel;
    userMessage: MessageModel;
    contextSnapshot: ContextSnapshot;
    llmCallRecord: LLMCallRecord;
    events: EventLogRecord[];
    timelineNodes: RevisionTimelineNode[];
    timelineEdges: RevisionTimelineEdge[];
  } {
    const project =
      input.state.projects[input.projectId] ??
      activeProject(input.projectId, input.projectName, input.now);
    const conversation =
      input.state.mainConversations[input.conversationId] ??
      activeConversation(
        input.projectId,
        input.conversationId,
        input.conversationTitle,
        input.now
      );
    const userMessage: MessageModel = {
      id: `rev-message-user-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: "user",
      content: input.prompt,
      status: "active",
      memoryScope: "conversation",
      includeInContext: true,
      createdAt: input.now
    };
    const activePathNodes = TimelineService.getActivePathNodes(
      input.state,
      input.projectId,
      input.conversationId
    );
    const activePathMessageIds = new Set(
      activePathNodes
        .filter((node) => node.targetObjectType === "message")
        .map((node) => node.targetObjectId)
    );
    const recentMessagesForContext =
      activePathNodes.length > 0
        ? (input.recentMessages ?? []).filter((message) =>
            activePathMessageIds.has(message.id)
          )
        : input.recentMessages ?? [];
    const llmCallId = `llm-call-${input.suffix}`;
    const contextSnapshot = ContextSnapshotService.buildContextSnapshot({
      id: `context-snapshot-${input.suffix}`,
      llmCallId,
      projectId: input.projectId,
      callType: "main_conversation",
      purpose: "general_followup",
      model: input.model,
      sessionId: input.conversationId,
      documentId: input.documentId,
      activeVersionNodeId: input.activeVersionNodeId,
      activeDocumentVersion: input.activeDocumentVersion,
      documentVersions: Object.values(input.state.documentVersions).filter(
        (version) => version.projectId === input.projectId
      ),
      manualEditDrafts: Object.values(input.state.manualEditDrafts).filter(
        (draft) => draft.projectId === input.projectId
      ),
      recentMessages: [...recentMessagesForContext, userMessage],
      annotations: Object.values(input.state.annotations).filter(
        (annotation) => annotation.projectId === input.projectId
      ),
      localThreads: Object.values(input.state.localThreads).filter(
        (thread) => thread.projectId === input.projectId
      ),
      revisionBranches: Object.values(input.state.revisionBranches).filter(
        (branch) => branch.projectId === input.projectId
      ),
      mergeRecords: Object.values(input.state.mergeRecords).filter(
        (merge) => merge.projectId === input.projectId
      ),
      comparisonGraphs: Object.values(input.state.comparisonGraphs).filter(
        (comparison) => comparison.projectId === input.projectId
      ),
      comparisonRuns: Object.values(input.state.comparisonRuns).filter(
        (run) => run.projectId === input.projectId
      ),
      timelineNodes: Object.values(input.state.timelineNodes).filter(
        (node) => node.projectId === input.projectId
      ),
      createdAt: input.now
    });
    const llmCallRecord = ContextSnapshotService.createStartedLLMCall({
      id: llmCallId,
      projectId: input.projectId,
      callType: "main_conversation",
      purpose: "general_followup",
      model: input.model,
      prompt: input.prompt,
      contextSnapshotId: contextSnapshot.id,
      sessionId: input.conversationId,
      documentId: input.documentId,
      activeVersionNodeId: input.activeVersionNodeId,
      createdAt: input.now
    });
    const activePath = TimelineService.getActivePath(
      input.state,
      input.projectId,
      input.conversationId
    );
    const activeParentTimelineNode = TimelineService.getActiveTimelineNode(
      input.state,
      input.projectId,
      input.conversationId
    );
    const userEventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-message-user-${input.suffix}`,
        projectId: input.projectId,
        eventType: "message.user.created",
        objectType: "message",
        objectId: userMessage.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          conversationId: input.conversationId
        }
      },
      {
        id: `timeline-user-${input.suffix}`,
        conversationId: input.conversationId,
        parentNodeId: activeParentTimelineNode?.id,
        label: "User message",
        memoryScope: "conversation",
        memoryEffect: "included",
        activePathId: activePath?.id,
        createdContentRef: userMessage.id
      },
      activeParentTimelineNode
        ? {
            id: `timeline-edge-${activeParentTimelineNode.id}-timeline-user-${input.suffix}`,
            sourceNodeId: activeParentTimelineNode.id,
            edgeType: activePath ? "continuation" : "sequence"
          }
        : undefined
    );
    const contextEventResult = EventService.createEvent(userEventResult, {
      id: `event-context-snapshot-${input.suffix}`,
      projectId: input.projectId,
      eventType: "context_snapshot.created",
      objectType: "context_snapshot",
      objectId: contextSnapshot.id,
      actor: "system",
      timestamp: input.now,
      payload: {
        llmCallId
      }
    });
    const llmStartedEventResult = EventService.createEvent(
      {
        eventLogs: contextEventResult.eventLogs
      },
      {
        id: `event-llm-started-${input.suffix}`,
        projectId: input.projectId,
        eventType: "llm.call.started",
        objectType: "llm_call",
        objectId: llmCallId,
        actor: "system",
        timestamp: input.now,
        payload: {
          model: input.model,
          contextSnapshotId: contextSnapshot.id
        }
      }
    );
    const nextState: RevisionRepositoryState = {
      ...input.state,
      projects: {
        ...input.state.projects,
        [project.id]: {
          ...project,
          activeTimelineNodeId: userEventResult.timelineNode.id,
          activeTimelinePathId: activePath?.id ?? project.activeTimelinePathId,
          updatedAt: input.now
        }
      },
      mainConversations: {
        ...input.state.mainConversations,
        [conversation.id]: {
          ...conversation,
          updatedAt: input.now,
          activeTimelineNodeId: userEventResult.timelineNode.id,
          activeTimelinePathId:
            activePath?.id ?? conversation.activeTimelinePathId
        }
      },
      revisionMessages: {
        ...input.state.revisionMessages,
        [userMessage.id]: userMessage
      },
      contextSnapshots: {
        ...input.state.contextSnapshots,
        [contextSnapshot.id]: contextSnapshot
      },
      llmCallRecords: {
        ...input.state.llmCallRecords,
        [llmCallRecord.id]: llmCallRecord
      },
      eventLogs: llmStartedEventResult.eventLogs,
      timelineNodes: userEventResult.timelineNodes,
      timelineEdges: userEventResult.timelineEdges
    };

    if (activePath) {
      nextState.timelinePaths = {
        ...nextState.timelinePaths,
        [activePath.id]: {
          ...activePath,
          headNodeId: userEventResult.timelineNode.id,
          updatedAt: input.now
        }
      };
    }

    return {
      state: nextState,
      project,
      conversation,
      userMessage,
      contextSnapshot,
      llmCallRecord,
      events: [
        userEventResult.event,
        contextEventResult.event,
        llmStartedEventResult.event
      ],
      timelineNodes: [userEventResult.timelineNode],
      timelineEdges: userEventResult.timelineEdge
        ? [userEventResult.timelineEdge]
        : []
    };
  }

  static completeMainSend(input: CompleteMainSendInput): {
    state: RevisionRepositoryState;
    assistantMessage: MessageModel;
    llmCallRecord: LLMCallRecord;
    documentVersion?: DocumentVersionModel;
    events: EventLogRecord[];
    timelineNodes: RevisionTimelineNode[];
    timelineEdges: RevisionTimelineEdge[];
  } {
    const assistantMessage: MessageModel = {
      id: `rev-message-assistant-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.answer,
      status: "active",
      memoryScope: "conversation",
      includeInContext: true,
      model: input.model,
      createdAt: input.now
    };
    const previousCall = input.state.llmCallRecords[input.llmCallId];
    const llmCallRecord: LLMCallRecord = {
      ...previousCall,
      id: input.llmCallId,
      projectId: input.projectId,
      callType: previousCall?.callType ?? "main_conversation",
      purpose: previousCall?.purpose ?? "general_followup",
      model: input.model,
      provider: input.provider,
      status: "completed",
      prompt: previousCall?.prompt ?? input.prompt,
      contextSnapshotId: input.contextSnapshotId,
      sessionId: previousCall?.sessionId ?? input.conversationId,
      outputMessageId: assistantMessage.id,
      createdAt: previousCall?.createdAt ?? input.now,
      completedAt: input.now
    };
    const completedEventResult = EventService.createEvent(input.state, {
      id: `event-llm-completed-${input.suffix}`,
      projectId: input.projectId,
      eventType: "llm.call.completed",
      objectType: "llm_call",
      objectId: input.llmCallId,
      actor: "system",
      timestamp: input.now,
      payload: {
        model: input.model,
        provider: input.provider,
        outputMessageId: assistantMessage.id
      }
    });
    const activePath = TimelineService.getActivePath(
      input.state,
      input.projectId,
      input.conversationId
    );
    const assistantEventResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: completedEventResult.eventLogs
      },
      {
        id: `event-message-assistant-${input.suffix}`,
        projectId: input.projectId,
        eventType: "message.assistant.created",
        objectType: "message",
        objectId: assistantMessage.id,
        actor: "assistant",
        timestamp: input.now,
        payload: {
          conversationId: input.conversationId,
          llmCallId: input.llmCallId
        }
      },
      {
        id: `timeline-assistant-${input.suffix}`,
        conversationId: input.conversationId,
        parentNodeId: input.userTimelineNodeId,
        label: "Assistant answer",
        model: input.model,
        memoryScope: "conversation",
        memoryEffect: "included",
        activePathId: activePath?.id,
        createdContentRef: assistantMessage.id,
        affectedContextRefs: [input.contextSnapshotId],
        payload: {
          llm_call_id: input.llmCallId,
          context_snapshot_id: input.contextSnapshotId
        }
      },
      {
        id: `timeline-edge-${input.userTimelineNodeId}-timeline-assistant-${input.suffix}`,
        sourceNodeId: input.userTimelineNodeId,
        edgeType: "sequence"
      }
    );
    const withDocumentVersion =
      input.documentId && input.documentContent !== undefined
        ? DocumentVersionService.createInitialDocumentVersionFromAnswer({
            state: {
              ...input.state,
              eventLogs: assistantEventResult.eventLogs,
              timelineNodes: assistantEventResult.timelineNodes,
              timelineEdges: assistantEventResult.timelineEdges
            },
            projectId: input.projectId,
            conversationId: input.conversationId,
            documentId: input.documentId,
            messageId: assistantMessage.id,
            content: input.documentContent,
            title: input.documentTitle,
            sourceTimelineNodeId: assistantEventResult.timelineNode.id,
            now: input.now,
            suffix: input.suffix
          })
        : undefined;
    const documentVersionState = withDocumentVersion?.state ?? {
      ...input.state,
      eventLogs: assistantEventResult.eventLogs,
      timelineNodes: assistantEventResult.timelineNodes,
      timelineEdges: assistantEventResult.timelineEdges
    };
    const activeTimelineNodeId =
      withDocumentVersion?.timelineNode?.id ?? assistantEventResult.timelineNode.id;
    const conversation = documentVersionState.mainConversations[input.conversationId];
    const project = documentVersionState.projects[input.projectId];
    const nextState: RevisionRepositoryState = {
      ...documentVersionState,
      projects: project
        ? {
            ...documentVersionState.projects,
            [project.id]: {
              ...project,
              activeTimelineNodeId,
              activeTimelinePathId: activePath?.id ?? project.activeTimelinePathId,
              updatedAt: input.now
            }
          }
        : documentVersionState.projects,
      mainConversations: conversation
        ? {
            ...documentVersionState.mainConversations,
            [conversation.id]: {
              ...conversation,
              activeTimelineNodeId,
              activeTimelinePathId:
                activePath?.id ?? conversation.activeTimelinePathId,
              updatedAt: input.now
            }
          }
        : documentVersionState.mainConversations,
      revisionMessages: {
        ...documentVersionState.revisionMessages,
        [assistantMessage.id]: assistantMessage
      },
      llmCallRecords: {
        ...documentVersionState.llmCallRecords,
        [llmCallRecord.id]: llmCallRecord
      },
      eventLogs: documentVersionState.eventLogs,
      timelineNodes: documentVersionState.timelineNodes,
      timelineEdges: documentVersionState.timelineEdges
    };

    if (activePath) {
      nextState.timelinePaths = {
        ...nextState.timelinePaths,
        [activePath.id]: {
          ...activePath,
          headNodeId: activeTimelineNodeId,
          updatedAt: input.now
        }
      };
    }

    return {
      state: nextState,
      assistantMessage,
      llmCallRecord,
      documentVersion: withDocumentVersion?.documentVersion,
      events: [
        completedEventResult.event,
        assistantEventResult.event,
        ...(withDocumentVersion?.event ? [withDocumentVersion.event] : [])
      ],
      timelineNodes: [
        assistantEventResult.timelineNode,
        ...(withDocumentVersion?.timelineNode
          ? [withDocumentVersion.timelineNode]
          : [])
      ],
      timelineEdges: [
        ...(assistantEventResult.timelineEdge
          ? [assistantEventResult.timelineEdge]
          : []),
        ...(withDocumentVersion?.timelineEdge
          ? [withDocumentVersion.timelineEdge]
          : [])
      ]
    };
  }
}
