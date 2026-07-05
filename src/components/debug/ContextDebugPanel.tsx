"use client";

import { useMemo } from "react";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

export function ContextDebugPanel() {
  const show = useAnswerAtlasStore((state) => state.showContextDebugPanel);
  const preview = useAnswerAtlasStore((state) => state.contextPreview);
  const contextSnapshots = useAnswerAtlasStore((state) => state.contextSnapshots);
  const llmCallRecords = useAnswerAtlasStore((state) => state.llmCallRecords);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const toggle = useAnswerAtlasStore((state) => state.toggleContextDebugPanel);
  const latestCall = useMemo(
    () =>
      Object.values(llmCallRecords).sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      )[0],
    [llmCallRecords]
  );
  const latestSnapshot = latestCall
    ? contextSnapshots[latestCall.contextSnapshotId]
    : Object.values(contextSnapshots).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
  const includedForReview =
    latestSnapshot?.includedItems ??
    preview?.includedItems.map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      reason: item.reason
    })) ??
    [];
  const excludedForReview =
    latestSnapshot?.excludedItems ??
    preview?.excludedItems.map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      reason: item.reason
    })) ??
    [];

  if (!show) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-4 right-4 z-30 flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-panel max-[900px]:right-3"
      >
        <Bug size={17} />
        Context Review
        <ChevronUp size={16} />
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-30 w-[420px] rounded-lg border border-line bg-white shadow-panel max-[900px]:left-3 max-[900px]:right-3 max-[900px]:w-auto">
      <button
        onClick={toggle}
        className="flex h-11 w-full items-center justify-between border-b border-line px-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ink">
          <Bug size={17} className="text-atlasBlue" />
          Context Review
        </span>
        <ChevronDown size={16} className="text-slate-600" />
      </button>
      <div className="max-h-[300px] overflow-auto p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-blue-50 p-2">
            <div className="font-bold text-atlasBlue">Active Node</div>
            <div className="truncate text-slate-700">{activeVersionNodeId}</div>
          </div>
          <div className="rounded-md bg-green-50 p-2">
            <div className="font-bold text-atlasGreen">Preview</div>
            <div className="text-slate-700">
              {preview?.includedItems.length ?? 0} items
            </div>
          </div>
          <div className="rounded-md bg-orange-50 p-2">
            <div className="font-bold text-atlasOrange">Used</div>
            <div className="text-slate-700">
              {latestSnapshot?.includedItems.length ?? 0} items
            </div>
          </div>
        </div>

        <div className="mb-3 rounded-md border border-line bg-slate-50 p-2 text-xs leading-5 text-slate-700">
          <div className="font-bold text-ink">Latest Context Used</div>
          {latestCall && latestSnapshot ? (
            <div>
              <div>Model: {latestCall.model}</div>
              <div>Status: {latestCall.status}</div>
              <div>Scope: {latestSnapshot.callType}</div>
              <div>
                Active document version:{" "}
                {latestSnapshot.metadata?.active_document_version_id?.toString() ??
                  "none"}
              </div>
              <div>
                Version number:{" "}
                {latestSnapshot.metadata?.active_document_version_number?.toString() ??
                  latestSnapshot.metadata?.active_version_number?.toString() ??
                  "unknown"}
              </div>
              <div>
                Source type:{" "}
                {latestSnapshot.metadata?.active_document_version_source_type?.toString() ??
                  "unknown"}
              </div>
              <div>
                Time:{" "}
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                }).format(new Date(latestCall.completedAt))}
              </div>
            </div>
          ) : (
            <div className="text-muted">
              No saved LLM context snapshot yet. Send a message to create one.
            </div>
          )}
        </div>

        <div className="mb-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-normal text-slate-500">
            Included In Latest Context
          </h3>
          <div className="space-y-1">
            {includedForReview.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-green-100 bg-green-50 px-2 py-1 text-xs text-slate-700"
              >
                <span className="font-semibold">{item.type}</span>:{" "}
                {item.text.slice(0, 82)}
                <div className="text-[11px] text-green-800/70">{item.reason}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-normal text-slate-500">
            Excluded From Latest Context
          </h3>
          <div className="space-y-1">
            {excludedForReview.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs text-slate-700"
              >
                <span className="font-semibold">{item.type}</span>: {item.reason}
              </div>
            ))}
            {excludedForReview.length === 0 && (
              <div className="rounded-md border border-line bg-slate-50 px-2 py-1 text-xs text-muted">
                No excluded content
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
