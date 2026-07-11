"use client";

import { useEffect, useState } from "react";
import { GitBranchPlus, GitMerge, Save, X } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

export function RevisionBranchPanel() {
  const activeRevisionBranchId = useAnswerAtlasStore(
    (state) => state.activeRevisionBranchId
  );
  const revisionBranches = useAnswerAtlasStore((state) => state.revisionBranches);
  const revisionAnnotations = useAnswerAtlasStore(
    (state) => state.revisionAnnotations
  );
  const localSelections = useAnswerAtlasStore((state) => state.localSelections);
  const textSelections = useAnswerAtlasStore((state) => state.textSelections);
  const localThreads = useAnswerAtlasStore((state) => state.localThreads);
  const closeRevisionBranchPanel = useAnswerAtlasStore(
    (state) => state.closeRevisionBranchPanel
  );
  const saveRevisionBranchDraft = useAnswerAtlasStore(
    (state) => state.saveRevisionBranchDraft
  );
  const addBranchContextNote = useAnswerAtlasStore(
    (state) => state.addBranchContextNote
  );
  const openMergeModalForSource = useAnswerAtlasStore(
    (state) => state.openMergeModalForSource
  );
  const branch = activeRevisionBranchId
    ? revisionBranches[activeRevisionBranchId]
    : null;
  const localSelection = branch?.parentLocalSelectionId
    ? localSelections[branch.parentLocalSelectionId]
    : null;
  const mainSelection = branch?.parentSelectionId
    ? textSelections[branch.parentSelectionId]
    : null;
  const sourceLocalThread = branch?.sourceLocalThreadId
    ? localThreads[branch.sourceLocalThreadId]
    : null;
  const [draft, setDraft] = useState(branch?.draftContent ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setDraft(branch?.draftContent ?? "");
  }, [branch?.id, branch?.draftContent]);

  if (!branch) {
    return (
      <section className="panel h-full min-h-0 min-w-[300px] overflow-hidden rounded-lg max-[900px]:h-[520px]">
        <div className="grid h-full place-items-center p-6 text-sm text-muted">
          No revision branch selected.
        </div>
      </section>
    );
  }

  const relatedNotes = Object.values(revisionAnnotations)
    .filter(
      (annotation) =>
        annotation.scopeId === branch.id ||
        annotation.scopeObjectId === branch.id ||
        annotation.sourceBranchId === branch.id
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return (
    <section className="panel h-full min-h-0 min-w-[300px] overflow-hidden rounded-lg max-[900px]:h-[520px]">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <h2 className="flex min-w-0 items-center gap-2 truncate text-lg font-bold text-ink">
            <GitBranchPlus size={19} className="text-atlasBlue" />
            Branch Panel
          </h2>
          <button
            onClick={closeRevisionBranchPanel}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Close branch panel"
            aria-label="Close branch panel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm leading-6">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Branch
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <div className="font-semibold text-ink">{branch.id}</div>
              <div className="text-xs text-muted">
                Status: {branch.status} · Scope: {branch.memoryScope} · Effect:{" "}
                {branch.memoryEffect ?? "branch_only"}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Source Selected Fragment
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-slate-700">
              {localSelection?.selectedText ?? branch.content ?? ""}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Draft Content
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-36 w-full resize-none rounded-lg border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-atlasBlue"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Original Main Selection
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3 text-slate-700">
              {mainSelection?.selectedText ?? "No main selection linked."}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Source Local Thread
            </div>
            <div className="rounded-lg border border-line bg-white p-3 text-slate-700">
              {sourceLocalThread
                ? `${sourceLocalThread.id} · ${sourceLocalThread.threadType}`
                : "No source local thread linked."}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Add Context Note
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-20 w-full resize-none rounded-md border border-amber-100 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500"
                placeholder="Save a branch-scoped note for future branch context..."
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => {
                    addBranchContextNote(branch.id, note);
                    setNote("");
                  }}
                  disabled={!note.trim()}
                  className="h-8 rounded-md bg-amber-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>

          {relatedNotes.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Related Notes
              </div>
              <div className="space-y-2">
                {relatedNotes.map((annotation) => (
                  <div
                    key={annotation.id}
                    className="rounded-lg border border-amber-200 bg-white p-3"
                  >
                    <div className="mb-1 flex flex-wrap gap-2 text-xs font-semibold text-amber-800">
                      <span>{annotation.scopeType ?? annotation.scope}</span>
                      <span>{annotation.sourceType ?? "manual_note"}</span>
                      <span>{annotation.status}</span>
                    </div>
                    <div className="text-slate-700">
                      {annotation.status === "deleted"
                        ? "Deleted note tombstone"
                        : annotation.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/70 p-3">
          <button
            onClick={() => {
              saveRevisionBranchDraft(branch.id, draft);
              openMergeModalForSource("revision_branch", branch.id);
            }}
            className="flex h-9 items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 text-sm font-semibold text-atlasPurple"
          >
            <GitMerge size={16} />
            Merge into Document
          </button>
          <button
            onClick={() => saveRevisionBranchDraft(branch.id, draft)}
            className="flex h-9 items-center gap-2 rounded-md bg-atlasBlue px-3 text-sm font-semibold text-white"
          >
            <Save size={16} />
            Save Draft
          </button>
        </div>
      </div>
    </section>
  );
}
