"use client";

import { useState } from "react";
import type {
  ComparisonSummary,
  LayeredComparisonBoardSummary
} from "@/types/comparison";

type SummaryLike = ComparisonSummary | LayeredComparisonBoardSummary;

function actionLabel(action: SummaryLike["recommended_action"]) {
  return action.replaceAll("_", " ");
}

function LimitedList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  const [showMore, setShowMore] = useState(false);
  const visibleItems = showMore ? items : items.slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </div>
      <ul className="space-y-1 text-sm leading-6 text-slate-700">
        {visibleItems.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-atlasBlue" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          className="mt-1 text-xs font-semibold text-atlasBlue"
        >
          {showMore ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

type ComparisonSummaryPanelProps = {
  summary: SummaryLike;
};

export function ComparisonSummaryPanel({
  summary
}: ComparisonSummaryPanelProps) {
  return (
    <section className="rounded-lg border border-line bg-slate-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Overall Change
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-700">
            {summary.overall_summary}
          </p>
        </div>
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-bold capitalize text-slate-700">
          {actionLabel(summary.recommended_action)}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LimitedList title="Main differences" items={"main_differences" in summary ? summary.main_differences : []} />
        <LimitedList title="Risks" items={"main_risks" in summary ? summary.main_risks : []} />
      </div>
    </section>
  );
}
