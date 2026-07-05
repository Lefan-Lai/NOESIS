import type {
  RevisionBranchModel,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import { EventService } from "./EventService";

type CreateBranchFromLocalSelectionInput = {
  state: RevisionRepositoryState;
  projectId: string;
  localSelectionId: string;
  baseDocumentVersionId?: string;
  now: string;
  suffix: string;
};

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

export class RevisionBranchService {
  static createBranchFromLocalSelection(
    input: CreateBranchFromLocalSelectionInput
  ): {
    state: RevisionRepositoryState;
    branch: RevisionBranchModel;
    timelineNode?: RevisionTimelineNode;
  } {
    const localSelection = input.state.localSelections[input.localSelectionId];

    if (!localSelection) {
      throw new Error("LocalSelection not found");
    }

    const branch: RevisionBranchModel = {
      id: `revision-branch-${input.suffix}`,
      projectId: input.projectId,
      sourceObjectType: "local_selection",
      sourceObjectId: localSelection.id,
      parentSelectionId: localSelection.parentSelectionId,
      parentLocalSelectionId: localSelection.id,
      sourceLocalThreadId: localSelection.sourceLocalThreadId,
      sourceMessageId: localSelection.sourceMessageId,
      baseDocumentVersionId:
        localSelection.sourceDocumentVersionId ?? input.baseDocumentVersionId,
      content: localSelection.selectedText,
      draftContent: localSelection.selectedText,
      status: "active",
      memoryScope: "branch",
      memoryEffect: "branch_only",
      createdAt: input.now,
      updatedAt: input.now,
      payload: {
        source_type: "local_selection",
        source_id: localSelection.id,
        parent_selection_id: localSelection.parentSelectionId,
        parent_local_selection_id: localSelection.id,
        source_local_thread_id: localSelection.sourceLocalThreadId,
        source_message_id: localSelection.sourceMessageId,
        summary: localSelection.selectedText
      }
    };
    const localSelectionNode = findLocalSelectionNode(
      input.state,
      localSelection.id
    );
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-branch-${input.suffix}`,
        projectId: input.projectId,
        eventType: "branch.created",
        objectType: "revision_branch",
        objectId: branch.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          localSelectionId: localSelection.id,
          parentSelectionId: localSelection.parentSelectionId,
          sourceLocalThreadId: localSelection.sourceLocalThreadId
        }
      },
      {
        id: `timeline-branch-${input.suffix}`,
        conversationId: localSelection.conversationId,
        parentNodeId: localSelectionNode?.id,
        label: "Revision branch created",
        memoryScope: "branch",
        memoryEffect: "branch_only",
        createdContentRef: branch.id,
        payload: {
          source_object_type: "local_selection",
          source_object_id: localSelection.id,
          selection_id: localSelection.parentSelectionId,
          local_selection_id: localSelection.id,
          local_thread_id: localSelection.sourceLocalThreadId,
          branch_id: branch.id
        }
      },
      localSelectionNode
        ? {
            id: `timeline-edge-${localSelectionNode.id}-timeline-branch-${input.suffix}`,
            sourceNodeId: localSelectionNode.id,
            edgeType: "branch",
            label: "create branch"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        revisionBranches: {
          ...input.state.revisionBranches,
          [branch.id]: branch
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      branch,
      timelineNode: eventResult.timelineNode
    };
  }

  static getBranch(
    state: Pick<RevisionRepositoryState, "revisionBranches">,
    branchId: string
  ) {
    return state.revisionBranches[branchId];
  }

  static getBranchesForLocalSelection(
    state: Pick<RevisionRepositoryState, "revisionBranches">,
    localSelectionId: string
  ) {
    return Object.values(state.revisionBranches).filter(
      (branch) => branch.sourceObjectId === localSelectionId
    );
  }

  static getBranchesForSelection(
    state: Pick<RevisionRepositoryState, "revisionBranches">,
    selectionId: string
  ) {
    return Object.values(state.revisionBranches).filter(
      (branch) => branch.parentSelectionId === selectionId
    );
  }
}
