"use client";

import { useMemo, useState } from "react";
import {
  Clock3,
  ExternalLink,
  GitBranchPlus,
  GitCompareArrows,
  GitMerge,
  MessagesSquare,
  Search,
  StickyNote
} from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { RevisionObjectType } from "@/types/revision";

type ThreadFilter = "all" | "active" | "minimized" | "discarded" | "deleted";

type NavigatorThreadItem = {
  thread: LocalThread;
  sourcePreview: string;
  lastQuestion: string;
  lastAnswer: string;
  updatedAt: string;
  statusLabel: string;
  statusClassName: string;
  workspaceStatus: string;
  messageCount: number;
  noteCount: number;
  branchCount: number;
  mergeCount: number;
  comparisonCount: number;
  versionLabel: string;
  children: NavigatorThreadItem[];
};

const FILTERS: Array<{ id: ThreadFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "minimized", label: "Minimized" },
  { id: "discarded", label: "Discarded" },
  { id: "deleted", label: "Deleted" }
];

function compactText(text: string | undefined, maxLength = 132) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "No text captured yet.";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getStatusMeta(thread: LocalThread, workspaceStatus: string) {
  if (thread.status === "deleted" || workspaceStatus === "deleted") {
    return {
      label: "Deleted",
      className: "border-red-200 bg-red-50 text-atlasRed"
    };
  }

  if (thread.status === "discarded" || workspaceStatus === "discarded") {
    return {
      label: "Discarded",
      className: "border-orange-200 bg-orange-50 text-atlasOrange"
    };
  }

  if (thread.visibility === "hidden") {
    return {
      label: "Hidden",
      className: "border-slate-200 bg-slate-100 text-slate-600"
    };
  }

  if (thread.status === "merged") {
    return {
      label: "Merged",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }

  if (thread.status === "branch_created") {
    return {
      label: "Branched",
      className: "border-violet-200 bg-violet-50 text-violet-700"
    };
  }

  if (thread.status === "kept_as_note") {
    return {
      label: "Noted",
      className: "border-amber-200 bg-amber-50 text-amber-700"
    };
  }

  return {
    label: "Active",
    className: "border-blue-200 bg-blue-50 text-atlasBlue"
  };
}

function matchesFilter(
  item: Omit<NavigatorThreadItem, "children">,
  filter: ThreadFilter,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  const thread = item.thread;

  if (filter === "active" && thread.status !== "active") {
    return false;
  }

  if (filter === "minimized" && thread.visibility !== "hidden") {
    return false;
  }

  if (filter === "discarded" && thread.status !== "discarded") {
    return false;
  }

  if (filter === "deleted" && thread.status !== "deleted") {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  return [
    thread.id,
    thread.revisionLocalThreadId,
    thread.sourceSelectionId,
    thread.sourceLocalSelectionId,
    item.sourcePreview,
    item.lastQuestion,
    item.lastAnswer,
    item.statusLabel
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function countBadgeClass(count: number) {
  return count > 0
    ? "border-slate-200 bg-white text-slate-700"
    : "border-slate-100 bg-slate-50 text-slate-400";
}

type ThreadCardProps = {
  item: NavigatorThreadItem;
  depth: number;
  selectedThreadId: string | null;
  visibleIds: Set<string>;
  onOpen: (item: NavigatorThreadItem) => void;
};

function ThreadCard({
  item,
  depth,
  selectedThreadId,
  visibleIds,
  onOpen
}: ThreadCardProps) {
  const isSelected = item.thread.id === selectedThreadId;
  const canOpen = item.thread.status !== "deleted";
  const visibleChildren = item.children.filter((child) =>
    visibleIds.has(child.thread.id)
  );

  return (
    <div className="space-y-2">
      <article
        className={`rounded-lg border p-3 transition ${
          isSelected
            ? "border-atlasBlue bg-blue-50/80 shadow-sm"
            : "border-line bg-white hover:border-blue-200 hover:bg-blue-50/30"
        }`}
        style={{ marginLeft: depth ? depth * 18 : 0 }}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-normal ${item.statusClassName}`}
              >
                {item.statusLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {item.thread.revisionThreadType === "nested_local"
                  ? "Nested local"
                  : "Local"}
              </span>
              <span className="text-[11px] font-medium text-muted">
                {item.versionLabel}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-5 text-ink">
              {item.sourcePreview}
            </p>
          </div>
          <button
            onClick={() => onOpen(item)}
            disabled={!canOpen}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            title={canOpen ? "Open thread" : "Deleted threads cannot be opened"}
            aria-label={canOpen ? "Open thread" : "Deleted thread"}
          >
            <ExternalLink size={16} />
          </button>
        </div>

        <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <p>
            <span className="font-bold text-slate-700">Last question:</span>{" "}
            {item.lastQuestion || "No local question yet."}
          </p>
          <p>
            <span className="font-bold text-slate-700">Last answer:</span>{" "}
            {item.lastAnswer || "No local answer yet."}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock3 size={13} />
            {formatTime(item.updatedAt)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-600">
            {item.messageCount} messages
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${countBadgeClass(
              item.noteCount
            )}`}
          >
            <StickyNote size={12} />
            {item.noteCount}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${countBadgeClass(
              item.branchCount
            )}`}
          >
            <GitBranchPlus size={12} />
            {item.branchCount}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${countBadgeClass(
              item.mergeCount
            )}`}
          >
            <GitMerge size={12} />
            {item.mergeCount}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${countBadgeClass(
              item.comparisonCount
            )}`}
          >
            <GitCompareArrows size={12} />
            {item.comparisonCount}
          </span>
        </div>
      </article>

      {visibleChildren.length > 0 && (
        <div className="border-l border-dashed border-slate-200 pl-3">
          {visibleChildren.map((child) => (
            <ThreadCard
              key={child.thread.id}
              item={child}
              depth={depth + 1}
              selectedThreadId={selectedThreadId}
              visibleIds={visibleIds}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThreadNavigatorPanel() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const projects = useAnswerAtlasStore((state) => state.projects);
  const currentProjectId = useAnswerAtlasStore((state) => state.currentProjectId);
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const messages = useAnswerAtlasStore((state) => state.messages);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const blocks = useAnswerAtlasStore((state) => state.blocks);
  const textSelections = useAnswerAtlasStore((state) => state.textSelections);
  const localSelections = useAnswerAtlasStore((state) => state.localSelections);
  const localThreads = useAnswerAtlasStore((state) => state.localThreads);
  const revisionAnnotations = useAnswerAtlasStore(
    (state) => state.revisionAnnotations
  );
  const revisionBranches = useAnswerAtlasStore((state) => state.revisionBranches);
  const mergeRecords = useAnswerAtlasStore((state) => state.mergeRecords);
  const comparisonGraphs = useAnswerAtlasStore((state) => state.comparisonGraphs);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const executeRevisionAction = useAnswerAtlasStore(
    (state) => state.executeRevisionAction
  );

  const currentProject = projects[currentProjectId];

  const navigator = useMemo(() => {
    const threadValues = Object.values(threads).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const messagesByThread = new Map<string, ThreadMessage[]>();

    for (const message of Object.values(messages)) {
      if (message.contentState === "deleted") {
        continue;
      }

      const bucket = messagesByThread.get(message.threadId) ?? [];
      bucket.push(message);
      messagesByThread.set(message.threadId, bucket);
    }

    function getThreadMessages(threadId: string) {
      return [...(messagesByThread.get(threadId) ?? [])].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    function sourcePreview(thread: LocalThread, workspaceStatus: string) {
      if (thread.status === "deleted" || workspaceStatus === "deleted") {
        return "Deleted thread - source text is redacted.";
      }

      if (thread.sourceLocalSelectionId) {
        return compactText(localSelections[thread.sourceLocalSelectionId]?.selectedText);
      }

      if (thread.sourceSelectionId) {
        return compactText(textSelections[thread.sourceSelectionId]?.selectedText);
      }

      const anchor = anchors[thread.anchorId];
      const block = anchor?.blockId ? blocks[anchor.blockId] : undefined;

      return compactText(thread.selectedText ?? anchor?.selectedText ?? block?.text);
    }

    function statusFor(thread: LocalThread) {
      const revisionThread = thread.revisionLocalThreadId
        ? localThreads[thread.revisionLocalThreadId]
        : undefined;

      return revisionThread?.status ?? thread.status;
    }

    function versionLabel(thread: LocalThread) {
      const sourceSelection = thread.sourceSelectionId
        ? textSelections[thread.sourceSelectionId]
        : undefined;
      const sourceLocalThread = thread.revisionLocalThreadId
        ? localThreads[thread.revisionLocalThreadId]
        : undefined;
      const versionId =
        sourceSelection?.sourceDocumentVersionId ??
        sourceLocalThread?.sourceDocumentVersionId ??
        thread.createdInVersionNodeId;
      const documentVersion = versionId ? documentVersions[versionId] : undefined;

      if (documentVersion?.versionNumber) {
        return `v${documentVersion.versionNumber}`;
      }

      return versionId ? compactText(versionId, 18) : "No version";
    }

    function relatedObjectIds(thread: LocalThread) {
      return new Set(
        [
          thread.id,
          thread.revisionLocalThreadId,
          thread.sourceSelectionId,
          thread.sourceLocalSelectionId,
          thread.relatedBranchId
        ].filter(Boolean)
      );
    }

    const baseItems = threadValues.map((thread) => {
      const threadMessages = getThreadMessages(thread.id);
      const lastQuestion =
        [...threadMessages].reverse().find((message) => message.role === "user")
          ?.content ?? "";
      const lastAnswer =
        [...threadMessages].reverse().find((message) => message.role === "assistant")
          ?.content ?? "";
      const lastMessage = threadMessages[threadMessages.length - 1];
      const relatedIds = relatedObjectIds(thread);
      const workspaceStatus = statusFor(thread);
      const statusMeta = getStatusMeta(thread, workspaceStatus);
      const noteCount = Object.values(revisionAnnotations).filter(
        (annotation) =>
          annotation.status !== "deleted" &&
          (relatedIds.has(annotation.scopeId) ||
            relatedIds.has(annotation.scopeObjectId) ||
            relatedIds.has(annotation.sourceSelectionId) ||
            relatedIds.has(annotation.sourceLocalSelectionId) ||
            relatedIds.has(annotation.sourceLocalThreadId))
      ).length;
      const branchCount = Object.values(revisionBranches).filter(
        (branch) =>
          branch.status !== "deleted" &&
          (relatedIds.has(branch.id) ||
            relatedIds.has(branch.sourceObjectId) ||
            relatedIds.has(branch.parentSelectionId) ||
            relatedIds.has(branch.parentLocalSelectionId) ||
            relatedIds.has(branch.sourceLocalThreadId))
      ).length;
      const mergeCount = Object.values(mergeRecords).filter(
        (record) =>
          record.status !== "deleted" &&
          (relatedIds.has(record.id) ||
            relatedIds.has(record.sourceObjectId) ||
            relatedIds.has(record.sourceSelectionId) ||
            relatedIds.has(record.sourceLocalSelectionId) ||
            relatedIds.has(record.sourceLocalThreadId) ||
            relatedIds.has(record.sourceBranchId))
      ).length;
      const comparisonCount = Object.values(comparisonGraphs).filter(
        (graph) =>
          graph.status !== "deleted" &&
          graph.sourceObjectIds.some((objectId) => relatedIds.has(objectId))
      ).length;

      return {
        thread,
        sourcePreview: sourcePreview(thread, workspaceStatus),
        lastQuestion: compactText(lastQuestion, 118),
        lastAnswer: compactText(lastAnswer, 118),
        updatedAt: lastMessage?.createdAt ?? thread.updatedAt,
        statusLabel: statusMeta.label,
        statusClassName: statusMeta.className,
        workspaceStatus,
        messageCount: threadMessages.length,
        noteCount,
        branchCount,
        mergeCount,
        comparisonCount,
        versionLabel: versionLabel(thread)
      };
    });

    const itemById = new Map<string, NavigatorThreadItem>();

    for (const item of baseItems) {
      itemById.set(item.thread.id, {
        ...item,
        children: []
      });
    }

    const roots: NavigatorThreadItem[] = [];

    for (const item of itemById.values()) {
      const parent = item.thread.parentThreadId
        ? itemById.get(item.thread.parentThreadId)
        : undefined;

      if (parent) {
        parent.children.push(item);
      } else {
        roots.push(item);
      }
    }

    const visibleIds = new Set<string>();

    for (const item of itemById.values()) {
      if (!matchesFilter(item, filter, query)) {
        continue;
      }

      visibleIds.add(item.thread.id);

      let parentId = item.thread.parentThreadId;
      while (parentId) {
        visibleIds.add(parentId);
        parentId = itemById.get(parentId)?.thread.parentThreadId;
      }
    }

    return {
      roots,
      visibleIds,
      total: threadValues.length,
      active: threadValues.filter((thread) => thread.status === "active").length,
      minimized: threadValues.filter((thread) => thread.visibility === "hidden")
        .length,
      discarded: threadValues.filter((thread) => thread.status === "discarded")
        .length,
      deleted: threadValues.filter((thread) => thread.status === "deleted").length
    };
  }, [
    anchors,
    blocks,
    comparisonGraphs,
    documentVersions,
    filter,
    localSelections,
    localThreads,
    mergeRecords,
    messages,
    query,
    revisionAnnotations,
    revisionBranches,
    textSelections,
    threads
  ]);

  function openNavigatorThread(item: NavigatorThreadItem) {
    const targetObjectId =
      item.thread.revisionLocalThreadId ??
      item.thread.sourceLocalSelectionId ??
      item.thread.sourceSelectionId ??
      item.thread.id;
    const targetObjectType: RevisionObjectType =
      item.thread.revisionLocalThreadId
        ? "local_thread"
        : item.thread.sourceLocalSelectionId
          ? "local_selection"
          : "text_selection";
    const result = executeRevisionAction("related_thread.open", {
      target: {
        objectType: targetObjectType,
        objectId: targetObjectId,
        projectId: currentProjectId,
        conversationId: item.thread.conversationSessionId,
        status: item.workspaceStatus
      }
    });

    if (result.status !== "blocked" && item.thread.status !== "deleted") {
      openThread(item.thread.id);
    }
  }

  return (
    <div className="flex max-h-[calc(100vh-145px)] flex-col">
      <div className="space-y-3 border-b border-line p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-muted">
            Current project
          </p>
          <h3 className="mt-1 text-base font-bold text-ink">
            {currentProject?.name ?? "Default project"}
          </h3>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-md border border-line bg-white px-2 py-2">
            <p className="font-bold text-ink">{navigator.total}</p>
            <p className="text-muted">Total</p>
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-2">
            <p className="font-bold text-atlasBlue">{navigator.active}</p>
            <p className="text-muted">Active</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
            <p className="font-bold text-slate-700">{navigator.minimized}</p>
            <p className="text-muted">Hidden</p>
          </div>
          <div className="rounded-md border border-orange-100 bg-orange-50 px-2 py-2">
            <p className="font-bold text-atlasOrange">{navigator.discarded}</p>
            <p className="text-muted">Discard</p>
          </div>
          <div className="rounded-md border border-red-100 bg-red-50 px-2 py-2">
            <p className="font-bold text-atlasRed">{navigator.deleted}</p>
            <p className="text-muted">Delete</p>
          </div>
        </div>

        <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-muted">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search source text, questions, answers..."
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                filter === item.id
                  ? "border-atlasBlue bg-atlasBlue text-white"
                  : "border-line bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4">
        {navigator.total === 0 && (
          <div className="rounded-lg border border-dashed border-line bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-atlasBlue shadow-sm">
              <MessagesSquare size={20} />
            </div>
            <p className="font-semibold text-ink">No side threads yet.</p>
            <p className="mt-1">
              Select text in the main answer, press the small plus button, and
              open a local window. It will appear here and can be restored later.
            </p>
          </div>
        )}

        {navigator.total > 0 &&
          navigator.roots.every((item) => !navigator.visibleIds.has(item.thread.id)) && (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              No matching threads for this search or filter.
            </div>
          )}

        <div className="space-y-3">
          {navigator.roots
            .filter((item) => navigator.visibleIds.has(item.thread.id))
            .map((item) => (
              <ThreadCard
                key={item.thread.id}
                item={item}
                depth={0}
                selectedThreadId={selectedThreadId}
                visibleIds={navigator.visibleIds}
                onOpen={openNavigatorThread}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
