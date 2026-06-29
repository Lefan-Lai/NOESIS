import type { VersionSnapshot } from "@/types/document";
import type { VersionNode } from "@/types/version";
import { computeActivePath } from "./computeActivePath";

type SnapshotState = {
  snapshots: Record<string, VersionSnapshot>;
  versionNodes: Record<string, VersionNode>;
};

export function getBlocksVisibleAtVersion(
  state: SnapshotState,
  documentId: string,
  rootVersionNodeId: string,
  versionNodeId: string
) {
  const snapshots = Object.values(state.snapshots).filter(
    (snapshot) => snapshot.documentId === documentId
  );
  const exactSnapshot = snapshots.find(
    (snapshot) => snapshot.versionNodeId === versionNodeId
  );

  if (exactSnapshot) {
    return [...exactSnapshot.blocks].sort((a, b) => a.order - b.order);
  }

  const activePath = computeActivePath(
    state.versionNodes,
    rootVersionNodeId,
    versionNodeId
  );
  const activePathSet = new Set(activePath);
  const latestSnapshot = snapshots
    .filter((snapshot) => activePathSet.has(snapshot.versionNodeId))
    .sort(
      (a, b) =>
        activePath.indexOf(b.versionNodeId) - activePath.indexOf(a.versionNodeId)
    )[0];

  return latestSnapshot
    ? [...latestSnapshot.blocks].sort((a, b) => a.order - b.order)
    : [];
}
