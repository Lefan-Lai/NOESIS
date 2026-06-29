"use client";

import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

export function ContextDebugPanel() {
  const show = useAnswerAtlasStore((state) => state.showContextDebugPanel);
  const preview = useAnswerAtlasStore((state) => state.contextPreview);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const toggle = useAnswerAtlasStore((state) => state.toggleContextDebugPanel);

  if (!show) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-4 right-4 z-30 flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-panel max-[900px]:right-3"
      >
        <Bug size={17} />
        Context
        <ChevronUp size={16} />
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-30 w-[420px] rounded-lg border border-line bg-white shadow-panel max-[900px]:left-3 max-[900px]:right-3 max-[900px]:w-auto">
      <button
        onClick={toggle}
        className="flex h-11 w-full items-center justify-between border-b border-line px-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ink">
          <Bug size={17} className="text-atlasBlue" />
          Context Preview
        </span>
        <ChevronDown size={16} className="text-slate-600" />
      </button>
      <div className="max-h-[300px] overflow-auto p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-blue-50 p-2">
            <div className="font-bold text-atlasBlue">Active</div>
            <div className="truncate text-slate-700">{activeVersionNodeId}</div>
          </div>
          <div className="rounded-md bg-green-50 p-2">
            <div className="font-bold text-atlasGreen">Included</div>
            <div className="text-slate-700">{preview?.includedItems.length ?? 0}</div>
          </div>
          <div className="rounded-md bg-orange-50 p-2">
            <div className="font-bold text-atlasOrange">Tokens</div>
            <div className="text-slate-700">{preview?.tokenEstimate ?? 0}</div>
          </div>
        </div>

        <div className="mb-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-normal text-slate-500">
            Included
          </h3>
          <div className="space-y-1">
            {preview?.includedItems.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-green-100 bg-green-50 px-2 py-1 text-xs text-slate-700"
              >
                <span className="font-semibold">{item.type}</span>:{" "}
                {item.text.slice(0, 82)}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-normal text-slate-500">
            Excluded
          </h3>
          <div className="space-y-1">
            {preview?.excludedItems.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs text-slate-700"
              >
                <span className="font-semibold">{item.type}</span>: {item.reason}
              </div>
            ))}
            {preview?.excludedItems.length === 0 && (
              <div className="rounded-md border border-line bg-slate-50 px-2 py-1 text-xs text-muted">
                No excluded content
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
