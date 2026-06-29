"use client";

type RevertNodeDialogProps = {
  nodeLabel: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RevertNodeDialog({
  nodeLabel,
  open,
  onCancel,
  onConfirm
}: RevertNodeDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="mb-2 text-lg font-bold text-ink">Revert to This Node</h2>
        <p className="text-sm leading-6 text-slate-600">
          Checkout <span className="font-semibold text-ink">{nodeLabel}</span>.
          Future nodes stay visible in the timeline and are excluded from LLM
          context.
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
            className="h-9 rounded-md bg-atlasBlue px-4 text-sm font-semibold text-white"
          >
            Revert
          </button>
        </div>
      </div>
    </div>
  );
}
