import type {
  LocalThreadModel,
  LocalSelectionModel,
  RevisionRepositoryState,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";
import { EventService } from "./EventService";

type GetOrCreateLocalThreadInput = {
  state: RevisionRepositoryState;
  projectId: string;
  selectionId: string;
  conversationId?: string;
  now: string;
  suffix: string;
};

type GetOrCreateNestedLocalThreadInput = {
  state: RevisionRepositoryState;
  projectId: string;
  localSelectionId: string;
  conversationId?: string;
  now: string;
  suffix: string;
};

function findSelectionNode(
  state: RevisionRepositoryState,
  selectionId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === "text_selection" &&
        node.targetObjectId === selectionId &&
        node.status === "active"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function findLocalSelectionNode(
  state: RevisionRepositoryState,
  localSelectionId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === "local_selection" &&
        node.targetObjectId === localSelectionId &&
        node.status === "active"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

export class LocalThreadService {
  static getOrCreateLocalThreadForSelection(
    input: GetOrCreateLocalThreadInput
  ): {
    state: RevisionRepositoryState;
    selection: TextSelectionModel;
    localThread: LocalThreadModel;
    timelineNode?: RevisionTimelineNode;
    created: boolean;
  } {
    const selection = input.state.textSelections[input.selectionId];

    if (!selection) {
      throw new Error("TextSelection not found");
    }

    const existing = Object.values(input.state.localThreads).find(
      (thread) =>
        thread.projectId === input.projectId &&
        thread.sourceSelectionId === input.selectionId &&
        thread.status === "active"
    );

    if (existing) {
      const timelineNode = Object.values(input.state.timelineNodes).find(
        (node) =>
          node.targetObjectType === "local_thread" &&
          node.targetObjectId === existing.id
      );

      return {
        state: input.state,
        selection,
        localThread: existing,
        timelineNode,
        created: false
      };
    }

    const localThread: LocalThreadModel = {
      id: `local-thread-${selection.id}`,
      projectId: input.projectId,
      conversationId: input.conversationId ?? selection.conversationId,
      sourceSelectionId: selection.id,
      parentSelectionId: selection.id,
      threadType: "local",
      sourceType: selection.sourceType,
      sourceId: selection.sourceId,
      sourceDocumentVersionId: selection.sourceDocumentVersionId,
      status: "active",
      memoryScope: "local_thread",
      createdAt: input.now,
      updatedAt: input.now,
      payload: {
        selected_text: selection.selectedText,
        source_object_type: selection.sourceType,
        source_object_id: selection.sourceId,
        source_document_version_id: selection.sourceDocumentVersionId
      }
    };
    const selectionNode = findSelectionNode(input.state, selection.id);
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-local-thread-${input.suffix}`,
        projectId: input.projectId,
        eventType: "local_thread.created",
        objectType: "local_thread",
        objectId: localThread.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          selectionId: selection.id,
          sourceObjectType: selection.sourceType,
          sourceObjectId: selection.sourceId
        }
      },
      {
        id: `timeline-local-thread-${input.suffix}`,
        conversationId: localThread.conversationId,
        parentNodeId: selectionNode?.id,
        label: "Local thread created",
        memoryScope: "local_thread",
        memoryEffect: "local_only",
        createdContentRef: localThread.id,
        payload: {
          source_object_type: "text_selection",
          source_object_id: selection.id,
          selection_id: selection.id,
          local_thread_id: localThread.id
        }
      },
      selectionNode
        ? {
            id: `timeline-edge-${selectionNode.id}-timeline-local-thread-${input.suffix}`,
            sourceNodeId: selectionNode.id,
            edgeType: "branch",
            label: "open local thread"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        localThreads: {
          ...input.state.localThreads,
          [localThread.id]: localThread
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      selection,
      localThread,
      timelineNode: eventResult.timelineNode,
      created: true
    };
  }

  static getOrCreateNestedLocalThreadForLocalSelection(
    input: GetOrCreateNestedLocalThreadInput
  ): {
    state: RevisionRepositoryState;
    localSelection: LocalSelectionModel;
    localThread: LocalThreadModel;
    timelineNode?: RevisionTimelineNode;
    created: boolean;
  } {
    const localSelection = input.state.localSelections[input.localSelectionId];

    if (!localSelection) {
      throw new Error("LocalSelection not found");
    }

    const existing = Object.values(input.state.localThreads).find(
      (thread) =>
        thread.projectId === input.projectId &&
        thread.threadType === "nested_local" &&
        thread.sourceType === "local_selection" &&
        thread.sourceId === input.localSelectionId &&
        thread.status === "active"
    );

    if (existing) {
      const timelineNode = Object.values(input.state.timelineNodes).find(
        (node) =>
          node.targetObjectType === "local_thread" &&
          node.targetObjectId === existing.id
      );

      return {
        state: input.state,
        localSelection,
        localThread: existing,
        timelineNode,
        created: false
      };
    }

    const localThread: LocalThreadModel = {
      id: `nested-local-thread-${localSelection.id}`,
      projectId: input.projectId,
      conversationId: input.conversationId ?? localSelection.conversationId,
      sourceSelectionId:
        localSelection.parentSelectionId ?? localSelection.id,
      parentSelectionId: localSelection.parentSelectionId,
      parentLocalSelectionId: localSelection.id,
      parentThreadId: localSelection.sourceLocalThreadId,
      threadType: "nested_local",
      sourceType: "local_selection",
      sourceId: localSelection.id,
      sourceDocumentVersionId: localSelection.sourceDocumentVersionId,
      status: "active",
      memoryScope: "nested_local_thread",
      createdAt: input.now,
      updatedAt: input.now,
      payload: {
        selected_text: localSelection.selectedText,
        source_object_type: "local_selection",
        source_object_id: localSelection.id,
        parent_selection_id: localSelection.parentSelectionId,
        parent_local_selection_id: localSelection.id,
        source_local_thread_id: localSelection.sourceLocalThreadId,
        source_message_id: localSelection.sourceMessageId
      }
    };
    const localSelectionNode = findLocalSelectionNode(
      input.state,
      localSelection.id
    );
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-nested-local-thread-${input.suffix}`,
        projectId: input.projectId,
        eventType: "nested_local_thread.created",
        objectType: "local_thread",
        objectId: localThread.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          localSelectionId: localSelection.id,
          parentSelectionId: localSelection.parentSelectionId,
          sourceLocalThreadId: localSelection.sourceLocalThreadId
        }
      },
      {
        id: `timeline-nested-local-thread-${input.suffix}`,
        conversationId: localThread.conversationId,
        parentNodeId: localSelectionNode?.id,
        label: "Nested local thread created",
        memoryScope: "local_thread",
        memoryEffect: "local_only",
        createdContentRef: localThread.id,
        payload: {
          source_object_type: "local_selection",
          source_object_id: localSelection.id,
          selection_id: localSelection.parentSelectionId,
          local_selection_id: localSelection.id,
          local_thread_id: localThread.id
        }
      },
      localSelectionNode
        ? {
            id: `timeline-edge-${localSelectionNode.id}-timeline-nested-local-thread-${input.suffix}`,
            sourceNodeId: localSelectionNode.id,
            edgeType: "nested_branch",
            label: "open nested local thread"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        localThreads: {
          ...input.state.localThreads,
          [localThread.id]: localThread
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      localSelection,
      localThread,
      timelineNode: eventResult.timelineNode,
      created: true
    };
  }
}
