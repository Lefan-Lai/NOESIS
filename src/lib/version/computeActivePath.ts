import type { VersionNode } from "@/types/version";

export function computeActivePath(
  versionNodes: Record<string, VersionNode>,
  rootVersionNodeId: string,
  targetVersionNodeId: string
): string[] {
  const reversedPath: string[] = [];
  let cursor: string | null | undefined = targetVersionNodeId;
  const seen = new Set<string>();

  while (cursor) {
    if (seen.has(cursor)) {
      break;
    }

    const node: VersionNode | undefined = versionNodes[cursor];
    if (!node) {
      break;
    }

    reversedPath.push(node.id);
    seen.add(node.id);

    if (node.id === rootVersionNodeId) {
      return reversedPath.reverse();
    }

    cursor = node.parentId;
  }

  return reversedPath.reverse();
}

export function markActivePath(
  versionNodes: Record<string, VersionNode>,
  activePath: string[]
): Record<string, VersionNode> {
  const activeSet = new Set(activePath);

  return Object.fromEntries(
    Object.values(versionNodes).map((node) => [
      node.id,
      {
        ...node,
        isActivePath: activeSet.has(node.id)
      }
    ])
  );
}
