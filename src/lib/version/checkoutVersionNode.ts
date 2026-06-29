import type { Document } from "@/types/document";
import type { VersionNode } from "@/types/version";
import { computeActivePath, markActivePath } from "./computeActivePath";

export function checkoutVersionNode(
  document: Document,
  versionNodes: Record<string, VersionNode>,
  targetNodeId: string
) {
  const activePath = computeActivePath(
    versionNodes,
    document.rootVersionNodeId,
    targetNodeId
  );

  return {
    document: {
      ...document,
      activeVersionNodeId: targetNodeId,
      updatedAt: new Date().toISOString()
    },
    versionNodes: markActivePath(versionNodes, activePath),
    activePath
  };
}
