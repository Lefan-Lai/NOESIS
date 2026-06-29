import type { ArgumentComparison } from "@/types/comparison";

export function getComparisonForAnchor(
  comparisons: Record<string, ArgumentComparison>,
  anchorId: string | null
) {
  if (!anchorId) {
    return null;
  }

  return (
    Object.values(comparisons).find(
      (comparison) =>
        comparison.anchorId === anchorId && comparison.status !== "deleted"
    ) ?? null
  );
}
