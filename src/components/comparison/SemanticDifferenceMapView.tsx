"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import {
  applySemanticMapProgramRules,
  createSemanticDifferenceDetailFallback,
  groupSemanticRowsForDisplay,
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

function EmptyBlock({ labelText }: { labelText: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-slate-50 px-3 py-3 text-sm font-semibold text-muted">
      {labelText}
    </div>
  );
}

function BlockPreview({
  block
}: {
  block: SemanticAlignmentRow["originalBlock"];
}) {
  if (!block) {
    return <EmptyBlock labelText="No matching block" />;
  }

  return (
    <div className="space-y-2">
      <span className="inline-flex rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {block.blockType}
      </span>
      <p className="text-sm leading-6 text-slate-700">{block.preview}</p>
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
        <div className="flex flex-wrap gap-2">
          <Pill className="border-blue-200 bg-blue-50 text-atlasBlue">
            {label(map.overview.meaningEffect)}
          </Pill>
          <Pill className={riskStyles[map.overview.riskLevel]}>
            {map.overview.riskLevel} risk
          </Pill>
        </div>
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
  selected,
  onSelect
}: {
  row: SemanticAlignmentRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const tags = coreTagChips(row.semanticTags);
  const isHighRisk = row.risk === "high";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-blue-50/40 focus:bg-blue-50/40 focus:outline-none ${
        selected ? "bg-blue-50/70 ring-1 ring-inset ring-atlasBlue" : "bg-white"
      } ${isHighRisk ? "border-l-4 border-l-red-400" : ""}`}
    >
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)]">
          <div className="min-w-0 rounded-md border border-line bg-white p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              Original
            </div>
            <BlockPreview block={row.originalBlock} />
          </div>

          <div className="min-w-0 rounded-md border border-blue-100 bg-blue-50/40 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              Change
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Pill className="border-slate-200 bg-white text-slate-600">
                  {semanticBlockTypeForRow(row)}
                </Pill>
                <Pill className={changeStyles[row.primaryChange]}>
                  {row.primaryChange}
                </Pill>
                <Pill className="border-slate-200 bg-slate-50 text-slate-600">
                  {row.importance}
                </Pill>
                <Pill className={riskStyles[row.risk]}>{row.risk} risk</Pill>
              </div>
              <div className="flex flex-wrap gap-1">
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
              </div>
              {row.primaryChange === "moved" && (
                <p className="text-xs font-semibold leading-5 text-slate-600">
                  Original position: #{row.originalIndex ?? "?"} - Revised position: #
                  {row.revisedIndex ?? "?"}
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-line bg-white p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              Revised
            </div>
            <BlockPreview block={row.revisedBlock} />
          </div>
        </div>

      </div>
    </button>
  );
}

function RowSection({
  title,
  rows,
  selectedRowId,
  onSelectRow
}: {
  title: string;
  rows: SemanticAlignmentRow[];
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
      {rows.map((row) => (
        <AlignmentRow
          key={row.id}
          row={row}
          selected={selectedRowId === row.id}
          onSelect={() => onSelectRow(row)}
        />
      ))}
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
  selectedRowId: string | null;
  onSelectRow: (row: SemanticAlignmentRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line bg-slate-50/70 px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-muted">
          Layer 2 - Semantic Alignment Board
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Each row aligns one original semantic block with the revised block it became.
        </p>
      </div>

      {importantRows.length > 0 ? (
        <>
          <RowSection
            title="Important changes"
            rows={importantRows}
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
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
            />
          )}
        </>
      ) : (
        <div className="p-4 text-sm text-muted">
          No semantic rows returned yet.
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
        Layer 3 - Select a semantic change to generate a local explanation.
      </aside>
    );
  }

  if (loading) {
    return (
      <aside className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-atlasBlue">
        <div className="flex items-center gap-2">
          <Loader2 size={17} className="animate-spin" />
          Generating Local Difference Explanation...
        </div>
      </aside>
    );
  }

  const resolvedDetail = detail;

  if (!resolvedDetail) {
    return (
      <aside className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted">
        {error ?? "Click a semantic change to generate its local explanation."}
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
        Layer 3 - Local Difference Explanation
      </div>
      <div className="space-y-4 text-sm leading-6">
        <div>
          <div className="mb-1 font-bold text-ink">Original</div>
          <p className="rounded-md border border-line bg-slate-50 p-3 text-slate-700">
            {resolvedDetail.originalFullBlock}
          </p>
        </div>
        <div>
          <div className="mb-1 font-bold text-ink">Revised</div>
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
  const normalizedMap = useMemo(() => applySemanticMapProgramRules(map), [map]);
  const groups = useMemo(
    () => groupSemanticRowsForDisplay(normalizedMap.rows),
    [normalizedMap.rows]
  );
  const [showHiddenImportant, setShowHiddenImportant] = useState(false);
  const [showMedium, setShowMedium] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SemanticDifferenceDetail>>({});
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedRow =
    normalizedMap.rows.find((row) => row.id === selectedRowId) ?? undefined;

  async function selectRow(row: SemanticAlignmentRow) {
    setSelectedRowId(row.id);
    setDetailError(null);

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

      <AlignmentBoard
        importantRows={groups.important}
        hiddenImportantRows={groups.hiddenImportant}
        mediumRows={groups.medium}
        lowRows={groups.low}
        showHiddenImportant={showHiddenImportant}
        showMedium={showMedium}
        showLow={showLow}
        onToggleHiddenImportant={() => setShowHiddenImportant((value) => !value)}
        onToggleMedium={() => setShowMedium((value) => !value)}
        onToggleLow={() => setShowLow((value) => !value)}
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
  );
}
