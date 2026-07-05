"use client";

import type { DiffRequirement } from "@/types/workspaceActions";

type DiffRequiredFlowProps = {
  open: boolean;
  requirement?: DiffRequirement;
  onConfirm: () => void;
  onContinueEditing: () => void;
  onCancel: () => void;
};

export function DiffRequiredFlow({
  open,
  requirement,
  onConfirm,
  onContinueEditing,
  onCancel
}: DiffRequiredFlowProps) {
  if (!open || !requirement) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">{requirement.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {requirement.body}
          </p>
        </div>
        <pre className="thin-scrollbar max-h-80 overflow-auto rounded-md border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          {JSON.stringify(requirement.diff ?? {}, null, 2)}
        </pre>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            {requirement.cancelLabel}
          </button>
          <button
            onClick={onContinueEditing}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            {requirement.continueLabel}
          </button>
          <button
            onClick={onConfirm}
            className="h-9 rounded-md bg-atlasBlue px-4 text-sm font-semibold text-white"
          >
            {requirement.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
