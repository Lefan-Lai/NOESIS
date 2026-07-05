"use client";

import type { TextDiff } from "@/services/revision/DiffService";
import type { DocumentVersionModel } from "@/types/revision";

type DiffReviewModalProps = {
  diff: TextDiff;
  baseVersion?: DocumentVersionModel;
  draftPreview: string;
  conflictMessage?: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onContinueEditing: () => void;
  onCancel: () => void;
};

export function DiffReviewModal({
  diff,
  baseVersion,
  draftPreview,
  conflictMessage,
  confirmDisabled,
  onConfirm,
  onContinueEditing,
  onCancel
}: DiffReviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-base font-bold text-ink">Review Document Diff</h3>
          <p className="text-xs text-muted">
            Base version {baseVersion?.versionNumber ?? "unknown"} ·{" "}
            {diff.summary.addedCharacters} added ·{" "}
            {diff.summary.removedCharacters} removed
          </p>
        </div>
        <div className="thin-scrollbar max-h-[58vh] overflow-auto p-4">
          {conflictMessage && (
            <div className="mb-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
              {conflictMessage}
            </div>
          )}
          <div className="mb-4 rounded-md border border-line bg-slate-50 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Draft Preview
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {draftPreview}
            </pre>
          </div>
          <div className="space-y-2">
            {diff.chunks.map((chunk, index) => (
              <div
                key={`${chunk.type}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm leading-6 ${
                  chunk.type === "added"
                    ? "border-green-200 bg-green-50 text-green-900"
                    : chunk.type === "removed"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-line bg-white text-slate-700"
                }`}
              >
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-70">
                  {chunk.type}
                </div>
                <pre className="whitespace-pre-wrap">{chunk.text}</pre>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinueEditing}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-atlasBlue"
          >
            Continue Editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={Boolean(conflictMessage) || confirmDisabled}
            className="rounded-md bg-atlasBlue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm Save
          </button>
        </div>
      </div>
    </div>
  );
}
