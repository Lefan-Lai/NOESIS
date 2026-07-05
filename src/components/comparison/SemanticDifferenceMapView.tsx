"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import {
  applySemanticMapProgramRules,
  createSemanticDifferenceDetailFallback,
  semanticBlockTypeForRow
} from "@/lib/comparison/semanticDifferenceMap";
import type {
  SemanticAlignmentRow,
  SemanticDifferenceDetail,
  SemanticDifferenceMap,
  SemanticPrimaryChange,
  SemanticRiskLevel,
  SemanticTag
} from "@/types/comparison";

type SemanticDifferenceMapViewProps = {
  map: SemanticDifferenceMap;
};

type DifferenceSide = "original" | "revised";
type ReviewFilter = "important" | "all_changes" | "annotation" | "unchanged";

const reviewFilters: Array<{ id: ReviewFilter; label: string }> = [
  { id: "important", label: "Important Changes" },
  { id: "all_changes", label: "All Changes" },
  { id: "annotation", label: "Annotation-linked" },
  { id: "unchanged", label: "Preserved" }
];

const changeStyles: Record<SemanticPrimaryChange, string> = {
  unchanged: "border-slate-200 bg-slate-50 text-slate-700",
  added: "border-emerald-200 bg-emerald-50 text-emerald-700",
  removed: "border-red-200 bg-red-50 text-red-700",
  rewritten: "border-blue-200 bg-blue-50 text-atlasBlue",
  moved: "border-purple-200 bg-purple-50 text-purple-700",
  split: "border-cyan-200 bg-cyan-50 text-cyan-700",
  merged: "border-indigo-200 bg-indigo-50 text-indigo-700"
};

const riskStyles: Record<SemanticRiskLevel, string> = {
  none: "border-slate-200 bg-white text-slate-500",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700"
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function titleCase(value: string) {
  return label(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isChangedRow(row: SemanticAlignmentRow) {
  return row.primaryChange !== "unchanged";
}

function isAnnotationLinkedRow(row: SemanticAlignmentRow) {
  return row.triggeredBy === "annotation";
}

function isQuestionLinkedRow(row: SemanticAlignmentRow) {
  return row.triggeredBy === "user_question";
}

function hasMeaningfulTag(row: SemanticAlignmentRow) {
  return row.semanticTags.some((tag) => tag !== "context_aligned");
}

function isImportantReviewRow(row: SemanticAlignmentRow) {
  if (!isChangedRow(row)) {
    return false;
  }

  return (
    row.importance !== "low" ||
    row.risk !== "none" ||
    isAnnotationLinkedRow(row) ||
    isQuestionLinkedRow(row) ||
    hasMeaningfulTag(row)
  );
}

function filterReviewRows(rows: SemanticAlignmentRow[], filter: ReviewFilter) {
  if (filter === "all_changes") {
    return rows.filter(isChangedRow);
  }

  if (filter === "annotation") {
    return rows.filter((row) => isAnnotationLinkedRow(row) && isChangedRow(row));
  }

  if (filter === "unchanged") {
    return rows.filter((row) => !isChangedRow(row));
  }

  return rows.filter(isImportantReviewRow);
}

function reviewFilterCounts(rows: SemanticAlignmentRow[]) {
  return {
    important: filterReviewRows(rows, "important").length,
    all_changes: filterReviewRows(rows, "all_changes").length,
    annotation: filterReviewRows(rows, "annotation").length,
    unchanged: filterReviewRows(rows, "unchanged").length
  } satisfies Record<ReviewFilter, number>;
}

function totalChangeCount(map: SemanticDifferenceMap) {
  return map.rows.filter(isChangedRow).length;
}

function mainChangeLabel(map: SemanticDifferenceMap) {
  const { counts } = map.overview;
  const options = [
    { label: "Claim changed", value: counts.claimChanged },
    { label: "Rewritten", value: counts.rewritten },
    { label: "Added", value: counts.added },
    { label: "Removed", value: counts.removed },
    { label: "Moved", value: counts.moved },
    { label: "Tone changed", value: counts.toneChanged }
  ].sort((a, b) => b.value - a.value);

  return options[0]?.value > 0 ? options[0].label : "Mostly preserved";
}

function sideBlock(row: SemanticAlignmentRow, side: DifferenceSide) {
  return side === "original" ? row.originalBlock : row.revisedBlock;
}

function oppositeBlock(row: SemanticAlignmentRow, side: DifferenceSide) {
  return side === "original" ? row.revisedBlock : row.originalBlock;
}

function sideModeLabel(side: DifferenceSide) {
  return side === "original" ? "Original Context" : "Revised Result";
}

function oppositeSideModeLabel(side: DifferenceSide) {
  return side === "original" ? "Revised Result" : "Original Context";
}

function sidePreviewLabel(side: DifferenceSide) {
  return side === "original" ? "Revised result preview" : "Original anchor preview";
}

function blockIndex(value: number | undefined) {
  return typeof value === "number" ? `#${value}` : "#?";
}

function whereChangedLabel(row: SemanticAlignmentRow) {
  const blockType = titleCase(semanticBlockTypeForRow(row));

  if (row.primaryChange === "added") {
    return `Inserted near revised block ${blockIndex(row.revisedIndex)} · ${blockType}`;
  }

  if (row.primaryChange === "removed") {
    return `Original block ${blockIndex(row.originalIndex)} removed · ${blockType}`;
  }

  if (row.primaryChange === "moved") {
    return `Original block ${blockIndex(row.originalIndex)} → revised block ${blockIndex(row.revisedIndex)} · ${blockType}`;
  }

  return `Original block ${blockIndex(row.originalIndex)} → revised block ${blockIndex(row.revisedIndex)} · ${blockType}`;
}

function whereChangedHelp(row: SemanticAlignmentRow) {
  if (row.primaryChange === "added") {
    return "This row is anchored to the place where the revised answer introduced new content.";
  }

  if (row.primaryChange === "removed") {
    return "This row is anchored to original content that no longer appears in the revised answer.";
  }

  if (row.primaryChange === "unchanged") {
    return "This preserved block is hidden from the main queue unless you open Preserved.";
  }

  return "Use this anchor to locate which original semantic block the revision changed.";
}

function sideMissingText(row: SemanticAlignmentRow, side: DifferenceSide) {
  if (side === "original" && row.primaryChange === "added") {
    return "No original sentence was replaced. The revised answer added this near the original anchor.";
  }

  if (side === "revised" && row.primaryChange === "removed") {
    return "No revised sentence remains here. This original content was removed from the revision.";
  }

  return "No matching block for this side.";
}

function sideChangeLabel(row: SemanticAlignmentRow, side: DifferenceSide) {
  if (row.primaryChange === "unchanged") {
    return "Preserved";
  }

  if (side === "original") {
    if (row.primaryChange === "removed") {
      return "Original sentence removed from revision";
    }

    if (row.primaryChange === "added") {
      return "Insertion point in original context";
    }

    return "Original sentence changed by revision";
  }

  if (row.primaryChange === "added") {
    return "New revised sentence";
  }

  if (row.primaryChange === "removed") {
    return "Removed from revised result";
  }

  return "Revised sentence";
}

function sidePanelClass(row: SemanticAlignmentRow, side: DifferenceSide) {
  if (row.primaryChange === "unchanged") {
    return "border-slate-200 bg-slate-50";
  }

  if (side === "original") {
    if (row.primaryChange === "removed") {
      return "border-red-200 bg-red-50";
    }

    if (row.primaryChange === "added") {
      return "border-slate-200 bg-slate-50";
    }

    if (row.risk === "high") {
      return "border-red-200 bg-red-50";
    }

    return "border-amber-200 bg-amber-50";
  }

  if (row.primaryChange === "added") {
    return "border-emerald-200 bg-emerald-50";
  }

  if (row.primaryChange === "removed") {
    return "border-red-200 bg-red-50";
  }

  if (row.risk === "high") {
    return "border-red-200 bg-red-50";
  }

  return "border-blue-200 bg-blue-50";
}

function sideTextClass(row: SemanticAlignmentRow, side: DifferenceSide) {
  if (row.primaryChange === "removed" && side === "original") {
    return "text-red-900";
  }

  if (row.primaryChange === "removed" && side === "revised") {
    return "text-red-700";
  }

  if (row.primaryChange === "added" && side === "revised") {
    return "text-emerald-900";
  }

  if (side === "original" && row.primaryChange !== "unchanged") {
    return "text-amber-950";
  }

  if (side === "revised" && row.primaryChange !== "unchanged") {
    return "text-blue-950";
  }

  return "text-slate-800";
}

function priorityClass(row: SemanticAlignmentRow) {
  if (row.risk === "high" || row.semanticTags.includes("risk_introduced")) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (
    row.risk === "medium" ||
    row.semanticTags.includes("scope_expanded") ||
    row.semanticTags.includes("scope_narrowed") ||
    row.semanticTags.includes("claim_softened")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    row.semanticTags.includes("evidence_added") ||
    row.semanticTags.includes("example_added") ||
    row.semanticTags.includes("limitation_added")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (!isChangedRow(row)) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-blue-200 bg-blue-50 text-atlasBlue";
}

function priorityLabel(row: SemanticAlignmentRow) {
  if (row.risk === "high" || row.semanticTags.includes("risk_introduced")) {
    return "Review first";
  }

  if (isAnnotationLinkedRow(row)) {
    return "Note-linked";
  }

  if (isQuestionLinkedRow(row)) {
    return "Question-linked";
  }

  if (!isChangedRow(row)) {
    return "Preserved";
  }

  return "Review change";
}

function suggestedAction(row: SemanticAlignmentRow) {
  if (!isChangedRow(row)) {
    return "No action by default. Use only when you need to verify preserved context.";
  }

  if (row.risk === "high" || row.semanticTags.includes("risk_introduced")) {
    return "Review before merge.";
  }

  if (
    row.semanticTags.includes("evidence_removed") ||
    row.semanticTags.includes("example_removed") ||
    row.primaryChange === "removed"
  ) {
    return "Check whether removed support is intentional.";
  }

  if (isAnnotationLinkedRow(row)) {
    return "Check against the active annotation.";
  }

  if (isQuestionLinkedRow(row)) {
    return "Check whether it answers your local question.";
  }

  if (
    row.semanticTags.includes("evidence_added") ||
    row.semanticTags.includes("example_added") ||
    row.semanticTags.includes("limitation_added")
  ) {
    return "Likely useful support; verify before merge.";
  }

  return "Review wording and merge if it preserves intent.";
}

function sortRowsByLensPosition(rows: SemanticAlignmentRow[]) {
  return [...rows].sort((a, b) => {
    const aPosition = a.originalIndex ?? a.revisedIndex ?? 9999;
    const bPosition = b.originalIndex ?? b.revisedIndex ?? 9999;

    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }

    return (a.revisedIndex ?? 9999) - (b.revisedIndex ?? 9999);
  });
}

function rowSourceText(row: SemanticAlignmentRow) {
  return row.originalBlock?.text || row.originalBlock?.preview;
}

function rowCurrentText(row: SemanticAlignmentRow) {
  return row.revisedBlock?.text || row.revisedBlock?.preview;
}

function lensLabel(row: SemanticAlignmentRow) {
  if (row.primaryChange === "added") {
    return "Added here";
  }

  if (row.primaryChange === "removed") {
    return "Removed";
  }

  if (row.primaryChange === "moved") {
    return "Moved";
  }

  if (row.primaryChange === "split") {
    return "Split";
  }

  if (row.primaryChange === "merged") {
    return "Merged";
  }

  if (row.primaryChange === "unchanged") {
    return "Preserved";
  }

  return "Rewritten";
}

function lensAccent(row: SemanticAlignmentRow) {
  if (row.risk === "high" || row.semanticTags.includes("risk_introduced")) {
    return {
      rail: "bg-red-500",
      badge: "border-red-200 bg-red-50 text-red-700",
      source: "bg-red-50/80 text-red-950 ring-red-200",
      current: "border-red-200 bg-white"
    };
  }

  if (row.primaryChange === "added") {
    return {
      rail: "bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      source: "bg-emerald-50/70 text-emerald-950 ring-emerald-200",
      current: "border-emerald-200 bg-emerald-50/70"
    };
  }

  if (row.primaryChange === "removed") {
    return {
      rail: "bg-red-500",
      badge: "border-red-200 bg-red-50 text-red-700",
      source: "bg-red-50/80 text-red-950 ring-red-200",
      current: "border-red-200 bg-red-50/40"
    };
  }

  if (row.primaryChange === "moved") {
    return {
      rail: "bg-purple-500",
      badge: "border-purple-200 bg-purple-50 text-purple-700",
      source: "bg-purple-50/70 text-purple-950 ring-purple-200",
      current: "border-purple-200 bg-purple-50/50"
    };
  }

  if (row.primaryChange === "unchanged") {
    return {
      rail: "bg-slate-300",
      badge: "border-slate-200 bg-slate-50 text-slate-600",
      source: "bg-slate-50 text-slate-800 ring-slate-200",
      current: "border-slate-200 bg-slate-50"
    };
  }

  return {
    rail: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-atlasBlue",
    source: "bg-blue-50/70 text-blue-950 ring-blue-200",
    current: "border-blue-200 bg-blue-50/50"
  };
}

function sourceCue(row: SemanticAlignmentRow) {
  if (isAnnotationLinkedRow(row)) {
    return "from note";
  }

  if (isQuestionLinkedRow(row)) {
    return "from question";
  }

  if (row.triggeredBy === "context_alignment") {
    return "context aligned";
  }

  return "model inferred";
}

function EmptyBlock({ labelText }: { labelText: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-slate-50 px-3 py-3 text-sm font-semibold text-muted">
      {labelText}
    </div>
  );
}

function coreTagChips(tags: SemanticTag[]) {
  const visible = tags.slice(0, 2);
  const hiddenCount = Math.max(0, tags.length - visible.length);

  return {
    visible,
    hiddenCount
  };
}

function Pill({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${className}`}
    >
      {children}
    </span>
  );
}

function Overview({ map }: { map: SemanticDifferenceMap }) {
  const { counts } = map.overview;
  const headlineStats = [
    {
      name: "Meaning",
      value: titleCase(map.overview.meaningEffect),
      className: "border-blue-200 bg-blue-50 text-atlasBlue"
    },
    {
      name: "Risk",
      value: `${titleCase(map.overview.riskLevel)} Risk`,
      className: riskStyles[map.overview.riskLevel]
    },
    {
      name: "Main Change",
      value: mainChangeLabel(map),
      className: "border-violet-200 bg-violet-50 text-violet-700"
    },
    {
      name: "Changed Blocks",
      value: String(totalChangeCount(map)),
      className: "border-slate-200 bg-slate-50 text-slate-700"
    }
  ];
  const stats = [
    ["Added", counts.added],
    ["Removed", counts.removed],
    ["Rewritten", counts.rewritten],
    ["Moved", counts.moved],
    ["Claim changed", counts.claimChanged],
    ["Tone changed", counts.toneChanged]
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Layer 1 - Difference Overview
          </div>
          <h3 className="text-base font-bold text-ink">
            {map.overview.mainSummary}
          </h3>
        </div>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-4">
        {headlineStats.map((item) => (
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
        {stats.map(([name, value]) => (
          <div
            key={name}
            className="flex min-w-[118px] items-center justify-between gap-3 rounded-md border border-line bg-slate-50 px-3 py-2"
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
              {name}
            </div>
            <div className="text-base font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlignmentRow({
  row,
  side,
  selected,
  onSelect
}: {
  row: SemanticAlignmentRow;
  side: DifferenceSide;
  selected: boolean;
  onSelect: () => void;
}) {
  const tags = coreTagChips(row.semanticTags);
  const isHighRisk = row.risk === "high";
  const block = sideBlock(row, side);
  const otherBlock = oppositeBlock(row, side);
  const blockText = block?.text || block?.preview;
  const otherPreview = otherBlock?.preview || otherBlock?.text;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition hover:bg-blue-50/40 focus:bg-blue-50/40 focus:outline-none ${
        selected ? "border-atlasBlue bg-blue-50/50 ring-1 ring-atlasBlue" : "border-line bg-white"
      } ${isHighRisk ? "border-l-4 border-l-red-400" : ""}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
              {sideModeLabel(side)}
            </div>
            <div className="mt-1 text-base font-bold text-ink">
              {row.shortReason ?? row.explanation ?? sideChangeLabel(row, side)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill className={priorityClass(row)}>
              {priorityLabel(row)}
            </Pill>
            <Pill className={changeStyles[row.primaryChange]}>
              {row.primaryChange}
            </Pill>
            <Pill className="border-slate-200 bg-slate-50 text-slate-600">
              {row.importance}
            </Pill>
            <Pill className={riskStyles[row.risk]}>{row.risk} risk</Pill>
          </div>
        </div>

        <div className="rounded-md border border-line bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Where changed
          </div>
          <div className="mt-1 text-sm font-bold text-ink">
            {whereChangedLabel(row)}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {whereChangedHelp(row)}
          </p>
        </div>

        <div className={`rounded-lg border p-4 ${sidePanelClass(row, side)}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {sideModeLabel(side)}
              </div>
              <div className="text-sm font-bold text-ink">
                {sideChangeLabel(row, side)}
              </div>
            </div>
            <Pill className="border-white/70 bg-white/70 text-slate-700">
              {block?.blockType ?? semanticBlockTypeForRow(row)}
            </Pill>
          </div>
          {blockText ? (
            <p className={`whitespace-pre-wrap text-base leading-8 ${sideTextClass(row, side)}`}>
              {blockText}
            </p>
          ) : (
            <EmptyBlock labelText={sideMissingText(row, side)} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tags.visible.map((tag) => (
            <span
              key={tag}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
            >
              {label(tag)}
            </span>
          ))}
          {tags.hiddenCount > 0 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
              +{tags.hiddenCount}
            </span>
          )}
          {row.primaryChange === "moved" && (
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
              original #{row.originalIndex ?? "?"} to revised #{row.revisedIndex ?? "?"}
            </span>
          )}
        </div>

        {otherPreview && (
          <div className="rounded-md border border-dashed border-line bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">
            <span className="font-bold uppercase tracking-wide">
              {sidePreviewLabel(side)}
            </span>
            {": "}
            <span className="font-semibold text-slate-700">{otherPreview}</span>
            <span className="ml-1">
              Switch to {oppositeSideModeLabel(side)} for the full text.
            </span>
          </div>
        )}

        <div className="rounded-md border border-line bg-white px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Suggested action
          </div>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
            {suggestedAction(row)}
          </p>
        </div>
      </div>
    </button>
  );
}

function SideToggle({
  side,
  onSideChange
}: {
  side: DifferenceSide;
  onSideChange: (side: DifferenceSide) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-1">
      {(["original", "revised"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSideChange(item)}
          className={`h-8 rounded-md px-3 text-xs font-bold transition ${
            side === item
              ? "bg-atlasBlue text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {sideModeLabel(item)}
        </button>
      ))}
    </div>
  );
}

function ReviewFilterBar({
  activeFilter,
  counts,
  onFilterChange
}: {
  activeFilter: ReviewFilter;
  counts: Record<ReviewFilter, number>;
  onFilterChange: (filter: ReviewFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-white p-2">
      {reviewFilters.map((filter) => {
        const active = activeFilter === filter.id;

        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onFilterChange(filter.id)}
            className={`h-8 rounded-md border px-3 text-xs font-bold transition ${
              active
                ? "border-atlasBlue bg-blue-50 text-atlasBlue"
                : "border-line bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {filter.label}
            <span className="ml-1 text-[11px] font-semibold text-muted">
              {counts[filter.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DifferenceLensRow({
  row,
  selected,
  onSelect
}: {
  row: SemanticAlignmentRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const tags = coreTagChips(row.semanticTags);
  const accent = lensAccent(row);
  const sourceText = rowSourceText(row);
  const currentText = rowCurrentText(row);
  const blockType = titleCase(semanticBlockTypeForRow(row));
  const hasCurrentText = Boolean(currentText);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-lg border bg-white p-0 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/20 focus:outline-none ${
        selected
          ? "border-atlasBlue ring-2 ring-blue-100"
          : "border-line"
      }`}
    >
      <div className="grid gap-0 md:grid-cols-[76px_minmax(0,1fr)]">
        <div className="border-b border-line bg-slate-50/80 px-3 py-4 md:border-b-0 md:border-r">
          <div className={`mx-auto h-3 w-3 rounded-full ${accent.rail}`} />
          <div className="mt-3 text-center text-xs font-bold text-slate-700">
            {blockIndex(row.originalIndex ?? row.revisedIndex)}
          </div>
          <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted">
            {blockType}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={accent.badge}>{lensLabel(row)}</Pill>
                <Pill className={riskStyles[row.risk]}>{row.risk} risk</Pill>
                <Pill className="border-slate-200 bg-slate-50 text-slate-600">
                  {sourceCue(row)}
                </Pill>
              </div>
              <div className="mt-2 text-sm font-bold leading-6 text-ink">
                {row.shortReason ?? row.explanation ?? suggestedAction(row)}
              </div>
            </div>
            <div className="text-xs font-semibold text-muted">
              {whereChangedLabel(row)}
            </div>
          </div>

          <div className={`rounded-lg px-3 py-3 ring-1 ${accent.source}`}>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-70">
              Source sentence
            </div>
            {sourceText ? (
              <p className="whitespace-pre-wrap text-[15px] leading-7">
                {sourceText}
              </p>
            ) : (
              <p className="text-sm font-semibold leading-6">
                This change is anchored to an insertion point rather than a replaced source sentence.
              </p>
            )}
          </div>

          <div className={`rounded-lg border px-3 py-3 ${accent.current}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Current difference
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {row.confidence} confidence
              </span>
            </div>
            {hasCurrentText ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {currentText}
              </p>
            ) : (
              <p className="text-sm font-semibold leading-6 text-red-700">
                No current sentence remains here; the source sentence was removed.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tags.visible.map((tag) => (
              <span
                key={tag}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
              >
                {label(tag)}
              </span>
            ))}
            {tags.hiddenCount > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                +{tags.hiddenCount}
              </span>
            )}
            <span className="ml-auto text-xs font-semibold text-slate-500">
              {suggestedAction(row)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function DifferenceLens({
  rows,
  reviewFilter,
  filterCounts,
  onReviewFilterChange,
  selectedRowId,
  onSelectRow
}: {
  rows: SemanticAlignmentRow[];
  reviewFilter: ReviewFilter;
  filterCounts: Record<ReviewFilter, number>;
  onReviewFilterChange: (filter: ReviewFilter) => void;
  selectedRowId: string | null;
  onSelectRow: (row: SemanticAlignmentRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line bg-slate-50/70 px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-muted">
          Layer 2 - Difference Lens
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Read the source answer as the base layer. Only changed, added, removed, or note-linked blocks are emphasized; the current difference is shown directly under each source sentence.
        </p>
      </div>
      <div className="border-b border-line bg-white px-4 py-3">
        <ReviewFilterBar
          activeFilter={reviewFilter}
          counts={filterCounts}
          onFilterChange={onReviewFilterChange}
        />
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3 bg-slate-50/50 p-3">
          {rows.map((row) => (
            <DifferenceLensRow
              key={row.id}
              row={row}
              selected={selectedRowId === row.id}
              onSelect={() => onSelectRow(row)}
            />
          ))}
        </div>
      ) : (
        <div className="p-4 text-sm text-muted">
          No rows match this lens filter. Try All Changes or Preserved.
        </div>
      )}
    </section>
  );
}

function RowSection({
  title,
  rows,
  side,
  selectedRowId,
  onSelectRow
}: {
  title: string;
  rows: SemanticAlignmentRow[];
  side: DifferenceSide;
  selectedRowId: string | null;
  onSelectRow: (row: SemanticAlignmentRow) => void;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="border-b border-line bg-slate-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="space-y-3 p-3">
        {rows.map((row) => (
          <AlignmentRow
            key={row.id}
            row={row}
            side={side}
            selected={selectedRowId === row.id}
            onSelect={() => onSelectRow(row)}
          />
        ))}
      </div>
    </div>
  );
}

function AlignmentBoard({
  importantRows,
  hiddenImportantRows,
  mediumRows,
  lowRows,
  showHiddenImportant,
  showMedium,
  showLow,
  onToggleHiddenImportant,
  onToggleMedium,
  onToggleLow,
  side,
  onSideChange,
  reviewFilter,
  filterCounts,
  onReviewFilterChange,
  selectedRowId,
  onSelectRow
}: {
  importantRows: SemanticAlignmentRow[];
  hiddenImportantRows: SemanticAlignmentRow[];
  mediumRows: SemanticAlignmentRow[];
  lowRows: SemanticAlignmentRow[];
  showHiddenImportant: boolean;
  showMedium: boolean;
  showLow: boolean;
  onToggleHiddenImportant: () => void;
  onToggleMedium: () => void;
  onToggleLow: () => void;
  side: DifferenceSide;
  onSideChange: (side: DifferenceSide) => void;
  reviewFilter: ReviewFilter;
  filterCounts: Record<ReviewFilter, number>;
  onReviewFilterChange: (filter: ReviewFilter) => void;
  selectedRowId: string | null;
  onSelectRow: (row: SemanticAlignmentRow) => void;
}) {
  const primaryTitle =
    reviewFilter === "unchanged"
      ? "Preserved blocks"
      : reviewFilter === "annotation"
        ? "Annotation-linked changes"
        : reviewFilter === "all_changes"
          ? "Changed blocks"
          : "Important changes";

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-slate-50/70 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            Layer 2 - Review Queue
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            Unchanged blocks are hidden by default. Start in Original Context to locate where the change happened, then switch to Revised Result to inspect the outcome.
          </p>
        </div>
        <SideToggle side={side} onSideChange={onSideChange} />
      </div>
      <div className="border-b border-line bg-white px-4 py-3">
        <ReviewFilterBar
          activeFilter={reviewFilter}
          counts={filterCounts}
          onFilterChange={onReviewFilterChange}
        />
      </div>

      {importantRows.length > 0 ? (
        <>
          <RowSection
            title={primaryTitle}
            rows={importantRows}
            side={side}
            selectedRowId={selectedRowId}
            onSelectRow={onSelectRow}
          />
          {hiddenImportantRows.length > 0 && (
            <CollapsedSectionButton
              label={
                showHiddenImportant
                  ? "Hide additional important changes"
                  : `Show ${hiddenImportantRows.length} additional important changes`
              }
              expanded={showHiddenImportant}
              onClick={onToggleHiddenImportant}
            />
          )}
          {showHiddenImportant && (
            <RowSection
              title="Additional important changes"
              rows={hiddenImportantRows}
              side={side}
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
            />
          )}
        </>
      ) : (
        <div className="p-4 text-sm text-muted">
          No rows match this review filter. Try All Changes or Preserved.
        </div>
      )}

      {mediumRows.length > 0 && (
        <>
          <CollapsedSectionButton
            label={
              showMedium
                ? "Hide more semantic changes"
                : `Show ${mediumRows.length} medium semantic changes`
            }
            expanded={showMedium}
            onClick={onToggleMedium}
          />
          {showMedium && (
            <RowSection
              title="More semantic changes"
              rows={mediumRows}
              side={side}
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
            />
          )}
        </>
      )}

      {lowRows.length > 0 && (
        <>
          <CollapsedSectionButton
            label={
              showLow
                ? "Hide minor changes"
                : `Show ${lowRows.length} minor changes`
            }
            expanded={showLow}
            onClick={onToggleLow}
          />
          {showLow && (
            <RowSection
              title="Minor changes"
              rows={lowRows}
              side={side}
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
            />
          )}
        </>
      )}
    </section>
  );
}

function CollapsedSectionButton({
  label,
  expanded,
  onClick
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-line bg-slate-50/60 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
    >
      <span>{label}</span>
      <span className="text-xs text-muted">{expanded ? "expanded" : "collapsed"}</span>
    </button>
  );
}

function DetailPanel({
  row,
  detail,
  loading,
  error
}: {
  row: SemanticAlignmentRow | undefined;
  detail: SemanticDifferenceDetail | undefined;
  loading: boolean;
  error: string | null;
}) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted">
        Layer 3 - Select a highlighted change to inspect why it changed.
      </aside>
    );
  }

  if (loading) {
    return (
      <aside className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-atlasBlue">
        <div className="flex items-center gap-2">
        <Loader2 size={17} className="animate-spin" />
          Generating focused difference explanation...
        </div>
      </aside>
    );
  }

  const resolvedDetail = detail;

  if (!resolvedDetail) {
    return (
      <aside className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted">
        {error ?? "Click a highlighted source sentence to generate its focused explanation."}
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
        Layer 3 - Difference Inspector
      </div>
      <div className="space-y-4 text-sm leading-6">
        <div>
          <div className="mb-1 font-bold text-ink">Source sentence</div>
          <p className="rounded-md border border-line bg-slate-50 p-3 text-slate-700">
            {resolvedDetail.originalFullBlock}
          </p>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Current sentence</div>
          <p className="rounded-md border border-line bg-slate-50 p-3 text-slate-700">
            {resolvedDetail.revisedFullBlock}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill className={changeStyles[resolvedDetail.primaryChange]}>
            {resolvedDetail.primaryChange}
          </Pill>
          <Pill className={riskStyles[resolvedDetail.risk]}>{resolvedDetail.risk} risk</Pill>
          <Pill className="border-slate-200 bg-slate-50 text-slate-600">
            {resolvedDetail.confidence} confidence
          </Pill>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Tags</div>
          <div className="flex flex-wrap gap-1">
            {resolvedDetail.semanticTags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
              >
                {label(tag)}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Explanation</div>
          <p className="text-slate-700">{resolvedDetail.explanation}</p>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Why it matters</div>
          <p className="text-slate-700">{resolvedDetail.whyItMatters}</p>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Triggered by</div>
          <p className="text-slate-700">{label(resolvedDetail.triggeredBy)}</p>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Context impact</div>
          <p className="text-slate-700">{resolvedDetail.contextImpact}</p>
        </div>
      </div>
    </aside>
  );
}

export function SemanticDifferenceMapView({
  map
}: SemanticDifferenceMapViewProps) {
  const selectedModel = useAnswerAtlasStore((state) => state.selectedModel);
  const setActiveReviewFocus = useAnswerAtlasStore(
    (state) => state.setActiveReviewFocus
  );
  const normalizedMap = useMemo(() => applySemanticMapProgramRules(map), [map]);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("important");
  const filterCounts = useMemo(
    () => reviewFilterCounts(normalizedMap.rows),
    [normalizedMap.rows]
  );
  const visibleRows = useMemo(
    () => sortRowsByLensPosition(filterReviewRows(normalizedMap.rows, reviewFilter)),
    [normalizedMap.rows, reviewFilter]
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SemanticDifferenceDetail>>({});
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedRow =
    visibleRows.find((row) => row.id === selectedRowId) ?? undefined;

  async function selectRow(row: SemanticAlignmentRow) {
    setSelectedRowId(row.id);
    setDetailError(null);
    setActiveReviewFocus({
      id: `semantic-focus-${row.id}-${Date.now().toString(36)}`,
      source: "semantic_difference_map",
      semanticRowId: row.id,
      anchorId: normalizedMap.anchorId,
      documentId: normalizedMap.documentId,
      originalBlockId: row.originalBlock?.id,
      revisedBlockId: row.revisedBlock?.id,
      originalText: row.originalBlock?.text ?? row.originalBlock?.preview,
      revisedText: row.revisedBlock?.text ?? row.revisedBlock?.preview,
      originalIndex: row.originalIndex,
      revisedIndex: row.revisedIndex,
      primaryChange: row.primaryChange,
      createdAt: new Date().toISOString()
    });

    if (details[row.id] || loadingRowId === row.id) {
      return;
    }

    setLoadingRowId(row.id);

    try {
      const response = await fetch("/api/llm/semantic-difference-detail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId: normalizedMap.documentId,
          anchorId: normalizedMap.anchorId,
          row,
          originalText: normalizedMap.originalText,
          revisedText: normalizedMap.revisedText,
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate detail");
      }

      const data = (await response.json()) as {
        output: {
          detail: SemanticDifferenceDetail;
        };
      };

      setDetails((current) => ({
        ...current,
        [row.id]: data.output.detail
      }));
    } catch {
      setDetails((current) => ({
        ...current,
        [row.id]: createSemanticDifferenceDetailFallback(row)
      }));
      setDetailError("The model detail request failed, so a local fallback explanation is shown.");
    } finally {
      setLoadingRowId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Overview map={normalizedMap} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DifferenceLens
          rows={visibleRows}
          reviewFilter={reviewFilter}
          filterCounts={filterCounts}
          onReviewFilterChange={(nextFilter) => {
            setReviewFilter(nextFilter);
            setSelectedRowId(null);
          }}
          selectedRowId={selectedRowId}
          onSelectRow={selectRow}
        />

        <DetailPanel
          row={selectedRow}
          detail={selectedRow ? details[selectedRow.id] : undefined}
          loading={Boolean(selectedRow && loadingRowId === selectedRow.id)}
          error={detailError}
        />
      </div>
    </div>
  );
}
