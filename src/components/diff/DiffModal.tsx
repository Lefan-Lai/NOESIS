"use client";

import { X } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

export function DiffModal() {
  const open = useAnswerAtlasStore((state) => state.isDiffModalOpen);
  const patch = useAnswerAtlasStore((state) => state.pendingPatch);
  const confirmMerge = useAnswerAtlasStore((state) => state.confirmMerge);
  const closeDiffModal = useAnswerAtlasStore((state) => state.closeDiffModal);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-4xl rounded-lg border border-line bg-white shadow-panel">
        <div className="flex h-14 items-center justify-between border-b border-line px-5">
          <h2 className="text-lg font-bold text-ink">Merge Diff</h2>
          <button
            onClick={closeDiffModal}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {patch.map((operation, index) => {
            if (operation.op !== "replace_block_text") {
              return null;
            }

            return (
              <div key={`${operation.op}-${index}`} className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="mb-2 text-sm font-bold text-atlasRed">
                    Original
                  </div>
                  <p className="text-sm leading-6 text-slate-800">
                    {operation.oldText}
                  </p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="mb-2 text-sm font-bold text-atlasGreen">
                    Revised
                  </div>
                  <p className="text-sm leading-6 text-slate-800">
                    {operation.newText}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            onClick={closeDiffModal}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={confirmMerge}
            className="h-9 rounded-md bg-atlasBlue px-4 text-sm font-semibold text-white"
          >
            Confirm Merge
          </button>
        </div>
      </div>
    </div>
  );
}
