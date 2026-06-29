"use client";

export function BranchLane() {
  return (
    <div className="w-44 shrink-0 border-r border-line p-4">
      <div className="mb-4">
        <select className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-slate-700">
          <option>Show all events</option>
          <option>Active path only</option>
          <option>Branches only</option>
        </select>
      </div>
      <div className="mb-4 flex items-center justify-between rounded-md border border-line p-3 text-sm">
        <span className="font-bold text-ink">Branches</span>
        <span className="h-6 w-11 rounded-full bg-atlasBlue p-0.5">
          <span className="block h-5 w-5 rounded-full bg-white shadow" />
        </span>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasBlue text-xs font-bold text-white">
            M
          </span>
          <span>main document</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasGreen text-xs font-bold text-white">
            B
          </span>
          <span>active local branch</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-atlasRed text-xs font-bold text-white">
            D
          </span>
          <span>discarded or deleted item</span>
        </div>
      </div>
    </div>
  );
}
