"use client";

import type { ComparisonSlot } from "@/types/comparison";

export const relationLabels: Record<ComparisonSlot["relation"], string> = {
  same: "Same",
  rewritten: "Rewritten",
  refined: "Refined",
  expanded: "Expanded",
  reduced: "Reduced",
  replaced: "Replaced",
  contradicted: "Conflict",
  original_only: "Removed",
  revised_only: "Added"
};

const relationStyles: Record<ComparisonSlot["relation"], string> = {
  same: "border-slate-200 bg-slate-50 text-slate-700",
  rewritten: "border-blue-200 bg-blue-50 text-atlasBlue",
  refined: "border-blue-200 bg-blue-50 text-atlasBlue",
  expanded: "border-green-200 bg-green-50 text-atlasGreen",
  reduced: "border-yellow-200 bg-yellow-50 text-yellow-700",
  replaced: "border-indigo-200 bg-indigo-50 text-indigo-700",
  contradicted: "border-orange-200 bg-orange-50 text-atlasOrange",
  original_only: "border-red-200 bg-red-50 text-atlasRed",
  revised_only: "border-purple-200 bg-purple-50 text-atlasPurple"
};

type RelationBadgeProps = {
  relation: ComparisonSlot["relation"];
};

export function RelationBadge({ relation }: RelationBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-bold ${relationStyles[relation]}`}
    >
      {relationLabels[relation]}
    </span>
  );
}
