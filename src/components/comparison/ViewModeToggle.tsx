"use client";

export type ComparisonViewMode = "map" | "graph";

type ViewModeToggleProps = {
  value: ComparisonViewMode;
  onChange: (mode: ComparisonViewMode) => void;
};

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex rounded-md border border-line bg-white p-0.5">
      {(["map", "graph"] as const).map((mode) => {
        const active = value === mode;

        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`h-7 rounded px-2.5 text-xs font-bold capitalize transition ${
              active
                ? "bg-blue-50 text-atlasBlue"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {mode === "map" ? "Map View" : "Advanced Graph"}
          </button>
        );
      })}
    </div>
  );
}
