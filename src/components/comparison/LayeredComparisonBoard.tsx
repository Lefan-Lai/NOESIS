"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ComparisonLevel,
  ComparisonRow,
  ComparisonSlot,
  ComparisonSlotNode,
  LayeredComparisonBoard as LayeredComparisonBoardData
} from "@/types/comparison";
import { sortComparisonSlots } from "@/lib/comparison/validateLayeredComparisonScaffold";
import { sortBoardLevels } from "@/lib/comparison/validateLayeredComparisonBoard";
import {
  ComparisonFilterBar,
  type SemanticDiffFilter
} from "./ComparisonFilterBar";
import { ComparisonDetailPanel } from "./ComparisonDetailPanel";
import { ComparisonSummaryPanel } from "./ComparisonSummaryPanel";
import { DifferenceBadge } from "./DifferenceBadge";
import { RelationBadge } from "./RelationBadge";

export type LayeredBoardDifference =
  | "same"
  | "rewritten"
  | "refined"
  | "expanded"
  | "reduced"
  | "replaced"
  | "added"
  | "removed"
  | "conflict";

type BoardLevelRole = Exclude<ComparisonSlot["level_role"], "root">;

type BoardSide = {
  title: string;
  short_summary: string;
  full_text?: string;
};

export type LayeredBoardRow = {
  row_id: string;
  slot_id: string;
  level_role: BoardLevelRole;
  shared_topic: string;
  original: BoardSide | null;
  revised: BoardSide | null;
  difference: LayeredBoardDifference;
  importance: "low" | "medium" | "high";
  short_explanation: string;
  source_slot: ComparisonSlot;
};

const levelDisplay: Record<
  BoardLevelRole,
  { title: string; description: string }
> = {
  main_topic: {
    title: "Level 1: Main Topics",
    description: "The major themes or areas that changed between the two answers."
  },
  claim_or_decision: {
    title: "Level 2: Key Decisions",
    description: "Important claims, design decisions, or framing choices."
  },
  support_or_detail: {
    title: "Level 3: Details / Implementation",
    description: "Specific implementation details, examples, or supporting logic."
  },
  consequence_risk_or_action: {
    title: "Level 4: Risks / Actions",
    description: "Risks, conflicts, consequences, and follow-up actions when needed."
  }
};

const levelOrder: BoardLevelRole[] = [
  "main_topic",
  "claim_or_decision",
  "support_or_detail",
  "consequence_risk_or_action"
];

const relationToDifference: Record<
  ComparisonSlot["relation"],
  LayeredBoardDifference
> = {
  same: "same",
  rewritten: "rewritten",
  refined: "refined",
  expanded: "expanded",
  reduced: "reduced",
  replaced: "replaced",
  contradicted: "conflict",
  original_only: "removed",
  revised_only: "added"
};

const changedDifferences: LayeredBoardDifference[] = [
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced"
];

function sideFromNode(node?: ComparisonSlotNode): BoardSide | null {
  if (!node) {
    return null;
  }

  return {
    title: node.title,
    short_summary: node.summary,
    full_text: node.source_text
  };
}

function inferImportance(
  slot: ComparisonSlot,
  difference: LayeredBoardDifference
): "low" | "medium" | "high" {
  if (slot.importance) {
    return slot.importance;
  }

  if (difference === "conflict" || difference === "replaced") {
    return "high";
  }

  if (difference === "added" || difference === "removed") {
    return "medium";
  }

  if (changedDifferences.includes(difference)) {
    return "medium";
  }

  return "low";
}

export function slotToLayeredBoardRow(
  slot: ComparisonSlot
): LayeredBoardRow | null {
  if (slot.level_role === "root") {
    return null;
  }

  const difference = relationToDifference[slot.relation];

  return {
    row_id: slot.slot_id,
    slot_id: slot.slot_id,
    level_role: slot.level_role,
    shared_topic: slot.shared_topic,
    original: sideFromNode(slot.original_node),
    revised: sideFromNode(slot.revised_node),
    difference,
    importance: inferImportance(slot, difference),
    short_explanation: slot.short_comparison,
    source_slot: slot
  };
}

export function applyLayeredBoardFilter(
  rows: LayeredBoardRow[],
  filter: SemanticDiffFilter
) {
  return rows.filter((row) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "changed") {
      return changedDifferences.includes(row.difference);
    }

    if (filter === "added") {
      return row.difference === "added";
    }

    if (filter === "removed") {
      return row.difference === "removed";
    }

    if (filter === "conflicts") {
      return row.difference === "conflict";
    }

    return row.importance === "high";
  });
}

export function applySemanticDiffFilter(
  slots: ComparisonSlot[],
  filter: SemanticDiffFilter
) {
  const rows = slots
    .map(slotToLayeredBoardRow)
    .filter((row): row is LayeredBoardRow => Boolean(row));
  const selectedIds = new Set(
    applyLayeredBoardFilter(rows, filter).map((row) => row.slot_id)
  );

  return slots.filter((slot) => selectedIds.has(slot.slot_id));
}

export function buildLayeredBoardFilterCounts(rows: LayeredBoardRow[]) {
  return {
    all: rows.length,
    changed: applyLayeredBoardFilter(rows, "changed").length,
    added: applyLayeredBoardFilter(rows, "added").length,
    removed: applyLayeredBoardFilter(rows, "removed").length,
    conflicts: applyLayeredBoardFilter(rows, "conflicts").length,
    important: applyLayeredBoardFilter(rows, "important").length
  };
}

function groupRowsByLevel(rows: LayeredBoardRow[]) {
  const groups = new Map<BoardLevelRole, LayeredBoardRow[]>();

  for (const row of rows) {
    const group = groups.get(row.level_role) ?? [];
    group.push(row);
    groups.set(row.level_role, group);
  }

  return levelOrder
    .map((levelRole) => ({
      levelRole,
      rows: groups.get(levelRole) ?? []
    }))
    .filter((section) => section.rows.length > 0);
}

function BoardSideCell({
  side,
  emptyText
}: {
  side: BoardSide | null;
  emptyText: string;
}) {
  if (!side) {
    return <span className="text-sm font-semibold text-muted">{emptyText}</span>;
  }

  return (
    <div className="space-y-1">
      <div className="text-sm font-bold text-ink">{side.title}</div>
      <p className="text-sm leading-6 text-slate-700">{side.short_summary}</p>
    </div>
  );
}

function DifferenceCell({ row }: { row: LayeredBoardRow }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <RelationBadge relation={row.source_slot.relation} />
        <span className="rounded-full border border-line bg-slate-50 px-2 py-1 text-[11px] font-bold capitalize text-muted">
          {row.importance} importance
        </span>
      </div>
      <div className="text-sm font-bold text-ink">{row.shared_topic}</div>
      <p className="text-sm leading-6 text-slate-700">{row.short_explanation}</p>
    </div>
  );
}

function LevelTable({
  title,
  description,
  rows,
  selectedRowId,
  onSelectRow
}: {
  title: string;
  description: string;
  rows: LayeredBoardRow[];
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line bg-slate-50/70 px-4 py-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-line bg-white text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="w-[32%] px-4 py-3">Original</th>
              <th className="w-[32%] px-4 py-3">Revised</th>
              <th className="w-[36%] px-4 py-3">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedRowId === row.row_id;

              return (
                <tr
                  key={row.row_id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select comparison row: ${row.shared_topic}`}
                  onClick={() => onSelectRow(row.row_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectRow(row.row_id);
                    }
                  }}
                  className={`cursor-pointer border-b border-line align-top outline-none transition last:border-b-0 hover:bg-blue-50/40 focus:bg-blue-50/40 ${
                    selected ? "bg-blue-50/70 ring-1 ring-inset ring-atlasBlue" : ""
                  }`}
                >
                  <td className="px-4 py-3 align-top">
                    <BoardSideCell
                      side={row.original}
                      emptyText="Not present in original"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <BoardSideCell
                      side={row.revised}
                      emptyText="Not present in revised"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <DifferenceCell row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const boardChangedDifferences: ComparisonRow["difference"][] = [
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced"
];

export function applyBoardJsonFilter(
  rows: ComparisonRow[],
  filter: SemanticDiffFilter
) {
  return rows.filter((row) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "changed") {
      return boardChangedDifferences.includes(row.difference);
    }

    if (filter === "added") {
      return row.difference === "added";
    }

    if (filter === "removed") {
      return row.difference === "removed";
    }

    if (filter === "conflicts") {
      return row.difference === "conflict";
    }

    return row.importance === "high";
  });
}

export function buildBoardJsonFilterCounts(rows: ComparisonRow[]) {
  return {
    all: rows.length,
    changed: applyBoardJsonFilter(rows, "changed").length,
    added: applyBoardJsonFilter(rows, "added").length,
    removed: applyBoardJsonFilter(rows, "removed").length,
    conflicts: applyBoardJsonFilter(rows, "conflicts").length,
    important: applyBoardJsonFilter(rows, "important").length
  };
}

function BoardJsonSideCell({
  side,
  emptyText
}: {
  side: ComparisonRow["original"];
  emptyText: string;
}) {
  if (!side) {
    return <span className="text-sm font-semibold text-muted">{emptyText}</span>;
  }

  return (
    <div className="space-y-1">
      <div className="text-sm font-bold text-ink">{side.title}</div>
      <p className="text-sm leading-6 text-slate-700">{side.short_summary}</p>
    </div>
  );
}

function BoardJsonDifferenceCell({ row }: { row: ComparisonRow }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DifferenceBadge difference={row.difference} />
        <span className="rounded-full border border-line bg-slate-50 px-2 py-1 text-[11px] font-bold capitalize text-muted">
          {row.importance} importance
        </span>
      </div>
      <div className="text-sm font-bold text-ink">{row.shared_topic}</div>
      <p className="text-sm leading-6 text-slate-700">{row.short_explanation}</p>
    </div>
  );
}

function BoardJsonLevelTable({
  level,
  rows,
  selectedRowId,
  onSelectRow
}: {
  level: ComparisonLevel;
  rows: ComparisonRow[];
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line bg-slate-50/70 px-4 py-3">
        <h3 className="text-sm font-bold text-ink">{level.display_title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-line bg-white text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="w-[32%] px-4 py-3">Original</th>
              <th className="w-[32%] px-4 py-3">Revised</th>
              <th className="w-[36%] px-4 py-3">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedRowId === row.row_id;

              return (
                <tr
                  key={row.row_id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select comparison row: ${row.shared_topic}`}
                  onClick={() => onSelectRow(row.row_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectRow(row.row_id);
                    }
                  }}
                  className={`cursor-pointer border-b border-line align-top outline-none transition last:border-b-0 hover:bg-blue-50/40 focus:bg-blue-50/40 ${
                    selected ? "bg-blue-50/70 ring-1 ring-inset ring-atlasBlue" : ""
                  }`}
                >
                  <td className="px-4 py-3 align-top">
                    <BoardJsonSideCell
                      side={row.original}
                      emptyText="Not present in original"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <BoardJsonSideCell
                      side={row.revised}
                      emptyText="Not present in revised"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <BoardJsonDifferenceCell row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type LayeredComparisonBoardProps = {
  board: LayeredComparisonBoardData;
};

export function LayeredComparisonBoard({
  board
}: LayeredComparisonBoardProps) {
  const levels = useMemo(
    () => sortBoardLevels(board.levels).filter((level) => level.rows.length > 0),
    [board.levels]
  );
  const rows = useMemo(
    () => levels.flatMap((level) => level.rows),
    [levels]
  );
  const [filter, setFilter] = useState<SemanticDiffFilter>("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(
    rows[0]?.row_id ?? null
  );
  const counts = useMemo(() => buildBoardJsonFilterCounts(rows), [rows]);
  const visibleRows = useMemo(
    () => applyBoardJsonFilter(rows, filter),
    [filter, rows]
  );
  const visibleRowIds = useMemo(
    () => new Set(visibleRows.map((row) => row.row_id)),
    [visibleRows]
  );
  const selectedRow =
    rows.find((row) => row.row_id === selectedRowId) ?? visibleRows[0] ?? rows[0];

  useEffect(() => {
    setFilter("all");
    setSelectedRowId(rows[0]?.row_id ?? null);
  }, [board.board_id, rows]);

  return (
    <div className="space-y-4">
      <ComparisonSummaryPanel summary={board.summary} />
      <ComparisonFilterBar
        activeFilter={filter}
        counts={counts}
        onFilterChange={(nextFilter) => {
          setFilter(nextFilter);
          const nextVisible = applyBoardJsonFilter(rows, nextFilter);
          setSelectedRowId(nextVisible[0]?.row_id ?? null);
        }}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {visibleRows.length > 0 ? (
            levels.map((level) => {
              const levelRows = level.rows.filter((row) =>
                visibleRowIds.has(row.row_id)
              );

              if (levelRows.length === 0) {
                return null;
              }

              return (
                <BoardJsonLevelTable
                  key={level.level_id}
                  level={level}
                  rows={levelRows}
                  selectedRowId={selectedRowId}
                  onSelectRow={setSelectedRowId}
                />
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
              No comparison rows match this filter.
            </div>
          )}
        </div>

        <ComparisonDetailPanel
          row={selectedRow}
          recommendedAction={board.summary.recommended_action}
        />
      </div>
    </div>
  );
}
