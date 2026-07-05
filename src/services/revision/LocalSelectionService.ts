import type {
  LocalSelectionModel,
  RelatedLocalSelectionObjects,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import { EventService } from "./EventService";

type CreateOrGetLocalSelectionInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  sourceLocalThreadId: string;
  sourceMessageId: string;
  sourceAnswerId: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceDocumentVersionId?: string;
  selectedText: string;
  startOffset?: number;
  endOffset?: number;
  beforeContext?: string;
  afterContext?: string;
  textHash?: string;
  sourceThreadType?: LocalSelectionModel["sourceThreadType"];
  now: string;
  suffix: string;
};

function latestNode(nodes: RevisionTimelineNode[]) {
  return [...nodes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];
}

function findSourceAnswerNode(
  state: RevisionRepositoryState,
  input: CreateOrGetLocalSelectionInput
) {
  return latestNode(
    Object.values(state.timelineNodes).filter(
      (node) =>
        node.projectId === input.projectId &&
        node.targetObjectType === "message" &&
        node.targetObjectId === input.sourceAnswerId &&
        node.status === "active"
    )
  );
}

function matchesExistingLocalSelection(
  localSelection: LocalSelectionModel,
  input: CreateOrGetLocalSelectionInput
) {
  return (
    localSelection.status === "active" &&
    localSelection.projectId === input.projectId &&
    localSelection.conversationId === input.conversationId &&
    localSelection.sourceLocalThreadId === input.sourceLocalThreadId &&
    localSelection.sourceMessageId === input.sourceMessageId &&
    localSelection.startOffset === input.startOffset &&
    localSelection.endOffset === input.endOffset &&
    localSelection.textHash === input.textHash
  );
}

export class LocalSelectionService {
  static findExistingLocalSelection(
    input: Omit<CreateOrGetLocalSelectionInput, "now" | "suffix">
  ) {
    return Object.values(input.state.localSelections).find((localSelection) =>
      matchesExistingLocalSelection(localSelection, {
        ...input,
        now: "",
        suffix: ""
      })
    );
  }

  static getLocalSelection(
    state: Pick<RevisionRepositoryState, "localSelections">,
    localSelectionId: string
  ) {
    return state.localSelections[localSelectionId];
  }

  static createOrGetLocalSelection(
    input: CreateOrGetLocalSelectionInput
  ): {
    state: RevisionRepositoryState;
    localSelection: LocalSelectionModel;
    timelineNode?: RevisionTimelineNode;
    created: boolean;
  } {
    const existing = LocalSelectionService.findExistingLocalSelection(input);

    if (existing) {
      const timelineNode = Object.values(input.state.timelineNodes).find(
        (node) =>
          node.targetObjectType === "local_selection" &&
          node.targetObjectId === existing.id
      );

      return {
        state: input.state,
        localSelection: existing,
        timelineNode,
        created: false
      };
    }

    const localSelection: LocalSelectionModel = {
      id: `local-selection-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      sourceLocalThreadId: input.sourceLocalThreadId,
      sourceMessageId: input.sourceMessageId,
      sourceAnswerId: input.sourceAnswerId,
      sourceLocalAnswerId: input.sourceAnswerId,
      parentSelectionId: input.parentSelectionId,
      parentLocalSelectionId: input.parentLocalSelectionId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      selectedText: input.selectedText,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      beforeContext: input.beforeContext,
      afterContext: input.afterContext,
      textHash: input.textHash,
      sourceThreadType: input.sourceThreadType ?? "local",
      status: "active",
      createdAt: input.now,
      payload: {
        source_local_thread_id: input.sourceLocalThreadId,
        source_message_id: input.sourceMessageId,
        source_answer_id: input.sourceAnswerId,
        parent_selection_id: input.parentSelectionId,
        parent_local_selection_id: input.parentLocalSelectionId,
        source_thread_type: input.sourceThreadType ?? "local"
      }
    };
    const sourceAnswerNode = findSourceAnswerNode(input.state, input);
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-local-selection-${input.suffix}`,
        projectId: input.projectId,
        eventType: "local_selection.created",
        objectType: "local_selection",
        objectId: localSelection.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          conversationId: input.conversationId,
          sourceLocalThreadId: input.sourceLocalThreadId,
          sourceMessageId: input.sourceMessageId,
          sourceAnswerId: input.sourceAnswerId,
          parentSelectionId: input.parentSelectionId,
          parentLocalSelectionId: input.parentLocalSelectionId,
          textHash: input.textHash
        }
      },
      {
        id: `timeline-local-selection-${input.suffix}`,
        conversationId: input.conversationId,
        parentNodeId: sourceAnswerNode?.id,
        label: "Local selection created",
        memoryScope: "local_thread",
        memoryEffect: "local_only",
        createdContentRef: localSelection.id,
        payload: {
          source_object_type: "message",
          source_object_id: input.sourceAnswerId,
          selection_id: input.parentSelectionId,
          local_selection_id: localSelection.id,
          local_thread_id: input.sourceLocalThreadId,
          start_offset: input.startOffset,
          end_offset: input.endOffset,
          text_hash: input.textHash
        }
      },
      sourceAnswerNode
        ? {
            id: `timeline-edge-${sourceAnswerNode.id}-timeline-local-selection-${input.suffix}`,
            sourceNodeId: sourceAnswerNode.id,
            edgeType: "selection_attach",
            label: "selected local text"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        localSelections: {
          ...input.state.localSelections,
          [localSelection.id]: localSelection
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      localSelection,
      timelineNode: eventResult.timelineNode,
      created: true
    };
  }

  static getRelatedObjectsForLocalSelection(
    state: RevisionRepositoryState,
    localSelectionId: string
  ): RelatedLocalSelectionObjects {
    const nestedLocalThreads = Object.values(state.localThreads).filter(
      (thread) =>
        thread.threadType === "nested_local" &&
        (thread.parentLocalSelectionId === localSelectionId ||
          thread.sourceId === localSelectionId)
    );
    const revisionBranches = Object.values(state.revisionBranches).filter(
      (branch) => branch.sourceObjectId === localSelectionId
    );
    const events = Object.values(state.eventLogs).filter(
      (event) => event.objectId === localSelectionId
    );
    const timelineNodes = Object.values(state.timelineNodes).filter(
      (node) =>
        node.targetObjectId === localSelectionId ||
        node.payload?.local_selection_id === localSelectionId
    );
    const nodeIds = new Set(timelineNodes.map((node) => node.id));
    const timelineEdges = Object.values(state.timelineEdges).filter(
      (edge) => nodeIds.has(edge.sourceNodeId) || nodeIds.has(edge.targetNodeId)
    );

    return {
      localSelectionId,
      nestedLocalThreads,
      revisionBranches,
      events,
      timelineNodes,
      timelineEdges
    };
  }
}
