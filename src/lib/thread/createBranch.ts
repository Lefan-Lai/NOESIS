import type { Branch, VersionNode } from "@/types/version";
import type { LocalThread } from "@/types/thread";

type CreateBranchParams = {
  documentId: string;
  activeVersionNodeId: string;
  anchorId: string;
  thread: LocalThread;
  idSuffix: string;
  now?: string;
};

export function createRevisionBranch({
  documentId,
  activeVersionNodeId,
  anchorId,
  thread,
  idSuffix,
  now = new Date().toISOString()
}: CreateBranchParams) {
  const branchId = `branch-${idSuffix}`;
  const nodeId = `v-branch-${idSuffix}`;

  const branch: Branch = {
    id: branchId,
    documentId,
    baseVersionNodeId: activeVersionNodeId,
    headVersionNodeId: nodeId,
    anchorId,
    threadId: thread.id,
    sourceType: thread.sourceType ?? "sentence",
    sourceSelectionId:
      thread.sourceType === "text_selection" ? thread.anchorId : undefined,
    selectedText: thread.selectedText,
    conversationSessionId: thread.conversationSessionId,
    contextPolicy:
      thread.contextPolicy === "exclude"
        ? "exclude_from_context"
        : "include_in_context",
    branchType: "sentence_revision",
    status: "active",
    createdAt: now
  };

  const node: VersionNode = {
    id: nodeId,
    documentId,
    parentId: activeVersionNodeId,
    childIds: [],
    nodeType: "branch_created",
    label: "Created revision branch",
    relatedAnchorId: anchorId,
    relatedThreadId: thread.id,
    relatedBranchId: branchId,
    isActivePath: false,
    createdAt: now
  };

  return {
    branch,
    node,
    thread: {
      ...thread,
      status: "branch_created" as const,
      relatedBranchId: branchId,
      updatedAt: now
    }
  };
}
