"use client";

import { AlertTriangle, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";

export type TimelineImpactMode = "context" | "revert" | "delete";

export type TimelineImpactSummary = {
  nodeTitle: string;
  nodeSubtitle: string;
  statusLabel: string;
  memoryEffect: string;
  included: string[];
  excluded: string[];
  affected: Array<{
    label: string;
    count: number;
    tone?: "blue" | "amber" | "red" | "slate";
  }>;
  warnings: string[];
  confirmLabel?: string;
  confirmDisabled?: boolean;
};

type TimelineImpactDialogProps = {
  open: boolean;
  mode: TimelineImpactMode;
  summary: TimelineImpactSummary | null;
  onCancel: () => void;
  onConfirm?: () => void;
};

function modeCopy(mode: TimelineImpactMode) {
  if (mode === "context") {
    return {
      title: "Context Impact",
      icon: ShieldAlert,
      tone: "text-atlasBlue",
      description:
        "Review whether this logic point participates in future LLM context."
    };
  }

  if (mode === "delete") {
    return {
      title: "Delete Impact Preview",
      icon: Trash2,
      tone: "text-atlasRed",
      description:
        "Preview what would become deleted or unavailable before confirming."
    };
  }

  return {
    title: "Return Preview",
    icon: RotateCcw,
    tone: "text-atlasBlue",
    description:
      "Preview how the active logic path and future LLM memory will change."
  };
}

function countTone(tone: TimelineImpactSummary["affected"][number]["tone"]) {
  if (tone === "red") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "amber") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (tone === "slate") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-blue-200 bg-blue-50 text-atlasBlue";
}

export function TimelineImpactDialog({
  open,
  mode,
  summary,
  onCancel,
  onConfirm
}: TimelineImpactDialogProps) {
  if (!open || !summary) {
    return null;
  }

  const copy = modeCopy(mode);
  const Icon = copy.icon;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        <div className="flex items-start justify-between border-b border-line p-5">
          <div>
            <div className={`mb-2 flex items-center gap-2 text-sm font-bold ${copy.tone}`}>
              <Icon size={18} />
              {copy.title}
            </div>
            <h2 className="text-lg font-bold text-ink">{summary.nodeTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {summary.nodeSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-ink"
            title="Close"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="thin-scrollbar max-h-[calc(86vh-150px)] overflow-auto p-5">
          <div className="mb-4 rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <div className="font-bold text-ink">What this means</div>
            <p>{copy.description}</p>
            <p className="mt-2">
              <span className="font-semibold text-ink">Memory effect:</span>{" "}
              {summary.memoryEffect}
            </p>
            <p>
              <span className="font-semibold text-ink">Current status:</span>{" "}
              {summary.statusLabel}
            </p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {summary.affected.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border px-3 py-2 ${countTone(item.tone)}`}
              >
                <div className="text-xs font-bold uppercase tracking-wide">
                  {item.label}
                </div>
                <div className="mt-1 text-xl font-bold">{item.count}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                Included / active after action
              </div>
              <div className="space-y-2">
                {summary.included.map((item) => (
                  <div
                    key={item}
                    className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Excluded / inactive after action
              </div>
              <div className="space-y-2">
                {summary.excluded.map((item) => (
                  <div
                    key={item}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {summary.warnings.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <AlertTriangle size={16} />
                Notes
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {summary.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {mode !== "context" && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={summary.confirmDisabled}
              className={`h-9 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "delete" ? "bg-atlasRed" : "bg-atlasBlue"
              }`}
            >
              {summary.confirmLabel ?? "Confirm"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
