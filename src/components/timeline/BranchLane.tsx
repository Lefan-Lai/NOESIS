"use client";

type BranchLaneProps = {
  inactiveCount: number;
  removedPathCount: number;
  foldedBranchCount: number;
  showInactive: boolean;
  showMemory: boolean;
  showRemovedPaths: boolean;
  collapseLargeBranches: boolean;
  maxVisibleDepth: number | "all";
  onToggleInactive: () => void;
  onToggleMemory: () => void;
  onToggleRemovedPaths: () => void;
  onToggleCollapseLargeBranches: () => void;
  onMaxVisibleDepthChange: (depth: number | "all") => void;
};

export function BranchLane({
  inactiveCount,
  removedPathCount,
  foldedBranchCount,
  showInactive,
  showMemory,
  showRemovedPaths,
  collapseLargeBranches,
  maxVisibleDepth,
  onToggleInactive,
  onToggleMemory,
  onToggleRemovedPaths,
  onToggleCollapseLargeBranches,
  onMaxVisibleDepthChange
}: BranchLaneProps) {
  return (
    <div className="w-44 shrink-0 border-r border-line p-4">
      <div className="mb-4">
        <select
          value={String(maxVisibleDepth)}
          onChange={(event) =>
            onMaxVisibleDepthChange(
              event.target.value === "all" ? "all" : Number(event.target.value)
            )
          }
          className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-slate-700"
          title="Visible logical depth"
          aria-label="Visible logical depth"
        >
          <option value="0">Main reasoning only</option>
          <option value="1">Show logic focus rows</option>
          <option value="2">Show nested logic</option>
          <option value="all">Show all logic rows</option>
        </select>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasBlue text-xs font-bold text-white">
            M
          </span>
          <span>main reasoning</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasGreen text-xs font-bold text-white">
            C
          </span>
          <span>logic focus</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasPurple text-xs font-bold text-white">
            S
          </span>
          <span>suggest / draft</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white">
            N
          </span>
          <span>memory notes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-400 text-xs font-bold text-white">
            I
          </span>
          <span>inactive history</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-red-500 text-xs font-bold text-white">
            R
          </span>
          <span>removed paths</span>
        </div>
        <button
          type="button"
          onClick={onToggleInactive}
          disabled={inactiveCount === 0}
          className="mt-3 w-full rounded-md border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showInactive ? "Hide" : "Show"} inactive logic
          <span className="ml-1 text-muted">({inactiveCount})</span>
        </button>
        {!showInactive && inactiveCount > 0 && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">
            Inactive reasoning is folded so the active logic stays readable.
          </div>
        )}
        <button
          type="button"
          onClick={onToggleRemovedPaths}
          disabled={removedPathCount === 0}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showRemovedPaths ? "Hide" : "Show"} removed logic
          <span className="ml-1 text-muted">({removedPathCount})</span>
        </button>
        {!showRemovedPaths && removedPathCount > 0 && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
            Deleted or discarded logic is hidden from the main view.
          </div>
        )}
        <button
          type="button"
          onClick={onToggleMemory}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {showMemory ? "Hide" : "Show"} memory notes
        </button>
        <button
          type="button"
          onClick={onToggleCollapseLargeBranches}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {collapseLargeBranches ? "Expand" : "Collapse"} large logic groups
          {foldedBranchCount > 0 && (
            <span className="ml-1 text-muted">({foldedBranchCount})</span>
          )}
        </button>
      </div>
    </div>
  );
}
