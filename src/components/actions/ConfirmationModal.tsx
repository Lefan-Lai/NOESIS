"use client";

import { AlertTriangle } from "lucide-react";
import type { ConfirmationRequirement } from "@/types/workspaceActions";

type ConfirmationModalProps = {
  open: boolean;
  requirement?: ConfirmationRequirement;
  onConfirm: () => void;
  onCancel: () => void;
};

function riskClass(riskLevel?: ConfirmationRequirement["riskLevel"]) {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "bg-red-50 text-atlasRed";
  }

  if (riskLevel === "medium") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-blue-50 text-atlasBlue";
}

export function ConfirmationModal({
  open,
  requirement,
  onConfirm,
  onCancel
}: ConfirmationModalProps) {
  if (!open || !requirement) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`grid h-10 w-10 place-items-center rounded-full ${riskClass(
              requirement.riskLevel
            )}`}
          >
            <AlertTriangle size={22} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">
              {requirement.title}
            </h2>
            <p className="text-xs font-semibold uppercase text-muted">
              {requirement.riskLevel} risk
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-600">{requirement.body}</p>
        {requirement.targetObjectPreview && (
          <div className="mt-3 rounded-md border border-line bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {requirement.targetObjectPreview}
          </div>
        )}
        <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-xs text-slate-600">
          {requirement.memoryConsequence}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            {requirement.cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="h-9 rounded-md bg-atlasRed px-4 text-sm font-semibold text-white"
          >
            {requirement.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
