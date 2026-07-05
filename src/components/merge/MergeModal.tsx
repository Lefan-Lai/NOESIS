"use client";

import { AlertTriangle, GitMerge, X } from "lucide-react";
import type { MergeMode } from "@/types/revision";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

const mergeModeOptions: Array<{ value: MergeMode; label: string }> = [
  { value: "replace_selection", label: "Replace selection" },
  { value: "insert_before_selection", label: "Insert before selection" },
  { value: "insert_after_selection", label: "Insert after selection" },
  { value: "append_to_paragraph", label: "Append to paragraph" },
  { value: "new_paragraph_after_selection", label: "New paragraph after selection" },
  { value: "replace_custom_range", label: "Replace custom range" }
];

export function MergeModal() {
  const activeMergeRecordId = useAnswerAtlasStore(
    (state) => state.activeMergeRecordId
  );
  const mergeRecords = useAnswerAtlasStore((state) => state.mergeRecords);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
  const textSelections = useAnswerAtlasStore((state) => state.textSelections);
  const pendingMergeDiff = useAnswerAtlasStore((state) => state.pendingMergeDiff);
  const mergeConflictMessage = useAnswerAtlasStore(
    (state) => state.mergeConflictMessage
  );
  const setMergeMode = useAnswerAtlasStore((state) => state.setMergeMode);
  const setManualMergeTarget = useAnswerAtlasStore(
    (state) => state.setManualMergeTarget
  );
  const confirmMerge = useAnswerAtlasStore((state) => state.confirmMerge);
  const cancelActiveMerge = useAnswerAtlasStore(
    (state) => state.cancelActiveMerge
  );
  const mergeRecord = activeMergeRecordId
    ? mergeRecords[activeMergeRecordId]
    : null;
  const targetVersion = mergeRecord
    ? documentVersions[mergeRecord.targetDocumentVersionId]
    : null;
  const targetSelection = mergeRecord?.targetSelectionId
    ? textSelections[mergeRecord.targetSelectionId]
    : null;

  if (!mergeRecord) {
    return null;
  }

  function chooseTargetManually() {
    const startInput = window.prompt("Target range start offset");
    const endInput = window.prompt("Target range end offset");
    const start = Number(startInput);
    const end = Number(endInput);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return;
    }

    setManualMergeTarget(start, end);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        <div className="flex h-14 items-center justify-between border-b border-line px-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <GitMerge size={19} className="text-atlasPurple" />
            Merge into Document
          </h2>
          <button
            onClick={cancelActiveMerge}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
            title="Cancel merge"
            aria-label="Cancel merge"
          >
            <X size={18} />
          </button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-auto p-5 text-sm leading-6">
          <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            <section className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-atlasBlue">
                Source Content
              </div>
              <div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold text-blue-800">
                <span>{mergeRecord.sourceType ?? mergeRecord.sourceObjectType}</span>
                <span>{mergeRecord.sourceId ?? mergeRecord.sourceObjectId}</span>
              </div>
              <div className="whitespace-pre-wrap text-slate-800">
                {mergeRecord.sourceText || "No source text resolved."}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-slate-50 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Target Selection
              </div>
              <div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span>
                  Version {targetVersion?.versionNumber ?? "?"}{" "}
                  {targetVersion?.id ? `(${targetVersion.id})` : ""}
                </span>
                <span>{mergeRecord.targetSelectionId ?? "manual target needed"}</span>
              </div>
              <div className="whitespace-pre-wrap text-slate-800">
                {targetSelection?.selectedText ??
                  (mergeRecord.targetRangeStart !== undefined
                    ? targetVersion?.content.slice(
                        mergeRecord.targetRangeStart,
                        mergeRecord.targetRangeEnd
                      )
                    : "No target selection resolved.")}
              </div>
            </section>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
              Merge Mode
            </label>
            <select
              value={mergeRecord.mergeMode}
              onChange={(event) => setMergeMode(event.target.value as MergeMode)}
              className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700"
            >
              {mergeModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {(mergeRecord.status === "conflict" || mergeConflictMessage) && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-900">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <AlertTriangle size={17} />
                Conflict needs manual target
              </div>
              <div>
                {mergeConflictMessage ??
                  mergeRecord.conflictReason ??
                  "The original target could not be safely resolved."}
              </div>
              <button
                onClick={chooseTargetManually}
                className="mt-3 h-8 rounded-md border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-800"
              >
                Choose Target Manually
              </button>
            </div>
          )}

          {pendingMergeDiff && (
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">
                    Diff Preview
                  </div>
                  <div className="text-xs text-slate-500">
                    Added {pendingMergeDiff.summary.addedCharacters} chars /
                    Removed {pendingMergeDiff.summary.removedCharacters} chars /
                    Changed {pendingMergeDiff.summary.changedCharacters} chars
                  </div>
                </div>
                <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-semibold text-atlasPurple">
                  status: {mergeRecord.status}
                </span>
              </div>
              <div className="space-y-2">
                {pendingMergeDiff.chunks.map((chunk, index) => (
                  <div
                    key={`${chunk.type}-${index}`}
                    className={`rounded-md border px-3 py-2 ${
                      chunk.type === "added"
                        ? "border-green-200 bg-green-50"
                        : chunk.type === "removed"
                          ? "border-red-200 bg-red-50"
                          : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="mb-1 text-xs font-bold uppercase text-slate-500">
                      {chunk.type}
                    </div>
                    <div className="whitespace-pre-wrap text-slate-800">
                      {chunk.text}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50 px-5 py-4">
          <button
            onClick={cancelActiveMerge}
            className="h-9 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={cancelActiveMerge}
            className="h-9 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700"
            title="This first Phase 6 UI keeps note creation in the existing note controls."
          >
            Save as Note Instead
          </button>
          <button
            onClick={confirmMerge}
            disabled={mergeRecord.status !== "diff_ready" || !pendingMergeDiff}
            className="h-9 rounded-md bg-atlasBlue px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm Merge
          </button>
        </div>
      </div>
    </div>
  );
}
