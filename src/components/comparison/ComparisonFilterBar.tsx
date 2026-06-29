"use client";

export type SemanticDiffFilter =
  | "all"
  | "changed"
  | "added"
  | "removed"
  | "conflicts"
  | "important";

const filters: Array<{ id: SemanticDiffFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "changed", label: "Changed" },
  { id: "added", label: "Added" },
  { id: "removed", label: "Removed" },
  { id: "conflicts", label: "Conflict" },
  { id: "important", label: "Important" }
];

type ComparisonFilterBarProps = {
  activeFilter: SemanticDiffFilter;
  counts: Record<SemanticDiffFilter, number>;
  onFilterChange: (filter: SemanticDiffFilter) => void;
};

export function ComparisonFilterBar({
  activeFilter,
  counts,
  onFilterChange
}: ComparisonFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-white p-2">
      {filters.map((filter) => {
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
