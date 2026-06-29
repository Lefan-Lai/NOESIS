export type VersionNodeType =
  | "document_created"
  | "document_revised"
  | "anchor_selected"
  | "local_question_asked"
  | "local_answer_generated"
  | "annotation_added"
  | "annotation_deleted"
  | "branch_created"
  | "revision_generated"
  | "merged"
  | "discarded"
  | "deleted"
  | "reverted";

export type VersionNode = {
  id: string;
  documentId: string;
  parentId?: string | null;
  childIds: string[];
  nodeType: VersionNodeType;
  label: string;
  relatedAnchorId?: string | null;
  relatedThreadId?: string | null;
  relatedBranchId?: string | null;
  isActivePath: boolean;
  createdAt: string;
};

export type Branch = {
  id: string;
  documentId: string;
  workspaceId?: string;
  baseVersionNodeId: string;
  headVersionNodeId: string;
  anchorId?: string | null;
  threadId?: string | null;
  sourceType?:
    | "semantic_block"
    | "sentence"
    | "text_selection"
    | "tree_node"
    | "alignment_edge";
  sourceBlockId?: string;
  sourceSelectionId?: string;
  selectedText?: string;
  conversationSessionId?: string;
  contextPolicy?: "include_in_context" | "exclude_from_context";
  branchType:
    | "sentence_revision"
    | "paragraph_expansion"
    | "evidence_search"
    | "alternative_answer";
  status: "active" | "merged" | "discarded" | "deleted";
  createdAt: string;
  mergedAt?: string | null;
  discardedAt?: string | null;
  deletedAt?: string | null;
};

export type TimelineNodeMenuAction =
  | "revert"
  | "diff"
  | "open-thread"
  | "delete-answer";
