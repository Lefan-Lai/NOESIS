"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Filter, Info, Layers3 } from "lucide-react";

type LogicCategoryCounts = {
  main: number;
  local: number;
  drafts: number;
  memory: number;
};

type BranchLaneProps = {
  categoryCounts: LogicCategoryCounts;
  inactiveCount: number;
  removedPathCount: number;
  foldedBranchCount: number;
  showMain: boolean;
  showLocal: boolean;
  showDrafts: boolean;
  showInactive: boolean;
  showMemory: boolean;
  showRemovedPaths: boolean;
  collapseLargeBranches: boolean;
  maxVisibleDepth: number | "all";
  onToggleMain: () => void;
  onToggleLocal: () => void;
  onToggleDrafts: () => void;
  onToggleInactive: () => void;
  onToggleMemory: () => void;
  onToggleRemovedPaths: () => void;
  onToggleCollapseLargeBranches: () => void;
  onMaxVisibleDepthChange: (depth: number | "all") => void;
};

function FilterRow({
  active,
  disabled = false,
  color,
  label,
  count,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  color: string;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded border ${
          active ? "border-atlasBlue bg-atlasBlue text-white" : "border-slate-300 bg-white"
        }`}
      >
        {active && <Check size={11} strokeWidth={3} />}
      </span>
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span className="tabular-nums text-muted">{count}</span>
      )}
    </button>
  );
}

export function BranchLane({
  categoryCounts,
  inactiveCount,
  removedPathCount,
  foldedBranchCount,
  showMain,
  showLocal,
  showDrafts,
  showInactive,
  showMemory,
  showRemovedPaths,
  collapseLargeBranches,
  maxVisibleDepth,
  onToggleMain,
  onToggleLocal,
  onToggleDrafts,
  onToggleInactive,
  onToggleMemory,
  onToggleRemovedPaths,
  onToggleCollapseLargeBranches,
  onMaxVisibleDepthChange
}: BranchLaneProps) {
  const [openPanel, setOpenPanel] = useState<"filters" | "legend" | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hiddenCount = [
    !showMain ? categoryCounts.main : 0,
    !showLocal ? categoryCounts.local : 0,
    !showDrafts ? categoryCounts.drafts : 0,
    !showMemory ? categoryCounts.memory : 0,
    !showInactive ? inactiveCount : 0,
    !showRemovedPaths ? removedPathCount : 0
  ].reduce((sum, value) => sum + value, 0);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenPanel(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  return (
    <div ref={controlsRef} className="relative flex min-w-0 items-center gap-2">
      <label className="relative flex h-8 items-center gap-1.5 rounded-md border border-line bg-white pl-2 text-xs font-bold text-slate-700">
        <Layers3 size={14} />
        <span className="sr-only">Visible logical depth</span>
        <select
          value={String(maxVisibleDepth)}
          onChange={(event) =>
            onMaxVisibleDepthChange(
              event.target.value === "all" ? "all" : Number(event.target.value)
            )
          }
          className="h-full max-w-40 rounded-md bg-transparent pr-7 text-xs font-bold outline-none"
          title="Visible logical depth"
          aria-label="Visible logical depth"
        >
          <option value="0">Main only</option>
          <option value="1">One local level</option>
          <option value="2">Nested logic</option>
          <option value="all">All levels</option>
        </select>
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenPanel((value) => (value === "filters" ? null : "filters"))}
          className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          aria-expanded={openPanel === "filters"}
          title="Filter visible logic"
        >
          <Filter size={14} />
          <span>Filter</span>
          {hiddenCount > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {hiddenCount} hidden
            </span>
          )}
        </button>
        {openPanel === "filters" && (
          <div className="absolute right-0 top-10 z-[110] max-h-[calc(100vh-5rem)] w-[min(30rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-line bg-white p-2 shadow-panel">
            <div className="grid gap-2 min-[700px]:grid-cols-2">
              <div>
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                  Content types
                </div>
                <FilterRow active={showMain} color="bg-atlasBlue" label="Main reasoning" count={categoryCounts.main} onClick={onToggleMain} />
                <FilterRow active={showLocal} color="bg-atlasGreen" label="Local checks" count={categoryCounts.local} onClick={onToggleLocal} />
                <FilterRow active={showDrafts} color="bg-atlasPurple" label="Draft / merge ideas" count={categoryCounts.drafts} onClick={onToggleDrafts} />
                <FilterRow active={showMemory} color="bg-amber-500" label="Memory notes" count={categoryCounts.memory} onClick={onToggleMemory} />
              </div>
              <div className="border-t border-line pt-2 min-[700px]:border-l min-[700px]:border-t-0 min-[700px]:pl-2 min-[700px]:pt-0">
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                  History states
                </div>
                <FilterRow active={showInactive} disabled={inactiveCount === 0} color="bg-slate-400" label="Inactive history" count={inactiveCount} onClick={onToggleInactive} />
                <FilterRow active={showRemovedPaths} disabled={removedPathCount === 0} color="bg-red-500" label="Removed paths" count={removedPathCount} onClick={onToggleRemovedPaths} />
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={onToggleCollapseLargeBranches}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span>{collapseLargeBranches ? "Expand" : "Collapse"} large groups</span>
                  {foldedBranchCount > 0 && <span className="text-muted">{foldedBranchCount}</span>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenPanel((value) => (value === "legend" ? null : "legend"))}
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50"
          aria-expanded={openPanel === "legend"}
          title="Logic map legend"
          aria-label="Logic map legend"
        >
          <Info size={15} />
        </button>
        {openPanel === "legend" && (
          <div className="absolute right-0 top-10 z-[110] max-h-[calc(100vh-5rem)] w-72 overflow-auto rounded-lg border border-line bg-white p-3 text-xs leading-5 text-slate-700 shadow-panel">
            <div className="font-bold text-ink">Logic Map legend</div>
            <div className="mt-2 space-y-2">
              <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-atlasBlue" />Main reasoning bundles a main question with its answer.</p>
              <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-atlasGreen" />A Check names the selected source text; its question and reply appear in details.</p>
              <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-atlasGreen" />Follow-ups in the same Local Window continue on that Check branch.</p>
              <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-atlasPurple" />Draft and merge nodes represent proposed or adopted revisions.</p>
              <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />Notes are explicit memory saved by the user.</p>
            </div>
            <div className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
              Inactive and removed are object states, not reasoning types. Filtering only changes this view; persisted memory and events are unchanged.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
