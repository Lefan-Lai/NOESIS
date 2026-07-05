import type {
  RevisionRepositoryState,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";
import { EventService } from "./EventService";

type CreateOrGetSelectionInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  sourceType: TextSelectionModel["sourceType"];
  sourceId: string;
  sourceDocumentVersionId?: string;
  sourceMessageId?: string;
  selectedText: string;
  startOffset?: number;
  endOffset?: number;
  textHash?: string;
  beforeContext?: string;
  afterContext?: string;
  activeTimelineNodeId?: string;
  now: string;
  suffix: string;
};

function latestNode(nodes: RevisionTimelineNode[]) {
  return [...nodes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];
}

function findSourceNode(
  state: RevisionRepositoryState,
  input: CreateOrGetSelectionInput
) {
  const exactSourceNode = latestNode(
    Object.values(state.timelineNodes).filter(
      (node) =>
        node.projectId === input.projectId &&
        node.targetObjectType === input.sourceType &&
        node.targetObjectId === input.sourceId &&
        node.status === "active"
    )
  );

  if (exactSourceNode) {
    return exactSourceNode;
  }

  if (input.activeTimelineNodeId) {
    return state.timelineNodes[input.activeTimelineNodeId];
  }

  return latestNode(
    Object.values(state.timelineNodes).filter(
      (node) => node.projectId === input.projectId && node.status === "active"
    )
  );
}

function matchesExistingSelection(
  selection: TextSelectionModel,
  input: CreateOrGetSelectionInput
) {
  return (
    selection.status === "active" &&
    selection.projectId === input.projectId &&
    selection.conversationId === input.conversationId &&
    selection.sourceType === input.sourceType &&
    selection.sourceId === input.sourceId &&
    selection.sourceDocumentVersionId === input.sourceDocumentVersionId &&
    selection.startOffset === input.startOffset &&
    selection.endOffset === input.endOffset &&
    selection.textHash === input.textHash
  );
}

export class TextSelectionService {
  static createOrGetSelection(input: CreateOrGetSelectionInput): {
    state: RevisionRepositoryState;
    selection: TextSelectionModel;
    timelineNode?: RevisionTimelineNode;
    created: boolean;
  } {
    const existing = Object.values(input.state.textSelections).find((selection) =>
      matchesExistingSelection(selection, input)
    );

    if (existing) {
      const timelineNode = Object.values(input.state.timelineNodes).find(
        (node) =>
          node.targetObjectType === "text_selection" &&
          node.targetObjectId === existing.id
      );

      return {
        state: input.state,
        selection: existing,
        timelineNode,
        created: false
      };
    }

    const selection: TextSelectionModel = {
      id: `text-selection-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      sourceMessageId: input.sourceMessageId,
      selectedText: input.selectedText,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      textHash: input.textHash,
      beforeContext: input.beforeContext,
      afterContext: input.afterContext,
      status: "active",
      createdAt: input.now,
      payload: {
        source_object_type: input.sourceType,
        source_object_id: input.sourceId,
        source_document_version_id: input.sourceDocumentVersionId
      }
    };
    const sourceNode = findSourceNode(input.state, input);
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-selection-${input.suffix}`,
        projectId: input.projectId,
        eventType: "selection.created",
        objectType: "text_selection",
        objectId: selection.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          conversationId: input.conversationId,
          sourceObjectType: input.sourceType,
          sourceObjectId: input.sourceId,
          sourceDocumentVersionId: input.sourceDocumentVersionId,
          textHash: input.textHash
        }
      },
      {
        id: `timeline-selection-${input.suffix}`,
        conversationId: input.conversationId,
        parentNodeId: sourceNode?.id,
        label: "Selection created",
        memoryScope: "selected_text",
        memoryEffect: "none",
        createdContentRef: selection.id,
        payload: {
          source_object_type: input.sourceType,
          source_object_id: input.sourceId,
          source_document_version_id: input.sourceDocumentVersionId,
          start_offset: input.startOffset,
          end_offset: input.endOffset,
          text_hash: input.textHash
        }
      },
      sourceNode
        ? {
            id: `timeline-edge-${sourceNode.id}-timeline-selection-${input.suffix}`,
            sourceNodeId: sourceNode.id,
            edgeType: "selection_attach",
            label: "selected text"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        textSelections: {
          ...input.state.textSelections,
          [selection.id]: selection
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      selection,
      timelineNode: eventResult.timelineNode,
      created: true
    };
  }
}
