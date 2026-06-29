export type WindowType =
  | "main_answer"
  | "local_branch"
  | "tree_compare"
  | "node_detail"
  | "merge_review";

export type SessionType =
  | "main_chat"
  | "branch_chat"
  | "tree_chat"
  | "merge_chat";

export type ContextScope = {
  scopeType:
    | "main_answer_context"
    | "selected_block_context"
    | "branch_context"
    | "tree_comparison_context"
    | "merge_review_context";
  currentDocumentId?: string;
  selectedBlockId?: string;
  branchId?: string;
  comparisonId?: string;
  includeDiscarded: boolean;
  includeDeleted: false;
  reversibleCutoffNodeId?: string;
};

export type WindowInstance = {
  id: string;
  workspaceId: string;
  windowType: WindowType;
  title: string;
  conversationSessionId: string;
  modelConfigId: string;
  contextScope: ContextScope;
  linkedDocumentId?: string;
  linkedBranchId?: string;
  linkedThreadId?: string;
  selectedBlockId?: string;
  selectedComparisonId?: string;
  layout: {
    isMinimized: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ConversationSession = {
  id: string;
  workspaceId: string;
  windowId: string;
  sessionType: SessionType;
  modelConfigId: string;
  contextScope: ContextScope;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  modelConfigId?: string;
  modelName?: string;
  contentState: "normal" | "deleted";
  includeInContext: boolean;
  createdAt: string;
};
