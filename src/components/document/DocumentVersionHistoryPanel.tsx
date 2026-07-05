"use client";

import type { DocumentVersionModel } from "@/types/revision";

type DocumentVersionHistoryPanelProps = {
  versions: DocumentVersionModel[];
  activeVersionId?: string;
  onView: (version: DocumentVersionModel) => void;
  onViewDiff: (version: DocumentVersionModel) => void;
  onClose: () => void;
};

export function DocumentVersionHistoryPanel({
  versions,
  activeVersionId,
  onView,
  onViewDiff,
  onClose
}: DocumentVersionHistoryPanelProps) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Document Versions</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <div className="space-y-2">
        {versions.map((version) => (
          <div
            key={version.id}
            className="rounded-md border border-line bg-slate-50 px-3 py-2"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">
                  Version {version.versionNumber ?? "?"}
                  {version.id === activeVersionId && (
                    <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                      active
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {version.sourceType ?? "unknown"} · {version.createdBy ?? "system"} ·{" "}
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  }).format(new Date(version.createdAt))}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onView(version)}
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onViewDiff(version)}
                  disabled={!version.parentDocumentVersionId && !version.parentVersionId}
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  View Diff
                </button>
              </div>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-slate-600">
              {version.status === "deleted"
                ? "[deleted version]"
                : version.content.slice(0, 180)}
            </p>
          </div>
        ))}
        {versions.length === 0 && (
          <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-muted">
            No document versions yet.
          </div>
        )}
      </div>
    </div>
  );
}
