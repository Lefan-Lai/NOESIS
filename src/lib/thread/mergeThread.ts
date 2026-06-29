import type { AnswerBlock, VersionSnapshot } from "@/types/document";
import type { PatchOperation } from "@/types/diff";
import type { Branch, VersionNode } from "@/types/version";
import type { LocalThread } from "@/types/thread";

export function createRevisionPatch(
  blocks: AnswerBlock[],
  blockId: string,
  newText: string
): PatchOperation[] {
  const block = blocks.find((item) => item.id === blockId);

  if (!block) {
    return [];
  }

  return [
    {
      op: "replace_block_text",
      blockId,
      oldText: block.text,
      newText
    }
  ];
}

export function applyPatchToBlocks(
  blocks: AnswerBlock[],
  patch: PatchOperation[],
  versionNodeId: string
) {
  return blocks.map((block) => {
    const replacement = patch.find(
      (operation) =>
        operation.op === "replace_block_text" && operation.blockId === block.id
    );

    if (!replacement || replacement.op !== "replace_block_text") {
      return block;
    }

    return {
      ...block,
      text: replacement.newText,
      updatedAt: new Date().toISOString(),
      createdInVersionNodeId: block.createdInVersionNodeId || versionNodeId
    };
  });
}

type MergeThreadParams = {
  documentId: string;
  parentVersionNodeId: string;
  thread: LocalThread;
  branch?: Branch;
  blocks: AnswerBlock[];
  patch: PatchOperation[];
  idSuffix: string;
  now?: string;
};

export function mergeThreadIntoDocument({
  documentId,
  parentVersionNodeId,
  thread,
  branch,
  blocks,
  patch,
  idSuffix,
  now = new Date().toISOString()
}: MergeThreadParams) {
  const nodeId = `v-merged-${idSuffix}`;
  const mergedBlocks = applyPatchToBlocks(blocks, patch, nodeId);

  const node: VersionNode = {
    id: nodeId,
    documentId,
    parentId: parentVersionNodeId,
    childIds: [],
    nodeType: "merged",
    label: "Merged into main document",
    relatedAnchorId: thread.anchorId,
    relatedThreadId: thread.id,
    relatedBranchId: branch?.id ?? null,
    isActivePath: true,
    createdAt: now
  };

  const snapshot: VersionSnapshot = {
    id: `snap-${nodeId}`,
    documentId,
    versionNodeId: nodeId,
    blocks: mergedBlocks,
    createdAt: now
  };

  return {
    node,
    snapshot,
    thread: {
      ...thread,
      status: "merged" as const,
      visibility: "visible" as const,
      contextPolicy: "include" as const,
      updatedAt: now
    },
    branch: branch
      ? {
          ...branch,
          status: "merged" as const,
          headVersionNodeId: nodeId,
          mergedAt: now
        }
      : undefined
  };
}
