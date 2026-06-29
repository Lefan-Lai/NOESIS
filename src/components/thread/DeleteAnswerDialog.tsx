"use client";

import { AlertTriangle } from "lucide-react";

type DeleteAnswerDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAnswerDialog({
  open,
  onCancel,
  onConfirm
}: DeleteAnswerDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-atlasRed">
            <AlertTriangle size={22} />
          </span>
          <h2 className="text-lg font-bold text-ink">Delete this answer?</h2>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          This will remove the local answer from the interface and from future
          LLM context. This action cannot be used as context later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-9 rounded-md bg-atlasRed px-4 text-sm font-semibold text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
