import type { ArgumentComparison } from "@/types/comparison";

export function getComparisonForAnchor(
  comparisons: Record<string, ArgumentComparison>,
  anchorId: string | null
) {
  if (!anchorId) {
    return null;
  }

  return (
    Object.values(comparisons)
      .filter(
        (comparison) =>
          comparison.anchorId === anchorId &&
          (comparison.status === "active" || comparison.status === "merged")
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      )[0] ?? null
  );
}
