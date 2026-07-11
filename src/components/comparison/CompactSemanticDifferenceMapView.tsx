"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { applySemanticMapProgramRules } from "@/lib/comparison/semanticDifferenceMap";
import {
  computePreciseTextDiff,
  contextForRange,
  type PreciseTextChange
} from "@/lib/comparison/preciseTextDiff";
import type {
  SemanticAlignmentRow,
  SemanticDifferenceMap,
  SemanticRiskLevel
} from "@/types/comparison";

type CompactSemanticDifferenceMapViewProps = {
  map: SemanticDifferenceMap;
};

const riskClasses: Record<SemanticRiskLevel, string> = {
  none: "bg-slate-100 text-slate-600",
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700"
};

const overviewRiskClasses: Record<SemanticRiskLevel, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700"
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function mainChangeLabel(counts: {
  added: number;
  removed: number;
  replaced: number;
}) {
  if (counts.replaced > 0) {
    return "Rewritten";
  }

  if (counts.added > 0 && counts.removed > 0) {
    return "Restructured";
  }

  if (counts.added > 0) {
    return "Expanded";
  }

  if (counts.removed > 0) {
    return "Reduced";
  }

  return "Preserved";
}

function changeLabel(change: PreciseTextChange) {
  if (change.type === "added") {
    return "Added";
  }

  if (change.type === "removed") {
    return "Removed";
  }

  return "Replaced";
}

function changeClasses(change: PreciseTextChange) {
  if (change.type === "added") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (change.type === "removed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-blue-200 bg-blue-50 text-atlasBlue";
}

function matchingSemanticRow(
  change: PreciseTextChange,
  rows: SemanticAlignmentRow[]
) {
  const changedRows = rows.filter((row) => row.primaryChange !== "unchanged");
  const exact = changedRows.find((row) => {
    const original = row.originalBlock?.text ?? "";
    const revised = row.revisedBlock?.text ?? "";

    return (
      Boolean(change.originalText && original.includes(change.originalText)) ||
      Boolean(change.revisedText && revised.includes(change.revisedText))
    );
  });

  return exact ?? (changedRows.length === 1 ? changedRows[0] : undefined);
}

function ContextLine({
  label,
  text,
  change,
  side
}: {
  label: string;
  text: string;
  change: PreciseTextChange;
  side: "original" | "revised";
}) {
  const range = side === "original" ? change.originalRange : change.revisedRange;
  const context = contextForRange(text, range);
  const isOriginal = side === "original";

  if (!range) {
    return null;
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-3">
      <div className="pt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
        <span>{context.before}</span>
        <mark
          className={
            isOriginal
              ? "rounded-sm bg-red-100 px-0.5 text-red-900 line-through decoration-red-500"
              : "rounded-sm bg-emerald-100 px-0.5 font-semibold text-emerald-900"
          }
        >
          {context.changed || (isOriginal ? "removed" : "added")}
        </mark>
        <span>{context.after}</span>
      </p>
    </div>
  );
}

export function CompactSemanticDifferenceMapView({
  map
}: CompactSemanticDifferenceMapViewProps) {
  const normalizedMap = useMemo(() => applySemanticMapProgramRules(map), [map]);
  const changes = useMemo(
    () => computePreciseTextDiff(normalizedMap.originalText, normalizedMap.revisedText).changes,
    [normalizedMap.originalText, normalizedMap.revisedText]
  );
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const setActiveReviewFocus = useAnswerAtlasStore((state) => state.setActiveReviewFocus);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const anchor = anchors[normalizedMap.anchorId];
  const visibleChanges = showAll ? changes : changes.slice(0, 6);
  const counts = useMemo(
    () => ({
      added: changes.filter((change) => change.type === "added").length,
      removed: changes.filter((change) => change.type === "removed").length,
      replaced: changes.filter((change) => change.type === "replaced").length
    }),
    [changes]
  );

  useEffect(
    () => () => setActiveReviewFocus(null),
    [setActiveReviewFocus]
  );

  function selectChange(change: PreciseTextChange) {
    if (selectedChangeId === change.id) {
      setSelectedChangeId(null);
      setActiveReviewFocus(null);
      return;
    }

    const row = matchingSemanticRow(change, normalizedMap.rows);
    const anchorOffset = anchor?.startOffset ?? 0;

    setSelectedChangeId(change.id);
    setActiveReviewFocus({
      id: `semantic-focus-${normalizedMap.id}-${change.id}`,
      source: "semantic_difference_map",
      semanticRowId: row?.id,
      anchorId: normalizedMap.anchorId,
      documentId: normalizedMap.documentId,
      sourceMessageId: anchor?.sourceMessageId,
      revisedThreadId: selectedThreadId ?? undefined,
      originalBlockId: row?.originalBlock?.id,
      revisedBlockId: row?.revisedBlock?.id,
      originalText: change.originalText || undefined,
      revisedText: change.revisedText || undefined,
      originalStartOffset: change.originalRange
        ? anchorOffset + change.originalRange.start
        : undefined,
      originalEndOffset: change.originalRange
        ? anchorOffset + change.originalRange.end
        : undefined,
      revisedStartOffset: change.revisedRange?.start,
      revisedEndOffset: change.revisedRange?.end,
      originalIndex: row?.originalIndex,
      revisedIndex: row?.revisedIndex,
      primaryChange: change.type,
      createdAt: new Date().toISOString()
    });
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 min-w-0">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Layer 1 - Difference Overview
          </div>
          <h3 className="text-base font-bold leading-6 text-ink">
            {changes.length === 0
              ? "No textual change detected."
              : normalizedMap.overview.mainSummary}
          </h3>
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              name: "Meaning",
              value: titleCase(normalizedMap.overview.meaningEffect),
              className: "border-blue-200 bg-blue-50 text-atlasBlue"
            },
            {
              name: "Risk",
              value: `${titleCase(normalizedMap.overview.riskLevel)} Risk`,
              className: overviewRiskClasses[normalizedMap.overview.riskLevel]
            },
            {
              name: "Main Change",
              value: mainChangeLabel(counts),
              className: "border-violet-200 bg-violet-50 text-violet-700"
            },
            {
              name: "Changed Blocks",
              value: String(changes.length),
              className: "border-slate-200 bg-slate-50 text-slate-700"
            }
          ].map((item) => (
            <div
              key={item.name}
              className={`rounded-md border px-3 py-2 ${item.className}`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                {item.name}
              </div>
              <div className="mt-1 text-sm font-bold">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["Added", counts.added],
            ["Removed", counts.removed],
            ["Rewritten", counts.replaced],
            ["Moved", normalizedMap.overview.counts.moved],
            ["Claim changed", normalizedMap.overview.counts.claimChanged],
            ["Tone changed", normalizedMap.overview.counts.toneChanged]
          ].map(([name, value]) => (
            <div
              key={name}
              className="flex min-w-[112px] flex-1 items-center justify-between gap-3 rounded-md border border-line bg-slate-50 px-3 py-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {name}
              </div>
              <div className="text-base font-bold text-ink">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">
              Layer 2 - Precise Changes
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Only changed locations are shown. Select one to inspect exact context.
            </div>
          </div>
          <span className={`rounded px-2 py-1 text-[11px] font-bold ${riskClasses[normalizedMap.overview.riskLevel]}`}>
            {changes.length} change{changes.length === 1 ? "" : "s"}
          </span>
        </div>

        {changes.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-muted">
          The revised text matches the selected source text.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleChanges.map((change, index) => {
            const selected = selectedChangeId === change.id;
            const semanticRow = matchingSemanticRow(change, normalizedMap.rows);

            return (
              <article
                key={change.id}
                className={`overflow-hidden rounded-md border bg-white ${
                  selected ? "border-atlasBlue ring-2 ring-blue-100" : "border-line"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectChange(change)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${changeClasses(change)}`}>
                    {changeLabel(change)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {semanticRow?.shortReason ??
                      (change.type === "replaced"
                        ? `${change.originalText || "source text"} -> ${change.revisedText || "new text"}`
                        : change.originalText || change.revisedText)}
                  </span>
                  <MapPin size={14} className="shrink-0 text-atlasBlue" />
                  {selected ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>

                {selected && (
                  <div className="space-y-2 border-t border-line bg-slate-50/50 px-3 py-3">
                    <ContextLine label="Original" text={normalizedMap.originalText} change={change} side="original" />
                    <ContextLine label="Current" text={normalizedMap.revisedText} change={change} side="revised" />
                    {semanticRow && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs text-slate-600">
                        <span className="font-semibold">{semanticRow.explanation ?? semanticRow.shortReason}</span>
                        {semanticRow.semanticTags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded bg-white px-2 py-0.5 font-semibold">
                            {tag.replaceAll("_", " ")}
                          </span>
                        ))}
                        <span className="ml-auto font-semibold">{semanticRow.confidence} confidence</span>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        )}

        {changes.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          {showAll ? "Show fewer changes" : `Show ${changes.length - 6} more changes`}
        </button>
        )}
      </section>
    </div>
  );
}
