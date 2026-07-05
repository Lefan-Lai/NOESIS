"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  Folder,
  FolderOpen,
  GitBranchPlus,
  GitCompareArrows,
  GitMerge,
  MessagesSquare,
  Search,
  StickyNote
} from "lucide-react";
import {
  type AnswerAtlasState,
  useAnswerAtlasStore
} from "@/store/useAnswerAtlasStore";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { RevisionObjectType } from "@/types/revision";

type ThreadExplorerFilter =
  | "all"
  | "main"
  | "followup"
  | "has_notes"
  | "has_branches"
  | "has_merges"
  | "has_comparisons"
  | "active"
  | "discarded"
  | "deleted"
  | "merged"
  | "branched"
  | "noted";

type ProjectThreadData = Pick<
  AnswerAtlasState,
  | "mainWindowId"
  | "currentDocumentId"
  | "activeVersionNodeId"
  | "windows"
  | "sessions"
  | "conversationMessages"
  | "documents"
  | "mainConversations"
  | "revisionMessages"
  | "threads"
  | "messages"
  | "anchors"
  | "blocks"
  | "textSelections"
  | "localThreads"
  | "localSelections"
  | "revisionAnnotations"
  | "revisionBranches"
  | "mergeRecords"
  | "comparisonGraphs"
  | "documentVersions"
>;

type ProjectThreadDataset = ProjectThreadData & {
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  isCurrent: boolean;
};

type ThreadKind = "main" | "followup";

type ExplorerThreadItem = {
  projectId: string;
  projectName: string;
  thread: LocalThread;
  kind: ThreadKind;
  kindLabel: "Main Answer Thread" | "Follow-up Thread";
  sourceLabel: "Source: Main answer selection" | "Source: Follow-up answer fragment";
  sourcePreview: string;
  lastQuestion: string;
  lastAnswer: string;
  updatedAt: string;
  status: string;
  statusLabel: string;
  statusClassName: string;
  uiLabel: string;
  memoryLabel: string;
  messageCount: number;
  noteCount: number;
  branchCount: number;
  mergeCount: number;
  comparisonCount: number;
  versionLabel: string;
  directMatch: boolean;
  children: ExplorerThreadItem[];
};

type ProjectExplorer = {
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  mainAnswerWindow: MainAnswerWindowInfo;
  roots: ExplorerThreadItem[];
  visibleIds: Set<string>;
  total: number;
  active: number;
  main: number;
  followup: number;
  discarded: number;
  deleted: number;
  latestThreadAt?: string;
};

type MainAnswerWindowInfo = {
  title: string;
  documentTitle: string;
  activeDocumentVersionLabel: string;
  activeDocumentPreview: string;
  conversationTitle: string;
  messageCount: number;
  documentVersionCount: number;
  lastUserQuestion: string;
  lastAssistantAnswer: string;
  updatedAt: string;
};

const FILTERS: Array<{ id: ThreadExplorerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "main", label: "Main Answer Thread" },
  { id: "followup", label: "Follow-up Thread" },
  { id: "has_notes", label: "Has Notes" },
  { id: "has_branches", label: "Has Branch" },
  { id: "has_merges", label: "Has Merge" },
  { id: "has_comparisons", label: "Has Comparison" },
  { id: "active", label: "Active" },
  { id: "merged", label: "Merged" },
  { id: "branched", label: "Branched" },
  { id: "noted", label: "Noted" },
  { id: "discarded", label: "Discarded" },
  { id: "deleted", label: "Deleted" }
];

function compactText(text: string | undefined, maxLength = 120) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "No text captured yet.";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function formatTime(value?: string) {
  if (!value) {
    return "No activity yet";
  }

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

function threadKind(thread: LocalThread): ThreadKind {
  return thread.revisionThreadType === "nested_local" ||
    Boolean(thread.parentThreadId || thread.sourceLocalSelectionId)
    ? "followup"
    : "main";
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

function memoryLabel(thread: LocalThread, workspaceStatus: string) {
  if (thread.status === "deleted" || workspaceStatus === "deleted") {
    return "Memory: never include";
  }

  if (thread.status === "discarded" || workspaceStatus === "discarded") {
    return "Memory: excluded by default";
  }

  if (thread.status === "merged") {
    return "Memory: merged through DocumentVersion";
  }

  return "Memory: local only";
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

function buildExplorer(
  dataset: ProjectThreadDataset,
  filter: ThreadExplorerFilter,
  query: string
): ProjectExplorer {
  const normalizedQuery = query.trim().toLowerCase();
  const threadValues = Object.values(dataset.threads).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const messagesByThread = new Map<string, ThreadMessage[]>();

  for (const message of Object.values(dataset.messages)) {
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

  function buildMainAnswerWindow(): MainAnswerWindowInfo {
    const mainWindow = dataset.windows[dataset.mainWindowId];
    const mainSessionId = mainWindow?.conversationSessionId;
    const uiMessages = Object.values(dataset.conversationMessages)
      .filter(
        (message) =>
          message.contentState !== "deleted" &&
          (!mainSessionId || message.sessionId === mainSessionId)
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    const persistentMainMessages = Object.values(dataset.revisionMessages)
      .filter(
        (message) =>
          message.projectId === dataset.projectId &&
          message.status !== "deleted" &&
          (!message.threadType || message.threadType === "main")
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    const mainMessages =
      uiMessages.length > 0
        ? uiMessages
        : persistentMainMessages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt
          }));
    const activeDocumentVersion =
      Object.values(dataset.documentVersions)
        .filter(
          (version) =>
            version.projectId === dataset.projectId && version.status === "active"
        )
        .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0] ??
      Object.values(dataset.documentVersions)
        .filter(
          (version) =>
            version.projectId === dataset.projectId && version.status !== "deleted"
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
    const documentVersionCount = Object.values(dataset.documentVersions).filter(
      (version) =>
        version.projectId === dataset.projectId && version.status !== "deleted"
    ).length;
    const currentDocument = dataset.currentDocumentId
      ? dataset.documents[dataset.currentDocumentId]
      : undefined;
    const mainConversation = Object.values(dataset.mainConversations)
      .filter(
        (conversation) =>
          conversation.projectId === dataset.projectId &&
          conversation.status !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
    const lastUserQuestion =
      [...mainMessages].reverse().find((message) => message.role === "user")
        ?.content ?? "";
    const lastAssistantAnswer =
      [...mainMessages].reverse().find((message) => message.role === "assistant")
        ?.content ?? "";
    const lastMessage = mainMessages[mainMessages.length - 1];
    const documentTitle =
      activeDocumentVersion?.title ??
      currentDocument?.title ??
      (dataset.currentDocumentId ? compactText(dataset.currentDocumentId, 28) : "");

    return {
      title: mainWindow?.title ?? "Main Answer Window",
      documentTitle: documentTitle || "No document generated yet",
      activeDocumentVersionLabel: activeDocumentVersion?.versionNumber
        ? `Active Document Version: v${activeDocumentVersion.versionNumber}`
        : activeDocumentVersion?.id
          ? `Active Document Version: ${compactText(activeDocumentVersion.id, 20)}`
          : "Active Document Version: none",
      activeDocumentPreview: compactText(
        activeDocumentVersion?.content ?? currentDocument?.rawText,
        160
      ),
      conversationTitle: mainConversation?.title ?? "Main Conversation",
      messageCount: mainMessages.length,
      documentVersionCount,
      lastUserQuestion: compactText(lastUserQuestion, 120),
      lastAssistantAnswer: compactText(lastAssistantAnswer, 120),
      updatedAt:
        lastMessage?.createdAt ??
        activeDocumentVersion?.createdAt ??
        mainWindow?.updatedAt ??
        dataset.projectUpdatedAt
    };
  }

  function workspaceStatus(thread: LocalThread) {
    const revisionThread = thread.revisionLocalThreadId
      ? dataset.localThreads[thread.revisionLocalThreadId]
      : undefined;

    return revisionThread?.status ?? thread.status;
  }

  function sourcePreview(thread: LocalThread, status: string) {
    if (thread.status === "deleted" || status === "deleted") {
      return "Deleted thread - source text is redacted.";
    }

    if (thread.sourceLocalSelectionId) {
      return compactText(
        dataset.localSelections[thread.sourceLocalSelectionId]?.selectedText
      );
    }

    if (thread.sourceSelectionId) {
      return compactText(dataset.textSelections[thread.sourceSelectionId]?.selectedText);
    }

    const anchor = dataset.anchors[thread.anchorId];
    const block = anchor?.blockId ? dataset.blocks[anchor.blockId] : undefined;

    return compactText(thread.selectedText ?? anchor?.selectedText ?? block?.text);
  }

  function versionLabel(thread: LocalThread) {
    const sourceSelection = thread.sourceSelectionId
      ? dataset.textSelections[thread.sourceSelectionId]
      : undefined;
    const sourceLocalThread = thread.revisionLocalThreadId
      ? dataset.localThreads[thread.revisionLocalThreadId]
      : undefined;
    const versionId =
      sourceSelection?.sourceDocumentVersionId ??
      sourceLocalThread?.sourceDocumentVersionId ??
      thread.createdInVersionNodeId;
    const documentVersion = versionId
      ? dataset.documentVersions[versionId]
      : undefined;

    if (documentVersion?.versionNumber) {
      return `Source version: v${documentVersion.versionNumber}`;
    }

    return versionId
      ? `Source version: ${compactText(versionId, 16)}`
      : "Source version: unknown";
  }

  function countsFor(thread: LocalThread) {
    const relatedIds = relatedObjectIds(thread);
    const noteCount = Object.values(dataset.revisionAnnotations).filter(
      (annotation) =>
        annotation.status !== "deleted" &&
        (relatedIds.has(annotation.scopeId) ||
          relatedIds.has(annotation.scopeObjectId) ||
          relatedIds.has(annotation.sourceSelectionId) ||
          relatedIds.has(annotation.sourceLocalSelectionId) ||
          relatedIds.has(annotation.sourceLocalThreadId))
    ).length;
    const branchCount = Object.values(dataset.revisionBranches).filter(
      (branch) =>
        branch.status !== "deleted" &&
        (relatedIds.has(branch.id) ||
          relatedIds.has(branch.sourceObjectId) ||
          relatedIds.has(branch.parentSelectionId) ||
          relatedIds.has(branch.parentLocalSelectionId) ||
          relatedIds.has(branch.sourceLocalThreadId))
    ).length;
    const mergeCount = Object.values(dataset.mergeRecords).filter(
      (record) =>
        record.status !== "deleted" &&
        (relatedIds.has(record.id) ||
          relatedIds.has(record.sourceObjectId) ||
          relatedIds.has(record.sourceSelectionId) ||
          relatedIds.has(record.sourceLocalSelectionId) ||
          relatedIds.has(record.sourceLocalThreadId) ||
          relatedIds.has(record.sourceBranchId))
    ).length;
    const comparisonCount = Object.values(dataset.comparisonGraphs).filter(
      (graph) =>
        graph.status !== "deleted" &&
        graph.sourceObjectIds.some((objectId) => relatedIds.has(objectId))
    ).length;

    return {
      noteCount,
      branchCount,
      mergeCount,
      comparisonCount
    };
  }

  function matchesFilter(item: Omit<ExplorerThreadItem, "children" | "directMatch">) {
    if (filter === "main" && item.kind !== "main") {
      return false;
    }

    if (filter === "followup" && item.kind !== "followup") {
      return false;
    }

    if (filter === "has_notes" && item.noteCount === 0) {
      return false;
    }

    if (filter === "has_branches" && item.branchCount === 0) {
      return false;
    }

    if (filter === "has_merges" && item.mergeCount === 0) {
      return false;
    }

    if (filter === "has_comparisons" && item.comparisonCount === 0) {
      return false;
    }

    if (filter === "active" && item.status !== "active") {
      return false;
    }

    if (filter === "merged" && item.status !== "merged") {
      return false;
    }

    if (filter === "branched" && item.status !== "branch_created") {
      return false;
    }

    if (filter === "noted" && item.status !== "kept_as_note") {
      return false;
    }

    if (filter === "discarded" && item.status !== "discarded") {
      return false;
    }

    if (filter === "deleted" && item.status !== "deleted") {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      item.projectName,
      item.thread.id,
      item.thread.revisionLocalThreadId,
      item.thread.sourceSelectionId,
      item.thread.sourceLocalSelectionId,
      item.kindLabel,
      item.sourceLabel,
      item.sourcePreview,
      item.lastQuestion,
      item.lastAnswer,
      item.statusLabel,
      item.memoryLabel
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  }

  const baseItems = threadValues.map((thread) => {
    const status = workspaceStatus(thread);
    const statusMeta = getStatusMeta(thread, status);
    const kind = threadKind(thread);
    const threadMessages = getThreadMessages(thread.id);
    const lastQuestion =
      [...threadMessages].reverse().find((message) => message.role === "user")
        ?.content ?? "";
    const lastAnswer =
      [...threadMessages].reverse().find((message) => message.role === "assistant")
        ?.content ?? "";
    const lastMessage = threadMessages[threadMessages.length - 1];
    const counts = countsFor(thread);

    return {
      projectId: dataset.projectId,
      projectName: dataset.projectName,
      thread,
      kind,
      kindLabel:
        kind === "followup"
          ? ("Follow-up Thread" as const)
          : ("Main Answer Thread" as const),
      sourceLabel:
        kind === "followup"
          ? ("Source: Follow-up answer fragment" as const)
          : ("Source: Main answer selection" as const),
      sourcePreview: sourcePreview(thread, status),
      lastQuestion: compactText(lastQuestion, 104),
      lastAnswer: compactText(lastAnswer, 104),
      updatedAt: lastMessage?.createdAt ?? thread.updatedAt,
      status,
      statusLabel: statusMeta.label,
      statusClassName: statusMeta.className,
      uiLabel: thread.visibility === "hidden" ? "UI: hidden" : "UI: available",
      memoryLabel: memoryLabel(thread, status),
      messageCount: threadMessages.length,
      ...counts,
      versionLabel: versionLabel(thread)
    };
  });

  const itemById = new Map<string, ExplorerThreadItem>();

  for (const item of baseItems) {
    itemById.set(item.thread.id, {
      ...item,
      directMatch: false,
      children: []
    });
  }

  const roots: ExplorerThreadItem[] = [];

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
    if (!matchesFilter(item)) {
      continue;
    }

    item.directMatch = true;
    visibleIds.add(item.thread.id);

    let parentId = item.thread.parentThreadId;
    while (parentId) {
      visibleIds.add(parentId);
      parentId = itemById.get(parentId)?.thread.parentThreadId;
    }
  }

  return {
    projectId: dataset.projectId,
    projectName: dataset.projectName,
    projectUpdatedAt: dataset.projectUpdatedAt,
    mainAnswerWindow: buildMainAnswerWindow(),
    roots,
    visibleIds,
    total: threadValues.length,
    active: baseItems.filter((item) => item.status === "active").length,
    main: baseItems.filter((item) => item.kind === "main").length,
    followup: baseItems.filter((item) => item.kind === "followup").length,
    discarded: baseItems.filter((item) => item.status === "discarded").length,
    deleted: baseItems.filter((item) => item.status === "deleted").length,
    latestThreadAt: baseItems
      .map((item) => item.updatedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  };
}

function tagClass(active: boolean, tone: "blue" | "slate" | "orange" | "red" = "slate") {
  if (active) {
    return "border-atlasBlue bg-atlasBlue text-white";
  }

  if (tone === "blue") {
    return "border-blue-200 bg-blue-50 text-atlasBlue hover:bg-blue-100";
  }

  if (tone === "orange") {
    return "border-orange-200 bg-orange-50 text-atlasOrange hover:bg-orange-100";
  }

  if (tone === "red") {
    return "border-red-200 bg-red-50 text-atlasRed hover:bg-red-100";
  }

  return "border-line bg-white text-slate-600 hover:bg-slate-50";
}

type FolderRowProps = {
  id: string;
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: (id: string, defaultOpen?: boolean) => void;
  children: React.ReactNode;
};

function FolderRow({ id, title, count, isOpen, onToggle, children }: FolderRowProps) {
  return (
    <div className="space-y-2">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-bold text-ink hover:bg-slate-50"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {isOpen ? (
          <FolderOpen size={17} className="text-atlasBlue" />
        ) : (
          <Folder size={17} className="text-slate-500" />
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {typeof count === "number" && (
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-slate-600">
            {count}
          </span>
        )}
      </button>
      {isOpen && <div className="ml-5 border-l border-line pl-3">{children}</div>}
    </div>
  );
}

type ThreadNodeProps = {
  item: ExplorerThreadItem;
  visibleIds: Set<string>;
  selectedThreadId: string | null;
  currentProjectId: string;
  filter: ThreadExplorerFilter;
  expanded: Record<string, boolean>;
  onToggle: (id: string, defaultOpen?: boolean) => void;
  onFilter: (filter: ThreadExplorerFilter) => void;
  onOpen: (item: ExplorerThreadItem) => void;
};

type MainAnswerWindowNodeProps = {
  explorer: ProjectExplorer;
  visibleRoots: ExplorerThreadItem[];
  selectedThreadId: string | null;
  currentProjectId: string;
  filter: ThreadExplorerFilter;
  expanded: Record<string, boolean>;
  onToggle: (id: string, defaultOpen?: boolean) => void;
  onFilter: (filter: ThreadExplorerFilter) => void;
  onOpenThread: (item: ExplorerThreadItem) => void;
};

function MainAnswerWindowNode({
  explorer,
  visibleRoots,
  selectedThreadId,
  currentProjectId,
  filter,
  expanded,
  onToggle,
  onFilter,
  onOpenThread
}: MainAnswerWindowNodeProps) {
  const mainWindowId = `${explorer.projectId}:main-answer-window`;
  const conversationFolderId = `${explorer.projectId}:main-conversation`;
  const documentVersionsFolderId = `${explorer.projectId}:document-versions`;
  const mainThreadsFolderId = `${explorer.projectId}:main-answer-threads`;
  const mainWindowOpen = expanded[mainWindowId] ?? true;
  const conversationOpen = expanded[conversationFolderId] ?? true;
  const documentVersionsOpen = expanded[documentVersionsFolderId] ?? true;
  const mainThreadsOpen = expanded[mainThreadsFolderId] ?? true;
  const info = explorer.mainAnswerWindow;

  return (
    <FolderRow
      id={mainWindowId}
      title="Main Answer Window"
      count={info.messageCount + explorer.total}
      isOpen={mainWindowOpen}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-white p-3 text-xs leading-5 text-slate-600">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-atlasBlue">
              Main Answer Window
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {info.activeDocumentVersionLabel}
            </span>
          </div>
          <p className="text-sm font-bold text-ink">{info.title}</p>
          <p className="mt-1">
            <span className="font-bold text-slate-700">Document:</span>{" "}
            {info.documentTitle}
          </p>
          <p className="mt-1">
            <span className="font-bold text-slate-700">Updated:</span>{" "}
            {formatTime(info.updatedAt)}
          </p>
        </div>

        <FolderRow
          id={conversationFolderId}
          title="Main Conversation"
          count={info.messageCount}
          isOpen={conversationOpen}
          onToggle={onToggle}
        >
          <div className="space-y-2 rounded-lg border border-line bg-white p-3 text-xs leading-5 text-slate-600">
            <p className="font-bold text-ink">{info.conversationTitle}</p>
            <p>
              <span className="font-bold text-slate-700">Last user question:</span>{" "}
              {info.lastUserQuestion || "No user message recorded yet."}
            </p>
            <p>
              <span className="font-bold text-slate-700">Last assistant answer:</span>{" "}
              {info.lastAssistantAnswer || "No assistant answer recorded yet."}
            </p>
            <p className="text-muted">
              Main conversation memory is separate from local / follow-up thread
              memory unless a merge or explicit note promotes content.
            </p>
          </div>
        </FolderRow>

        <FolderRow
          id={documentVersionsFolderId}
          title="Document Versions"
          count={info.documentVersionCount}
          isOpen={documentVersionsOpen}
          onToggle={onToggle}
        >
          <div className="space-y-2 rounded-lg border border-line bg-white p-3 text-xs leading-5 text-slate-600">
            <p className="font-bold text-ink">{info.activeDocumentVersionLabel}</p>
            <p>{info.activeDocumentPreview}</p>
            <p className="text-muted">
              Main context uses the active DocumentVersion. Older versions remain
              traceable but are not the active document memory.
            </p>
          </div>
        </FolderRow>

        <FolderRow
          id={mainThreadsFolderId}
          title="Main Answer Threads"
          count={visibleRoots.length}
          isOpen={mainThreadsOpen}
          onToggle={onToggle}
        >
          {visibleRoots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              No matching Main Answer Threads for this search or tag filter.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRoots.map((item) => (
                <ThreadNode
                  key={item.thread.id}
                  item={item}
                  visibleIds={explorer.visibleIds}
                  selectedThreadId={selectedThreadId}
                  currentProjectId={currentProjectId}
                  filter={filter}
                  expanded={expanded}
                  onToggle={onToggle}
                  onFilter={onFilter}
                  onOpen={onOpenThread}
                />
              ))}
            </div>
          )}
        </FolderRow>
      </div>
    </FolderRow>
  );
}

function ThreadNode({
  item,
  visibleIds,
  selectedThreadId,
  currentProjectId,
  filter,
  expanded,
  onToggle,
  onFilter,
  onOpen
}: ThreadNodeProps) {
  const nodeId = `${item.projectId}:thread:${item.thread.id}`;
  const followupFolderId = `${item.projectId}:followups:${item.thread.id}`;
  const detailsOpen = expanded[nodeId] ?? item.thread.id === selectedThreadId;
  const followupsOpen = expanded[followupFolderId] ?? true;
  const visibleChildren = item.children.filter((child) =>
    visibleIds.has(child.thread.id)
  );
  const isSelected =
    item.projectId === currentProjectId && item.thread.id === selectedThreadId;
  const isPathOnly = !item.directMatch;
  const canOpen = item.status !== "deleted" && item.thread.status !== "deleted";

  function filterClick(nextFilter: ThreadExplorerFilter) {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onFilter(nextFilter);
    };
  }

  const statusFilter: ThreadExplorerFilter =
    item.status === "discarded"
      ? "discarded"
      : item.status === "deleted"
        ? "deleted"
        : item.status === "merged"
          ? "merged"
          : item.status === "branch_created"
            ? "branched"
            : item.status === "kept_as_note"
              ? "noted"
              : "active";

  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border ${
          isSelected
            ? "border-atlasBlue bg-blue-50"
            : isPathOnly
              ? "border-dashed border-slate-200 bg-slate-50/70"
              : "border-line bg-white"
        }`}
      >
        <button
          onClick={() => onToggle(nodeId, item.thread.id === selectedThreadId)}
          className="flex w-full items-start gap-2 px-3 py-3 text-left"
        >
          <span className="mt-0.5 text-slate-500">
            {detailsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="mt-0.5">
            {detailsOpen ? (
              <FolderOpen size={18} className="text-atlasBlue" />
            ) : (
              <Folder size={18} className="text-slate-500" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <button
                onClick={filterClick(item.kind === "main" ? "main" : "followup")}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tagClass(
                  filter === (item.kind === "main" ? "main" : "followup"),
                  "blue"
                )}`}
              >
                {item.kindLabel}
              </button>
              <button
                onClick={filterClick(statusFilter)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${item.statusClassName}`}
              >
                Status: {item.statusLabel}
              </button>
              {item.noteCount > 0 && (
                <button
                  onClick={filterClick("has_notes")}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tagClass(
                    filter === "has_notes"
                  )}`}
                >
                  Has Notes
                </button>
              )}
              {item.branchCount > 0 && (
                <button
                  onClick={filterClick("has_branches")}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tagClass(
                    filter === "has_branches"
                  )}`}
                >
                  Has Branch
                </button>
              )}
              {item.mergeCount > 0 && (
                <button
                  onClick={filterClick("has_merges")}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tagClass(
                    filter === "has_merges"
                  )}`}
                >
                  Has Merge
                </button>
              )}
              {item.comparisonCount > 0 && (
                <button
                  onClick={filterClick("has_comparisons")}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tagClass(
                    filter === "has_comparisons"
                  )}`}
                >
                  Has Comparison
                </button>
              )}
            </span>
            <span className="mt-2 block text-sm font-semibold leading-5 text-ink">
              {item.sourcePreview}
            </span>
            {isPathOnly && (
              <span className="mt-1 block text-xs font-medium text-muted">
                Parent path shown for orientation.
              </span>
            )}
          </span>
          <span
            onClick={(event) => event.stopPropagation()}
            className="flex shrink-0 items-center gap-2"
          >
            <button
              onClick={() => onOpen(item)}
              disabled={!canOpen}
              className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              title={canOpen ? "Open thread" : "Deleted threads cannot be opened"}
              aria-label={canOpen ? "Open thread" : "Deleted thread"}
            >
              <ExternalLink size={16} />
            </button>
          </span>
        </button>

        {detailsOpen && (
          <div className="space-y-3 border-t border-line px-3 py-3 text-xs leading-5 text-slate-600">
            <div className="grid grid-cols-2 gap-2 max-[900px]:grid-cols-1">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="font-bold text-slate-700">{item.sourceLabel}</p>
                <p>{item.versionLabel}</p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="font-bold text-slate-700">{item.memoryLabel}</p>
                <p>{item.uiLabel}</p>
              </div>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p>
                <span className="font-bold text-slate-700">Last question:</span>{" "}
                {item.lastQuestion || "No local question yet."}
              </p>
              <p>
                <span className="font-bold text-slate-700">Last answer:</span>{" "}
                {item.lastAnswer || "No local answer yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
                {item.messageCount} messages
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
                <StickyNote size={12} />
                Notes {item.noteCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
                <GitBranchPlus size={12} />
                Branches {item.branchCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
                <GitMerge size={12} />
                Merges {item.mergeCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
                <GitCompareArrows size={12} />
                Comparisons {item.comparisonCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {visibleChildren.length > 0 && (
        <FolderRow
          id={followupFolderId}
          title="Follow-up Threads"
          count={visibleChildren.length}
          isOpen={followupsOpen}
          onToggle={onToggle}
        >
          <div className="space-y-2">
            {visibleChildren.map((child) => (
              <ThreadNode
                key={child.thread.id}
                item={child}
                visibleIds={visibleIds}
                selectedThreadId={selectedThreadId}
                currentProjectId={currentProjectId}
                filter={filter}
                expanded={expanded}
                onToggle={onToggle}
                onFilter={onFilter}
                onOpen={onOpen}
              />
            ))}
          </div>
        </FolderRow>
      )}
    </div>
  );
}

export function ProjectThreadExplorerPanel() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ThreadExplorerFilter>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const projects = useAnswerAtlasStore((state) => state.projects);
  const currentProjectId = useAnswerAtlasStore((state) => state.currentProjectId);
  const mainWindowId = useAnswerAtlasStore((state) => state.mainWindowId);
  const currentDocumentId = useAnswerAtlasStore((state) => state.currentDocumentId);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const windows = useAnswerAtlasStore((state) => state.windows);
  const sessions = useAnswerAtlasStore((state) => state.sessions);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const documents = useAnswerAtlasStore((state) => state.documents);
  const mainConversations = useAnswerAtlasStore(
    (state) => state.mainConversations
  );
  const revisionMessages = useAnswerAtlasStore((state) => state.revisionMessages);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const messages = useAnswerAtlasStore((state) => state.messages);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const blocks = useAnswerAtlasStore((state) => state.blocks);
  const textSelections = useAnswerAtlasStore((state) => state.textSelections);
  const localThreads = useAnswerAtlasStore((state) => state.localThreads);
  const localSelections = useAnswerAtlasStore((state) => state.localSelections);
  const revisionAnnotations = useAnswerAtlasStore(
    (state) => state.revisionAnnotations
  );
  const revisionBranches = useAnswerAtlasStore((state) => state.revisionBranches);
  const mergeRecords = useAnswerAtlasStore((state) => state.mergeRecords);
  const comparisonGraphs = useAnswerAtlasStore((state) => state.comparisonGraphs);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
  const switchProject = useAnswerAtlasStore((state) => state.switchProject);
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const executeRevisionAction = useAnswerAtlasStore(
    (state) => state.executeRevisionAction
  );

  useEffect(() => {
    setSelectedProjectId((current) => current ?? currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    if (selectedProjectId && projects[selectedProjectId]) {
      return;
    }

    setSelectedProjectId(currentProjectId);
  }, [currentProjectId, projects, selectedProjectId]);

  const projectDatasets = useMemo(() => {
    return Object.values(projects)
      .map((project): ProjectThreadDataset => {
        if (project.id === currentProjectId) {
          return {
            projectId: project.id,
            projectName: project.name,
            projectUpdatedAt: project.updatedAt,
            isCurrent: true,
            mainWindowId,
            currentDocumentId,
            activeVersionNodeId,
            windows,
            sessions,
            conversationMessages,
            documents,
            mainConversations,
            revisionMessages,
            threads,
            messages,
            anchors,
            blocks,
            textSelections,
            localThreads,
            localSelections,
            revisionAnnotations,
            revisionBranches,
            mergeRecords,
            comparisonGraphs,
            documentVersions
          };
        }

        return {
          projectId: project.id,
          projectName: project.name,
          projectUpdatedAt: project.updatedAt,
          isCurrent: false,
          mainWindowId: project.snapshot.mainWindowId,
          currentDocumentId: project.snapshot.currentDocumentId,
          activeVersionNodeId: project.snapshot.activeVersionNodeId,
          windows: project.snapshot.windows,
          sessions: project.snapshot.sessions,
          conversationMessages: project.snapshot.conversationMessages,
          documents: project.snapshot.documents,
          mainConversations: project.snapshot.mainConversations,
          revisionMessages: project.snapshot.revisionMessages,
          threads: project.snapshot.threads,
          messages: project.snapshot.messages,
          anchors: project.snapshot.anchors,
          blocks: project.snapshot.blocks,
          textSelections: project.snapshot.textSelections,
          localThreads: project.snapshot.localThreads,
          localSelections: project.snapshot.localSelections,
          revisionAnnotations: project.snapshot.revisionAnnotations,
          revisionBranches: project.snapshot.revisionBranches,
          mergeRecords: project.snapshot.mergeRecords,
          comparisonGraphs: project.snapshot.comparisonGraphs,
          documentVersions: project.snapshot.documentVersions
        };
      })
      .sort((a, b) => {
        if (a.projectId === currentProjectId) {
          return -1;
        }

        if (b.projectId === currentProjectId) {
          return 1;
        }

        return (
          new Date(b.projectUpdatedAt).getTime() -
          new Date(a.projectUpdatedAt).getTime()
        );
      });
  }, [
    activeVersionNodeId,
    anchors,
    blocks,
    comparisonGraphs,
    conversationMessages,
    currentProjectId,
    currentDocumentId,
    documents,
    documentVersions,
    localSelections,
    localThreads,
    mainConversations,
    mainWindowId,
    mergeRecords,
    messages,
    projects,
    revisionMessages,
    revisionAnnotations,
    revisionBranches,
    sessions,
    textSelections,
    threads,
    windows
  ]);

  const explorers = useMemo(
    () =>
      projectDatasets.map((dataset) => buildExplorer(dataset, filter, query)),
    [filter, projectDatasets, query]
  );
  const selectedExplorer =
    explorers.find((project) => project.projectId === selectedProjectId) ??
    explorers.find((project) => project.projectId === currentProjectId) ??
    explorers[0];
  const visibleRoots =
    selectedExplorer?.roots.filter((item) =>
      selectedExplorer.visibleIds.has(item.thread.id)
    ) ?? [];

  function toggleExpanded(id: string, defaultOpen = true) {
    setExpanded((current) => ({
      ...current,
      [id]: !(current[id] ?? defaultOpen)
    }));
  }

  function openExplorerThread(item: ExplorerThreadItem) {
    function doOpen() {
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
          projectId: item.projectId,
          conversationId: item.thread.conversationSessionId,
          status: item.status
        }
      });

      if (result.status !== "blocked" && item.status !== "deleted") {
        openThread(item.thread.id);
        setExpanded((current) => ({
          ...current,
          [`${item.projectId}:thread:${item.thread.id}`]: true
        }));
      }
    }

    setSelectedProjectId(item.projectId);

    if (item.projectId !== currentProjectId) {
      switchProject(item.projectId);
      window.setTimeout(doOpen, 0);
      return;
    }

    doOpen();
  }

  return (
    <div className="grid max-h-[calc(100vh-145px)] min-h-[560px] grid-cols-[250px_minmax(0,1fr)] overflow-hidden max-[900px]:grid-cols-1">
      <aside className="border-r border-line bg-slate-50/70 p-3 max-[900px]:border-r-0 max-[900px]:border-b">
        <div className="mb-3 flex items-center gap-2 px-1">
          <MessagesSquare size={18} className="text-atlasBlue" />
          <div>
            <p className="text-sm font-bold text-ink">Projects</p>
            <p className="text-xs text-muted">Jump back to previous threads</p>
          </div>
        </div>
        <div className="thin-scrollbar max-h-[calc(100vh-235px)] space-y-2 overflow-auto pr-1">
          {explorers.map((project) => {
            const isSelected = project.projectId === selectedExplorer?.projectId;
            const isCurrent = project.projectId === currentProjectId;

            return (
              <button
                key={project.projectId}
                onClick={() => setSelectedProjectId(project.projectId)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  isSelected
                    ? "border-atlasBlue bg-white shadow-sm"
                    : "border-line bg-white/70 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold text-ink">
                    {project.projectName}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-atlasBlue">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-slate-600">
                  <span className="rounded bg-slate-50 py-1">
                    {project.total} total
                  </span>
                  <span className="rounded bg-blue-50 py-1">
                    {project.main} main
                  </span>
                  <span className="rounded bg-violet-50 py-1">
                    {project.followup} follow-up
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Latest: {formatTime(project.latestThreadAt ?? project.projectUpdatedAt)}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col overflow-hidden">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-muted">
                Project Thread Explorer
              </p>
              <h3 className="mt-1 text-base font-bold text-ink">
                {selectedExplorer?.projectName ?? "No project selected"}
              </h3>
            </div>
            {selectedExplorer && selectedExplorer.projectId !== currentProjectId && (
              <button
                onClick={() => switchProject(selectedExplorer.projectId)}
                className="rounded-md border border-line bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Switch to project
              </button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-xs max-[900px]:grid-cols-2">
            <div className="rounded-md border border-line bg-white px-2 py-2">
              <p className="font-bold text-ink">{selectedExplorer?.total ?? 0}</p>
              <p className="text-muted">Total</p>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-2">
              <p className="font-bold text-atlasBlue">
                {selectedExplorer?.main ?? 0}
              </p>
              <p className="text-muted">Main</p>
            </div>
            <div className="rounded-md border border-violet-100 bg-violet-50 px-2 py-2">
              <p className="font-bold text-violet-700">
                {selectedExplorer?.followup ?? 0}
              </p>
              <p className="text-muted">Follow-up</p>
            </div>
            <div className="rounded-md border border-orange-100 bg-orange-50 px-2 py-2">
              <p className="font-bold text-atlasOrange">
                {selectedExplorer?.discarded ?? 0}
              </p>
              <p className="text-muted">Discarded</p>
            </div>
            <div className="rounded-md border border-red-100 bg-red-50 px-2 py-2">
              <p className="font-bold text-atlasRed">
                {selectedExplorer?.deleted ?? 0}
              </p>
              <p className="text-muted">Deleted</p>
            </div>
          </div>

          <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-muted">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Search projects, source text, questions, answers..."
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${tagClass(
                  filter === item.id,
                  item.id === "discarded"
                    ? "orange"
                    : item.id === "deleted"
                      ? "red"
                      : item.id === "main" || item.id === "followup"
                        ? "blue"
                        : "slate"
                )}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4">
          {!selectedExplorer ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-atlasBlue shadow-sm">
                <MessagesSquare size={20} />
              </div>
              <p className="font-semibold text-ink">No project selected.</p>
            </div>
          ) : (
            <MainAnswerWindowNode
              explorer={selectedExplorer}
              visibleRoots={visibleRoots}
              selectedThreadId={selectedThreadId}
              currentProjectId={currentProjectId}
              filter={filter}
              expanded={expanded}
              onToggle={toggleExpanded}
              onFilter={setFilter}
              onOpenThread={openExplorerThread}
            />
          )}

          {selectedExplorer && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs leading-5 text-slate-600">
              <Circle size={10} className="mt-1 fill-slate-300 text-slate-300" />
              <p>
                Labels are filters. Opening a thread restores the local window only;
                it does not add that thread to main conversation memory.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
