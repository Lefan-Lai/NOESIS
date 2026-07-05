export type ThreadStatus =
  | "active"
  | "kept_as_note"
  | "branch_created"
  | "merged"
  | "discarded"
  | "deleted";

export type LocalThread = {
  id: string;
  documentId: string;
  anchorId: string;
  conversationSessionId?: string;
  sourceType?: "semantic_block" | "sentence" | "text_selection" | "tree_node" | "alignment_edge";
  selectedText?: string;
  parentThreadId?: string;
  sourceMessageId?: string;
  sourceSelectionId?: string;
  sourceLocalSelectionId?: string;
  revisionLocalThreadId?: string;
  revisionThreadType?: "local" | "nested_local";
  status: ThreadStatus;
  visibility: "visible" | "hidden";
  contextPolicy: "include" | "exclude";
  createdInVersionNodeId: string;
  relatedBranchId?: string | null;
  createdAt: string;
  updatedAt: string;
  discardedAt?: string | null;
  deletedAt?: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  sessionId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelConfigId?: string;
  modelName?: string;
  llmCallId?: string;
  contextSnapshotId?: string;
  revisionMessageId?: string;
  contentState: "normal" | "discarded_but_contextual" | "deleted";
  includeInContext: boolean;
  createdAt: string;
};

export type DeletedAnswerTombstone = {
  id: string;
  threadId: string;
  anchorId: string;
  deletedAt: string;
  deletedBy: "user";
};

export type Annotation = {
  id: string;
  documentId: string;
  anchorId: string;
  blockId?: string;
  content: string;
  status: "active" | "resolved" | "deleted";
  contextPolicy: "include" | "exclude";
  includeInContext: boolean;
  createdInVersionNodeId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
