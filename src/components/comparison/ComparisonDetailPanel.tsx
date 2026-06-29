"use client";

import type {
  ComparisonRow,
  ComparisonSlot,
  ComparisonSummary,
  LayeredComparisonBoardSummary
} from "@/types/comparison";
import { DifferenceBadge } from "./DifferenceBadge";
import { RelationBadge } from "./RelationBadge";

type RecommendedAction =
  | ComparisonSummary["recommended_action"]
  | LayeredComparisonBoardSummary["recommended_action"];

function actionLabel(action: RecommendedAction) {
  return action.replaceAll("_", " ");
}

function detailImportance(slot: ComparisonSlot) {
  if (slot.importance) {
    return slot.importance;
  }

  if (slot.relation === "contradicted" || slot.relation === "replaced") {
    return "high";
  }

  if (slot.relation === "original_only" || slot.relation === "revised_only") {
    return "medium";
  }

  if (slot.relation === "same") {
    return "low";
  }

  return "medium";
}

function DetailSide({
  label,
  title,
  summary,
  text,
  emptyText
}: {
  label: string;
  title?: string;
  summary?: string;
  text?: string;
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-slate-50/70 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
      {text ? (
        <div className="space-y-2">
          {title && <h4 className="text-sm font-bold text-ink">{title}</h4>}
          {summary && (
            <p className="text-sm leading-6 text-slate-700">{summary}</p>
          )}
          <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
            {text}
          </p>
        </div>
      ) : (
        <div className="text-sm font-semibold text-muted">{emptyText}</div>
      )}
    </div>
  );
}

type ComparisonDetailPanelProps = {
  row?: ComparisonRow;
  slot?: ComparisonSlot;
  recommendedAction: RecommendedAction;
};

export function ComparisonDetailPanel({
  row,
  slot,
  recommendedAction
}: ComparisonDetailPanelProps) {
  if (row) {
    return (
      <aside className="sticky top-0 space-y-3 rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Selected Comparison Detail
            </div>
            <h3 className="text-base font-bold text-ink">{row.shared_topic}</h3>
          </div>
          <DifferenceBadge difference={row.difference} />
        </div>

        <div className="rounded-lg border border-line bg-slate-50/70 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Importance
          </div>
          <p className="text-sm font-semibold capitalize text-slate-700">
            {row.importance}
          </p>
        </div>

        <DetailSide
          label="Original"
          title={row.original?.title}
          summary={row.original?.short_summary}
          text={row.original?.full_text ?? row.original?.short_summary}
          emptyText="Not present in original answer"
        />
        <DetailSide
          label="Revised"
          title={row.revised?.title}
          summary={row.revised?.short_summary}
          text={row.revised?.full_text ?? row.revised?.short_summary}
          emptyText="Not present in revised answer"
        />

        <div className="rounded-lg border border-line bg-slate-50/70 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Short Explanation
          </div>
          <p className="text-sm leading-6 text-slate-700">
            {row.short_explanation}
          </p>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-atlasBlue">
            Possible Merge Suggestion
          </div>
          <p className="text-sm font-semibold capitalize text-slate-700">
            {actionLabel(recommendedAction)}
          </p>
        </div>
      </aside>
    );
  }

  if (!slot) {
    return (
      <aside className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted">
        Select a comparison row to inspect the full original and revised text.
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 space-y-3 rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Selected Comparison Detail
          </div>
          <h3 className="text-base font-bold text-ink">{slot.shared_topic}</h3>
        </div>
        <RelationBadge relation={slot.relation} />
      </div>

      <div className="rounded-lg border border-line bg-slate-50/70 p-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
          Importance
        </div>
        <p className="text-sm font-semibold capitalize text-slate-700">
          {detailImportance(slot)}
        </p>
      </div>

      <DetailSide
        label="Original"
        title={slot.original_node?.title}
        summary={slot.original_node?.summary}
        text={slot.original_node?.source_text}
        emptyText="Not present in original answer"
      />
      <DetailSide
        label="Revised"
        title={slot.revised_node?.title}
        summary={slot.revised_node?.summary}
        text={slot.revised_node?.source_text}
        emptyText="Not present in revised answer"
      />

      <div className="rounded-lg border border-line bg-slate-50/70 p-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
          Comparison
        </div>
        <p className="text-sm leading-6 text-slate-700">
          {slot.short_comparison}
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-atlasBlue">
          Possible Merge Suggestion
        </div>
        <p className="text-sm font-semibold capitalize text-slate-700">
          {actionLabel(recommendedAction)}
        </p>
      </div>
    </aside>
  );
}
