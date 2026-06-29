"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, WheelEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  ComparisonSlot,
  LayeredComparisonScaffold
} from "@/types/comparison";
import { sortComparisonSlots } from "@/lib/comparison/validateLayeredComparisonScaffold";

type LayeredComparisonScaffoldViewProps = {
  scaffold: LayeredComparisonScaffold;
};

const relationLabels: Record<ComparisonSlot["relation"], string> = {
  same: "Same",
  rewritten: "Rewritten",
  refined: "Refined",
  expanded: "Expanded",
  reduced: "Reduced",
  replaced: "Replaced",
  contradicted: "Conflict",
  original_only: "Original Only",
  revised_only: "Revised Only"
};

const relationStyles: Record<ComparisonSlot["relation"], string> = {
  same: "border-slate-200 bg-slate-50 text-slate-700",
  rewritten: "border-blue-200 bg-blue-50 text-atlasBlue",
  refined: "border-blue-200 bg-blue-50 text-atlasBlue",
  expanded: "border-green-200 bg-green-50 text-atlasGreen",
  reduced: "border-orange-200 bg-orange-50 text-atlasOrange",
  replaced: "border-indigo-200 bg-indigo-50 text-indigo-700",
  contradicted: "border-orange-200 bg-orange-50 text-atlasOrange",
  original_only: "border-red-200 bg-red-50 text-atlasRed",
  revised_only: "border-red-200 bg-red-50 text-atlasRed"
};

const relationLineStyles: Record<ComparisonSlot["relation"], string> = {
  same: "border-slate-300",
  rewritten: "border-atlasBlue",
  refined: "border-atlasBlue",
  expanded: "border-atlasGreen",
  reduced: "border-atlasOrange",
  replaced: "border-indigo-500",
  contradicted: "border-atlasOrange",
  original_only: "border-atlasRed",
  revised_only: "border-atlasRed"
};

const orderGroupRank: Record<ComparisonSlot["order_group"], number> = {
  matched: 1,
  changed: 2,
  contradicted: 3,
  original_only: 4,
  revised_only: 5
};

const defaultTransform = {
  scale: 1,
  x: 0,
  y: 0
};

function roleLabel(role: ComparisonSlot["level_role"]) {
  return role.replaceAll("_", " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function NodeCard({
  slot,
  side,
  hovered,
  selected,
  onHover,
  onLeave,
  onSelect
}: {
  slot: ComparisonSlot;
  side: "original" | "revised";
  hovered: boolean;
  selected: boolean;
  onHover: (slotId: string) => void;
  onLeave: () => void;
  onSelect: (slotId: string) => void;
}) {
  const node = side === "original" ? slot.original_node : slot.revised_node;

  if (!node) {
    return null;
  }

  return (
    <button
      type="button"
      data-tree-node="true"
      onMouseEnter={() => onHover(slot.slot_id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(slot.slot_id)}
      onBlur={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(slot.slot_id);
      }}
      title={node.source_text}
      className={`min-h-[118px] w-[220px] rounded-lg border bg-white p-3 text-left shadow-sm transition ${
        selected
          ? "border-atlasBlue bg-blue-50 ring-2 ring-blue-100"
          : hovered
            ? "border-blue-300 bg-blue-50/60"
            : "border-line hover:border-blue-200"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-bold leading-5 text-ink">
          {node.title}
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${relationStyles[slot.relation]}`}
        >
          {relationLabels[slot.relation]}
        </span>
      </div>
      <p className="line-clamp-3 text-sm leading-5 text-slate-700">
        {node.summary}
      </p>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Level {slot.level_index} / {roleLabel(slot.level_role)}
      </div>
    </button>
  );
}

function EmptySide({ side }: { side: "original" | "revised" }) {
  return (
    <div className="grid min-h-[118px] w-[220px] place-items-center rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 text-center text-xs leading-5 text-muted">
      {side === "original"
        ? "Only appears in revised answer."
        : "Only appears in original answer."}
    </div>
  );
}

function SlotDetail({ slot }: { slot: ComparisonSlot }) {
  const originalText = slot.original_node?.source_text;
  const revisedText = slot.revised_node?.source_text;

  return (
    <div className="rounded-lg border border-blue-100 bg-white/95 p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            Selected Comparison Detail
          </div>
          <h3 className="mt-1 text-sm font-bold text-ink">
            {slot.shared_topic}
          </h3>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${relationStyles[slot.relation]}`}
        >
          {relationLabels[slot.relation]}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-slate-50/80 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Original
          </div>
          <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
            {originalText ?? "This point only appears in the revised answer."}
          </p>
        </div>
        <div className="rounded-md border border-line bg-slate-50/80 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Revised
          </div>
          <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
            {revisedText ?? "This point only appears in the original answer."}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-line bg-slate-50/80 p-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
          Difference Summary
        </div>
        <p className="text-sm leading-6 text-slate-700">
          {slot.short_comparison}
        </p>
      </div>
    </div>
  );
}

function LevelColumn({
  title,
  slots,
  side,
  hoveredSlotId,
  selectedSlotId,
  onHover,
  onLeave,
  onSelect
}: {
  title: string;
  slots: ComparisonSlot[];
  side: "original" | "revised";
  hoveredSlotId: string | null;
  selectedSlotId: string | null;
  onHover: (slotId: string) => void;
  onLeave: () => void;
  onSelect: (slotId: string) => void;
}) {
  const sideSlots = slots.filter((slot) =>
    side === "original" ? slot.original_node : slot.revised_node
  );

  return (
    <div>
      <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="flex min-h-[124px] flex-wrap items-start justify-center gap-3">
        {sideSlots.length > 0 ? (
          sideSlots.map((slot) => (
            <NodeCard
              key={`${side}-${slot.slot_id}`}
              slot={slot}
              side={side}
              hovered={hoveredSlotId === slot.slot_id}
              selected={selectedSlotId === slot.slot_id}
              onHover={onHover}
              onLeave={onLeave}
              onSelect={onSelect}
            />
          ))
        ) : (
          <EmptySide side={side} />
        )}
      </div>
    </div>
  );
}

function RelationRail({
  slots,
  hoveredSlotId,
  selectedSlotId,
  onHover,
  onLeave,
  onSelect
}: {
  slots: ComparisonSlot[];
  hoveredSlotId: string | null;
  selectedSlotId: string | null;
  onHover: (slotId: string) => void;
  onLeave: () => void;
  onSelect: (slotId: string) => void;
}) {
  return (
    <div className="flex min-h-[124px] flex-col items-center justify-center gap-2 pt-7">
      {slots.map((slot) => {
        const hasPair = Boolean(slot.original_node && slot.revised_node);
        const active =
          hoveredSlotId === slot.slot_id || selectedSlotId === slot.slot_id;

        return (
          <button
            key={`relation-${slot.slot_id}`}
            type="button"
            data-tree-link="true"
            onMouseEnter={() => onHover(slot.slot_id)}
            onMouseLeave={onLeave}
            onFocus={() => onHover(slot.slot_id)}
            onBlur={onLeave}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(slot.slot_id);
            }}
            className={`flex w-full items-center justify-center gap-1 rounded-full px-1 py-0.5 transition ${
              active ? "bg-white shadow-sm ring-2 ring-blue-100" : ""
            }`}
            title={slot.short_comparison}
          >
            {hasPair && (
              <span
                className={`h-px w-7 border-t-2 ${relationLineStyles[slot.relation]}`}
              />
            )}
            <span
              className={`rounded-full border px-2 py-1 text-[11px] font-bold leading-4 ${relationStyles[slot.relation]}`}
            >
              {relationLabels[slot.relation]}
            </span>
            {hasPair && (
              <span
                className={`h-px w-7 border-t-2 ${relationLineStyles[slot.relation]}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function sortSlotsWithinLevel(slots: ComparisonSlot[]) {
  return [...slots].sort((a, b) => {
    const groupDiff = orderGroupRank[a.order_group] - orderGroupRank[b.order_group];

    if (groupDiff !== 0) {
      return groupDiff;
    }

    return a.order_index - b.order_index;
  });
}

function groupSlotsByLevel(slots: ComparisonSlot[]) {
  const levels = new Map<number, ComparisonSlot[]>();

  for (const slot of slots) {
    const levelSlots = levels.get(slot.level_index) ?? [];
    levelSlots.push(slot);
    levels.set(slot.level_index, levelSlots);
  }

  return Array.from(levels.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, levelSlots]) => ({
      level,
      slots: sortSlotsWithinLevel(levelSlots)
    }));
}

export function LayeredComparisonScaffoldView({
  scaffold
}: LayeredComparisonScaffoldViewProps) {
  const slots = useMemo(() => sortComparisonSlots(scaffold.slots), [scaffold]);
  const levels = useMemo(() => groupSlotsByLevel(slots), [slots]);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    scaffold.root_slot_id
  );
  const [transform, setTransform] = useState({ ...defaultTransform });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const displaySlotId = hoveredSlotId ?? selectedSlotId ?? scaffold.root_slot_id;
  const displaySlot =
    slots.find((slot) => slot.slot_id === displaySlotId) ?? slots[0];

  useEffect(() => {
    setHoveredSlotId(null);
    setSelectedSlotId(scaffold.root_slot_id);
    setTransform({ ...defaultTransform });
  }, [scaffold.comparison_id, scaffold.root_slot_id]);

  function zoomBy(multiplier: number) {
    setTransform((current) => ({
      ...current,
      scale: clamp(current.scale * multiplier, 0.65, 1.8)
    }));
  }

  function resetView() {
    setTransform({ ...defaultTransform });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("[data-tree-node='true'], [data-tree-link='true']")) {
      return;
    }

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      return;
    }

    const nextX =
      dragRef.current.originX + event.clientX - dragRef.current.startX;
    const nextY =
      dragRef.current.originY + event.clientY - dragRef.current.startY;

    setTransform((current) => ({
      ...current,
      x: nextX,
      y: nextY
    }));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setIsPanning(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCanvasClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (!target.closest("[data-tree-node='true'], [data-tree-link='true']")) {
      setSelectedSlotId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-slate-50/70 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">
              Standardized Layered Comparison
            </h3>
          </div>
          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {scaffold.summary.recommended_action.replaceAll("_", " ")}
          </span>
        </div>
        <p className="text-sm leading-6 text-slate-700">
          {scaffold.summary.overall_summary}
        </p>
      </div>

      {displaySlot && <SlotDetail slot={displaySlot} />}

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-slate-50 px-3 py-2">
          <div>
            <h3 className="text-sm font-bold text-ink">Tree Structure</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => zoomBy(1.12)}
              className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(0.88)}
              className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50"
              title="Reset view"
              aria-label="Reset view"
            >
              <RotateCcw size={15} />
            </button>
            <span className="ml-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-muted">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>
        </div>

        <div
          className={`thin-scrollbar h-[430px] overflow-auto bg-slate-50 p-4 ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          }`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleCanvasClick}
          onDoubleClick={resetView}
        >
          <div
            className="min-h-full min-w-[1040px] rounded-lg bg-white p-4 shadow-sm"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "top left"
            }}
          >
            <div className="grid grid-cols-[minmax(360px,1fr)_150px_minmax(360px,1fr)] gap-4">
              <div className="text-center text-sm font-bold text-ink">
                Original Tree
              </div>
              <div />
              <div className="text-center text-sm font-bold text-ink">
                Revised Tree
              </div>

              {levels.map(({ level, slots: levelSlots }) => (
                <div key={`level-${level}`} className="contents">
                  <div className="col-span-3 mt-2 border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-muted">
                      <span>Level {level}</span>
                      <span>
                        {levelSlots[0] ? roleLabel(levelSlots[0].level_role) : "level"}
                      </span>
                    </div>
                  </div>
                  <LevelColumn
                    title="Original"
                    slots={levelSlots}
                    side="original"
                    hoveredSlotId={hoveredSlotId}
                    selectedSlotId={selectedSlotId}
                    onHover={setHoveredSlotId}
                    onLeave={() => setHoveredSlotId(null)}
                    onSelect={setSelectedSlotId}
                  />
                  <RelationRail
                    slots={levelSlots}
                    hoveredSlotId={hoveredSlotId}
                    selectedSlotId={selectedSlotId}
                    onHover={setHoveredSlotId}
                    onLeave={() => setHoveredSlotId(null)}
                    onSelect={setSelectedSlotId}
                  />
                  <LevelColumn
                    title="Revised"
                    slots={levelSlots}
                    side="revised"
                    hoveredSlotId={hoveredSlotId}
                    selectedSlotId={selectedSlotId}
                    onHover={setHoveredSlotId}
                    onLeave={() => setHoveredSlotId(null)}
                    onSelect={setSelectedSlotId}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
