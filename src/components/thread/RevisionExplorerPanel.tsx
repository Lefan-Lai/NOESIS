"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  PencilLine,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
  UserRound
} from "lucide-react";
import {
  type AnswerAtlasState,
  useAnswerAtlasStore
} from "@/store/useAnswerAtlasStore";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { DocumentVersionModel, RevisionObjectType } from "@/types/revision";

type ExplorerFilter =
  | "all"
  | "main"
  | "followup"
  | "has_notes"
  | "has_branches"
  | "has_merges"
  | "has_comparisons"
  | "active"
  | "discarded"
  | "deleted";

type ProjectDataset = Pick<
  AnswerAtlasState,
  | "mainWindowId"
  | "currentDocumentId"
  | "windows"
  | "conversationMessages"
  | "documents"
  | "mainConversations"
  | "revisionMessages"
  | "documentVersions"
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
  | "timelineNodes"
> & {
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
};

type ThreadKind = "main" | "followup";

type ExplorerThread = {
  projectId: string;
  projectName: string;
  thread: LocalThread;
  kind: ThreadKind;
  title: "Main Answer Thread" | "Follow-up Thread";
  sourcePreview: string;
  sourceLabel: string;
  status: string;
  statusLabel: string;
  memoryLabel: string;
  uiLabel: string;
  versionLabel: string;
  lastQuestion: string;
  lastAnswer: string;
  updatedAt: string;
  messageCount: number;
  noteCount: number;
  branchCount: number;
  mergeCount: number;
  comparisonCount: number;
  directMatch: boolean;
  children: ExplorerThread[];
};

type SelectionGroup = {
  id: string;
  title: string;
  sourcePreview: string;
  threads: ExplorerThread[];
  count: number;
};

type MainAnswerInfo = {
  windowTitle: string;
  documentTitle: string;
  conversationTitle: string;
  messageCount: number;
  documentVersionCount: number;
  lastUserQuestion: string;
  lastAssistantAnswer: string;
  activeVersion?: DocumentVersionModel;
  activeDocumentPreview: string;
  updatedAt: string;
};

type ProjectView = {
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  mainAnswer: MainAnswerInfo;
  versions: DocumentVersionModel[];
  activeDocumentVersionId?: string;
  timelineNodes: ProjectDataset["timelineNodes"];
  selectionGroups: SelectionGroup[];
  visibleThreadIds: Set<string>;
  stats: {
    totalThreads: number;
    mainThreads: number;
    followupThreads: number;
    activeThreads: number;
    discardedThreads: number;
    deletedThreads: number;
  };
  latestActivityAt: string;
};

type SelectedItem =
  | { type: "main_window"; projectId: string }
  | { type: "main_conversation"; projectId: string }
  | { type: "document_versions"; projectId: string }
  | { type: "document_version"; projectId: string; versionId: string }
  | { type: "main_threads"; projectId: string }
  | { type: "selection_group"; projectId: string; groupId: string }
  | { type: "thread"; projectId: string; threadId: string };

const FILTERS: Array<{ id: ExplorerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "main", label: "From Main Answer" },
  { id: "followup", label: "Follow-up Thread" },
  { id: "has_notes", label: "Has Notes" },
  { id: "has_branches", label: "Has Branch" },
  { id: "has_merges", label: "Has Merge" },
  { id: "has_comparisons", label: "Has Comparison" },
  { id: "active", label: "Active" },
  { id: "discarded", label: "Discarded" },
  { id: "deleted", label: "Deleted" }
];

function compactText(text: string | undefined, maxLength = 120) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function formatTime(value?: string) {
  if (!value) {
    return "No activity";
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

function selectedKey(item: SelectedItem | null) {
  if (!item) {
    return "";
  }

  if (item.type === "document_version") {
    return `${item.projectId}:${item.type}:${item.versionId}`;
  }

  if (item.type === "selection_group") {
    return `${item.projectId}:${item.type}:${item.groupId}`;
  }

  if (item.type === "thread") {
    return `${item.projectId}:${item.type}:${item.threadId}`;
  }

  return `${item.projectId}:${item.type}`;
}

function threadKind(thread: LocalThread): ThreadKind {
  return thread.revisionThreadType === "nested_local" ||
    Boolean(thread.parentThreadId || thread.sourceLocalSelectionId)
    ? "followup"
    : "main";
}

function statusLabel(thread: LocalThread, status: string) {
  if (thread.status === "deleted" || status === "deleted") {
    return "Deleted";
  }

  if (thread.status === "discarded" || status === "discarded") {
    return "Discarded";
  }

  if (thread.status === "merged") {
    return "Merged";
  }

  if (thread.status === "branch_created") {
    return "Branched";
  }

  if (thread.status === "kept_as_note") {
    return "Noted";
  }

  return "Active";
}

function statusPillClass(status: string) {
  if (status === "Deleted") {
    return "border-red-200 bg-red-50 text-atlasRed";
  }

  if (status === "Discarded") {
    return "border-orange-200 bg-orange-50 text-atlasOrange";
  }

  if (status === "Off active path") {
    return "border-orange-200 bg-orange-50 text-atlasOrange";
  }

  if (status === "Merged") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Branched") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-blue-200 bg-blue-50 text-atlasBlue";
}

function memoryLabel(thread: LocalThread, status: string) {
  if (thread.status === "deleted" || status === "deleted") {
    return "Never include in future context";
  }

  if (thread.status === "discarded" || status === "discarded") {
    return "Excluded by default";
  }

  if (thread.status === "merged") {
    return "Merged through DocumentVersion";
  }

  return "Local thread memory only";
}

function isActiveDocumentVersion(
  view: ProjectView,
  version: DocumentVersionModel
) {
  return view.activeDocumentVersionId
    ? version.id === view.activeDocumentVersionId
    : version.status === "active";
}

function versionPathStatus(
  view: ProjectView,
  version: DocumentVersionModel
) {
  if (isActiveDocumentVersion(view, version)) {
    return "active";
  }

  if (version.status === "deleted") {
    return "deleted";
  }

  if (version.status === "discarded") {
    return "discarded";
  }

  const nodeId = version.createdFromTimelineNodeId;
  const node = nodeId ? view.timelineNodes[nodeId] : undefined;

  if (node?.status === "inactive") {
    return "off_path";
  }

  return "previous";
}

function versionStatusLabel(view: ProjectView, version: DocumentVersionModel) {
  const status = versionPathStatus(view, version);

  if (status === "active") {
    return "Active";
  }

  if (status === "off_path") {
    return "Off active path";
  }

  if (status === "discarded") {
    return "Discarded";
  }

  if (status === "deleted") {
    return "Deleted";
  }

  return "Previous";
}

function versionBadgeClass(view: ProjectView, version: DocumentVersionModel) {
  const status = versionPathStatus(view, version);

  if (status === "active") {
    return "border-blue-200 bg-blue-50 text-atlasBlue";
  }

  if (status === "off_path") {
    return "border-orange-200 bg-orange-50 text-atlasOrange";
  }

  if (status === "discarded") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
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

function buildProjectView(
  dataset: ProjectDataset,
  filter: ExplorerFilter,
  query: string
): ProjectView {
  const normalizedQuery = query.trim().toLowerCase();
  const messagesByThread = new Map<string, ThreadMessage[]>();

  for (const message of Object.values(dataset.messages)) {
    if (message.contentState === "deleted") {
      continue;
    }

    const bucket = messagesByThread.get(message.threadId) ?? [];
    bucket.push(message);
    messagesByThread.set(message.threadId, bucket);
  }

  function threadMessages(threadId: string) {
    return [...(messagesByThread.get(threadId) ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  function workspaceStatus(thread: LocalThread) {
    const revisionThread = thread.revisionLocalThreadId
      ? dataset.localThreads[thread.revisionLocalThreadId]
      : undefined;

    return revisionThread?.status ?? thread.status;
  }

  function sourcePreview(thread: LocalThread, status: string) {
    if (thread.status === "deleted" || status === "deleted") {
      return "Deleted source text is redacted.";
    }

    if (thread.sourceLocalSelectionId) {
      return (
        compactText(
          dataset.localSelections[thread.sourceLocalSelectionId]?.selectedText
        ) || "Follow-up answer fragment"
      );
    }

    if (thread.sourceSelectionId) {
      return (
        compactText(dataset.textSelections[thread.sourceSelectionId]?.selectedText) ||
        "Main answer selection"
      );
    }

    const anchor = dataset.anchors[thread.anchorId];
    const block = anchor?.blockId ? dataset.blocks[anchor.blockId] : undefined;

    return (
      compactText(thread.selectedText ?? anchor?.selectedText ?? block?.text) ||
      "Main answer selection"
    );
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
    const version = versionId ? dataset.documentVersions[versionId] : undefined;

    if (version?.versionNumber) {
      return `v${version.versionNumber}`;
    }

    return versionId ? compactText(versionId, 18) : "unknown version";
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

  function matchesThread(item: Omit<ExplorerThread, "children" | "directMatch">) {
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
      item.title,
      item.thread.id,
      item.thread.revisionLocalThreadId,
      item.sourcePreview,
      item.lastQuestion,
      item.lastAnswer,
      item.statusLabel,
      item.memoryLabel
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  }

  const baseThreads = Object.values(dataset.threads)
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .map((thread) => {
      const status = workspaceStatus(thread);
      const kind = threadKind(thread);
      const messages = threadMessages(thread.id);
      const lastQuestion =
        [...messages].reverse().find((message) => message.role === "user")
          ?.content ?? "";
      const lastAnswer =
        [...messages].reverse().find((message) => message.role === "assistant")
          ?.content ?? "";
      const counts = countsFor(thread);

      return {
        projectId: dataset.projectId,
        projectName: dataset.projectName,
        thread,
        kind,
        title:
          kind === "followup"
            ? ("Follow-up Thread" as const)
            : ("Main Answer Thread" as const),
        sourcePreview: sourcePreview(thread, status),
        sourceLabel:
          kind === "followup"
            ? "Follow-up answer fragment"
            : "Main answer selection",
        status,
        statusLabel: statusLabel(thread, status),
        memoryLabel: memoryLabel(thread, status),
        uiLabel: thread.visibility === "hidden" ? "Hidden from workspace" : "Available",
        versionLabel: versionLabel(thread),
        lastQuestion: compactText(lastQuestion, 110),
        lastAnswer: compactText(lastAnswer, 110),
        updatedAt: messages[messages.length - 1]?.createdAt ?? thread.updatedAt,
        messageCount: messages.length,
        ...counts
      };
    });
  const threadById = new Map<string, ExplorerThread>();

  for (const item of baseThreads) {
    threadById.set(item.thread.id, {
      ...item,
      directMatch: false,
      children: []
    });
  }

  const roots: ExplorerThread[] = [];

  for (const item of threadById.values()) {
    const parent = item.thread.parentThreadId
      ? threadById.get(item.thread.parentThreadId)
      : undefined;

    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  const visibleThreadIds = new Set<string>();

  for (const item of threadById.values()) {
    if (!matchesThread(item)) {
      continue;
    }

    item.directMatch = true;
    visibleThreadIds.add(item.thread.id);

    let parentId = item.thread.parentThreadId;
    while (parentId) {
      visibleThreadIds.add(parentId);
      parentId = threadById.get(parentId)?.thread.parentThreadId;
    }
  }

  const groups = new Map<string, SelectionGroup>();

  for (const root of roots) {
    if (!visibleThreadIds.has(root.thread.id)) {
      continue;
    }

    const groupId = root.thread.sourceSelectionId ?? root.thread.anchorId ?? root.thread.id;
    const existing = groups.get(groupId);

    if (existing) {
      existing.threads.push(root);
      existing.count += 1;
      continue;
    }

    groups.set(groupId, {
      id: groupId,
      title: "Selection",
      sourcePreview: root.sourcePreview,
      threads: [root],
      count: 1
    });
  }

  const mainWindow = dataset.windows[dataset.mainWindowId];
  const mainSessionId = mainWindow?.conversationSessionId;
  const uiMainMessages = Object.values(dataset.conversationMessages)
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
    uiMainMessages.length > 0
      ? uiMainMessages
      : persistentMainMessages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt
        }));
  const versions = Object.values(dataset.documentVersions)
    .filter(
      (version) =>
        version.projectId === dataset.projectId && version.status !== "deleted"
    )
    .sort((a, b) => {
      const numberDiff = (b.versionNumber ?? 0) - (a.versionNumber ?? 0);

      if (numberDiff !== 0) {
        return numberDiff;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const currentDocument = dataset.currentDocumentId
    ? dataset.documents[dataset.currentDocumentId]
    : undefined;
  const mainConversation =
    (mainSessionId &&
    dataset.mainConversations[mainSessionId]?.projectId === dataset.projectId &&
    dataset.mainConversations[mainSessionId]?.status !== "deleted"
      ? dataset.mainConversations[mainSessionId]
      : undefined) ??
    Object.values(dataset.mainConversations)
      .filter(
        (conversation) =>
          conversation.projectId === dataset.projectId &&
          conversation.status !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
  const activeDocumentVersionId =
    mainConversation?.activeDocumentVersionId ??
    versions.find((version) => version.status === "active")?.id;
  const activeVersion =
    versions.find((version) => version.id === activeDocumentVersionId) ??
    versions.find((version) => version.status === "active") ??
    versions[0];
  const lastUserQuestion =
    [...mainMessages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const lastAssistantAnswer =
    [...mainMessages].reverse().find((message) => message.role === "assistant")
      ?.content ?? "";
  const lastMainMessage = mainMessages[mainMessages.length - 1];
  const mainAnswer: MainAnswerInfo = {
    windowTitle: mainWindow?.title ?? "Main Answer Window",
    documentTitle:
      activeVersion?.title ??
      currentDocument?.title ??
      (dataset.currentDocumentId ? compactText(dataset.currentDocumentId, 28) : "") ??
      "No document generated yet",
    conversationTitle: mainConversation?.title ?? "Main Conversation",
    messageCount: mainMessages.length,
    documentVersionCount: versions.length,
    lastUserQuestion: compactText(lastUserQuestion, 140),
    lastAssistantAnswer: compactText(lastAssistantAnswer, 140),
    activeVersion,
    activeDocumentPreview: compactText(
      activeVersion?.content ?? currentDocument?.rawText,
      180
    ),
    updatedAt:
      lastMainMessage?.createdAt ??
      activeVersion?.createdAt ??
      mainWindow?.updatedAt ??
      dataset.projectUpdatedAt
  };
  const latestThreadAt = baseThreads
    .map((item) => item.updatedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return {
    projectId: dataset.projectId,
    projectName: dataset.projectName,
    projectUpdatedAt: dataset.projectUpdatedAt,
    mainAnswer,
    versions,
    activeDocumentVersionId,
    timelineNodes: dataset.timelineNodes,
    selectionGroups: [...groups.values()],
    visibleThreadIds,
    stats: {
      totalThreads: baseThreads.length,
      mainThreads: baseThreads.filter((item) => item.kind === "main").length,
      followupThreads: baseThreads.filter((item) => item.kind === "followup").length,
      activeThreads: baseThreads.filter((item) => item.status === "active").length,
      discardedThreads: baseThreads.filter((item) => item.status === "discarded")
        .length,
      deletedThreads: baseThreads.filter((item) => item.status === "deleted").length
    },
    latestActivityAt: latestThreadAt ?? mainAnswer.updatedAt ?? dataset.projectUpdatedAt
  };
}

function tagClass(active: boolean) {
  return active
    ? "border-atlasBlue bg-atlasBlue text-white"
    : "border-line bg-white text-slate-600 hover:bg-slate-50";
}

function outlineIndent(depth: number) {
  return { paddingLeft: `${depth * 14 + 8}px` };
}

type OutlineRowProps = {
  title: string;
  meta?: string;
  badge?: string;
  depth?: number;
  isSelected: boolean;
  isOpen?: boolean;
  hasChildren?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
};

function OutlineRow({
  title,
  meta,
  badge,
  depth = 0,
  isSelected,
  isOpen,
  hasChildren,
  onToggle,
  onSelect
}: OutlineRowProps) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition ${
        isSelected ? "bg-blue-50 text-atlasBlue" : "text-slate-700 hover:bg-slate-50"
      }`}
      style={outlineIndent(depth)}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggle?.();
        }}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 ${
          hasChildren ? "hover:bg-white" : "opacity-0"
        }`}
        disabled={!hasChildren}
        aria-label={isOpen ? "Collapse" : "Expand"}
      >
        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{title}</span>
        {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
      </button>
      {badge && (
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusPillClass(
            badge
          )}`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function findThread(view: ProjectView, threadId: string): ExplorerThread | undefined {
  const stack = view.selectionGroups.flatMap((group) => group.threads);

  while (stack.length > 0) {
    const item = stack.shift();

    if (!item) {
      continue;
    }

    if (item.thread.id === threadId) {
      return item;
    }

    stack.push(...item.children);
  }

  return undefined;
}

function findSelectedItem(
  views: ProjectView[],
  selected: SelectedItem | null
) {
  if (!selected) {
    return undefined;
  }

  const view = views.find((project) => project.projectId === selected.projectId);

  if (!view) {
    return undefined;
  }

  if (selected.type === "document_version") {
    return {
      view,
      version: view.versions.find((version) => version.id === selected.versionId)
    };
  }

  if (selected.type === "selection_group") {
    return {
      view,
      group: view.selectionGroups.find((group) => group.id === selected.groupId)
    };
  }

  if (selected.type === "thread") {
    return {
      view,
      thread: findThread(view, selected.threadId)
    };
  }

  return { view };
}

type DetailPanelProps = {
  views: ProjectView[];
  selected: SelectedItem | null;
  currentProjectId: string;
  onSelect: (item: SelectedItem) => void;
  onOpenThread: (item: ExplorerThread) => void;
  onDiscardThread: (item: ExplorerThread) => void;
  onDeleteThread: (item: ExplorerThread) => void;
  onRevertVersion: (projectId: string, version: DocumentVersionModel) => void;
};

function DetailPanel({
  views,
  selected,
  currentProjectId,
  onSelect,
  onOpenThread,
  onDiscardThread,
  onDeleteThread,
  onRevertVersion
}: DetailPanelProps) {
  const selectedData = findSelectedItem(views, selected);
  const view = selectedData?.view;

  if (!view || !selected) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm text-slate-600">
        Select an item in the outline to inspect details.
      </div>
    );
  }

  if (selected.type === "main_window") {
    return (
      <div className="space-y-3">
        <Header title="Main Answer Window" subtitle={view.projectName} />
        <InfoBlock
          rows={[
            ["Window", view.mainAnswer.windowTitle],
            ["Document", view.mainAnswer.documentTitle],
            [
              "Active version",
              view.mainAnswer.activeVersion?.versionNumber
                ? `v${view.mainAnswer.activeVersion.versionNumber}`
                : "none"
            ],
            ["Updated", formatTime(view.mainAnswer.updatedAt)]
          ]}
        />
        <SummaryText title="Active document preview" text={view.mainAnswer.activeDocumentPreview || "No document content yet."} />
      </div>
    );
  }

  if (selected.type === "main_conversation") {
    return (
      <div className="space-y-3">
        <Header title="Main Conversation" subtitle={view.mainAnswer.conversationTitle} />
        <InfoBlock
          rows={[
            ["Messages", String(view.mainAnswer.messageCount)],
            ["Memory", "Main conversation context"],
            ["Project", view.projectName]
          ]}
        />
        <SummaryText title="Last user question" text={view.mainAnswer.lastUserQuestion || "No user message recorded."} />
        <SummaryText title="Last assistant answer" text={view.mainAnswer.lastAssistantAnswer || "No assistant answer recorded."} />
      </div>
    );
  }

  if (selected.type === "document_versions") {
    return (
      <div className="space-y-3">
        <Header title="Document Versions" subtitle={`${view.versions.length} versions`} />
        <div className="space-y-2">
          {view.versions.length === 0 && (
            <p className="rounded-lg border border-dashed border-line bg-slate-50 p-3 text-sm text-slate-600">
              No document version has been created yet.
            </p>
          )}
          {view.versions.map((version) => (
            <button
              key={version.id}
              onClick={() =>
                onSelect({
                  type: "document_version",
                  projectId: view.projectId,
                  versionId: version.id
                })
              }
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 text-left hover:bg-slate-50"
            >
              <span>
                <span className="block text-sm font-bold text-ink">
                  {version.versionNumber ? `v${version.versionNumber}` : version.id}
                </span>
                <span className="text-xs text-muted">
                  {version.sourceType ?? "unknown source"} · {formatTime(version.createdAt)}
                </span>
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                  versionBadgeClass(view, version)
                }`}
              >
                {versionStatusLabel(view, version)}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (selected.type === "document_version") {
    const version = selectedData.version;

    if (!version) {
      return <MissingDetail />;
    }

    const isActiveVersion = isActiveDocumentVersion(view, version);
    const canRevert =
      !isActiveVersion &&
      version.status !== "deleted" &&
      Boolean(version.createdFromTimelineNodeId);

    return (
      <div className="space-y-3">
        <Header
          title={version.versionNumber ? `Document v${version.versionNumber}` : "Document Version"}
          subtitle={
            isActiveVersion
              ? "Active version"
              : versionPathStatus(view, version) === "off_path"
                ? "Off active path"
                : "Previous version"
          }
        />
        <InfoBlock
          rows={[
            ["Status", versionStatusLabel(view, version)],
            ["Stored status", version.status],
            ["Source", version.sourceType ?? "unknown"],
            ["Created", formatTime(version.createdAt)],
            ["Project", view.projectName]
          ]}
        />
        <SummaryText title="Version preview" text={compactText(version.content, 520) || "No content saved for this version."} />
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"
            disabled
          >
            Previewing Version
          </button>
          <button
            onClick={() => onRevertVersion(view.projectId, version)}
            disabled={!canRevert}
            className="inline-flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-atlasOrange hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-45"
            title={
              canRevert
                ? "Return active path to this version"
                : "This version is already active or has no return logic point"
            }
          >
            <RotateCcw size={14} />
            Return to This Version
          </button>
        </div>
        {view.projectId !== currentProjectId && (
          <p className="text-xs leading-5 text-muted">
            Reverting will first switch to this project, then use the version's
            return logic point.
          </p>
        )}
      </div>
    );
  }

  if (selected.type === "main_threads") {
    return (
      <div className="space-y-3">
        <Header title="Local Revision Threads" subtitle={`${view.stats.totalThreads} threads created from selected text`} />
        <InfoBlock
          rows={[
            ["From Main Answer", String(view.stats.mainThreads)],
            ["Follow-up Threads", String(view.stats.followupThreads)],
            ["Discarded", String(view.stats.discardedThreads)],
            ["Deleted", String(view.stats.deletedThreads)]
          ]}
        />
        <p className="rounded-lg border border-line bg-white p-3 text-sm leading-6 text-slate-600">
          These are local revision threads created from selected text in the
          main answer or follow-up answers. They are grouped by source
          selection.
        </p>
      </div>
    );
  }

  if (selected.type === "selection_group") {
    const group = selectedData.group;

    if (!group) {
      return <MissingDetail />;
    }

    return (
      <div className="space-y-3">
        <Header title="Source Selection" subtitle={`${group.count} thread groups`} />
        <SummaryText title="Selected text" text={group.sourcePreview} />
        <div className="space-y-2">
          {group.threads.map((thread) => (
            <button
              key={thread.thread.id}
              onClick={() =>
                onSelect({
                  type: "thread",
                  projectId: view.projectId,
                  threadId: thread.thread.id
                })
              }
              className="w-full rounded-lg border border-line bg-white p-3 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-bold text-ink">{thread.title}</span>
              <span className="ml-2 text-xs text-muted">{thread.statusLabel}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (selected.type === "thread") {
    const thread = selectedData.thread;

    if (!thread) {
      return <MissingDetail />;
    }

    return (
      <div className="space-y-3">
        <Header title={thread.title} subtitle={thread.sourceLabel} />
        <InfoBlock
          rows={[
            ["Status", thread.statusLabel],
            ["Memory", thread.memoryLabel],
            ["UI", thread.uiLabel],
            ["Source version", thread.versionLabel],
            ["Updated", formatTime(thread.updatedAt)]
          ]}
        />
        <SummaryText title="Source text" text={thread.sourcePreview} />
        <ConversationSnippet
          role="question"
          title="Latest Question"
          text={thread.lastQuestion}
        />
        <ConversationSnippet
          role="answer"
          title="Latest Answer"
          text={thread.lastAnswer}
        />
        <InfoBlock
          rows={[
            ["Messages", String(thread.messageCount)],
            ["Notes", String(thread.noteCount)],
            ["Branches", String(thread.branchCount)],
            ["Merges", String(thread.mergeCount)],
            ["Comparisons", String(thread.comparisonCount)]
          ]}
        />
        <button
          onClick={() => onOpenThread(thread)}
          disabled={thread.status === "deleted"}
          className="inline-flex items-center gap-2 rounded-md bg-atlasBlue px-3 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ExternalLink size={15} />
          Open Thread
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDiscardThread(thread)}
            disabled={thread.status === "discarded" || thread.status === "deleted"}
            className="inline-flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-atlasOrange disabled:cursor-not-allowed disabled:opacity-45"
            title="Keep the thread in history but exclude it from normal context"
          >
            <XCircle size={15} />
            Discard Thread
          </button>
          <button
            type="button"
            onClick={() => onDeleteThread(thread)}
            disabled={thread.status === "deleted"}
            className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-atlasRed disabled:cursor-not-allowed disabled:opacity-45"
            title="Delete this thread content from future context"
          >
            <Trash2 size={15} />
            Delete Thread
          </button>
        </div>
      </div>
    );
  }

  return <MissingDetail />;
}

function MissingDetail() {
  return (
    <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm text-slate-600">
      This item is no longer available in the current project snapshot.
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {subtitle && <p className="mt-1 text-xs font-medium text-muted">{subtitle}</p>}
    </div>
  );
}

function InfoBlock({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs max-[900px]:grid-cols-1">
      {rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="rounded-md bg-slate-50 px-3 py-2">
          <p className="font-bold text-slate-700">{label}</p>
          <p className="mt-0.5 break-words text-slate-600">{value}</p>
        </div>
      ))}
    </div>
  );
}

function SummaryText({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm leading-6 text-slate-700">
      <p className="mb-1 text-xs font-bold uppercase tracking-normal text-muted">
        {title}
      </p>
      <p>{text || "No content recorded."}</p>
    </div>
  );
}

function ConversationSnippet({
  title,
  text,
  role
}: {
  title: string;
  text: string;
  role: "question" | "answer";
}) {
  const isQuestion = role === "question";
  const Icon = isQuestion ? UserRound : Bot;

  return (
    <div
      className={`rounded-lg border p-3 text-sm leading-6 shadow-sm ${
        isQuestion
          ? "border-blue-200 bg-blue-50/70 text-slate-800"
          : "border-violet-200 bg-violet-50/60 text-slate-800"
      }`}
    >
      <div
        className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-normal ${
          isQuestion ? "text-atlasBlue" : "text-atlasPurple"
        }`}
      >
        <Icon size={15} />
        {title}
      </div>
      <p className="whitespace-pre-wrap break-words">
        {text || (isQuestion ? "No local question yet." : "No assistant answer yet.")}
      </p>
    </div>
  );
}

type ThreadRowsProps = {
  thread: ExplorerThread;
  view: ProjectView;
  depth: number;
  expanded: Record<string, boolean>;
  selected: SelectedItem | null;
  onToggle: (id: string, defaultOpen?: boolean) => void;
  onSelect: (item: SelectedItem) => void;
};

function ThreadRows({
  thread,
  view,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect
}: ThreadRowsProps) {
  const rowKey = `${view.projectId}:thread:${thread.thread.id}`;
  const isOpen = expanded[rowKey] ?? true;
  const visibleChildren = thread.children.filter((child) =>
    view.visibleThreadIds.has(child.thread.id)
  );

  return (
    <>
      <OutlineRow
        title={thread.title}
        meta={`${thread.sourcePreview} · ${formatTime(thread.updatedAt)}`}
        badge={thread.statusLabel}
        depth={depth}
        isSelected={
          selectedKey(selected) ===
          selectedKey({
            type: "thread",
            projectId: view.projectId,
            threadId: thread.thread.id
          })
        }
        isOpen={isOpen}
        hasChildren={visibleChildren.length > 0}
        onToggle={() => onToggle(rowKey)}
        onSelect={() =>
          onSelect({
            type: "thread",
            projectId: view.projectId,
            threadId: thread.thread.id
          })
        }
      />
      {isOpen &&
        visibleChildren.map((child) => (
          <ThreadRows
            key={child.thread.id}
            thread={child}
            view={view}
            depth={depth + 1}
            expanded={expanded}
            selected={selected}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function RevisionExplorerPanel() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExplorerFilter>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState("");
  const projects = useAnswerAtlasStore((state) => state.projects);
  const currentProjectId = useAnswerAtlasStore((state) => state.currentProjectId);
  const mainWindowId = useAnswerAtlasStore((state) => state.mainWindowId);
  const currentDocumentId = useAnswerAtlasStore((state) => state.currentDocumentId);
  const windows = useAnswerAtlasStore((state) => state.windows);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const documents = useAnswerAtlasStore((state) => state.documents);
  const mainConversations = useAnswerAtlasStore(
    (state) => state.mainConversations
  );
  const revisionMessages = useAnswerAtlasStore((state) => state.revisionMessages);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
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
  const timelineNodes = useAnswerAtlasStore((state) => state.timelineNodes);
  const switchProject = useAnswerAtlasStore((state) => state.switchProject);
  const renameProject = useAnswerAtlasStore((state) => state.renameProject);
  const deleteProject = useAnswerAtlasStore((state) => state.deleteProject);
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const returnToDocumentVersion = useAnswerAtlasStore(
    (state) => state.returnToDocumentVersion
  );
  const discardThread = useAnswerAtlasStore((state) => state.discardThread);
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const executeRevisionAction = useAnswerAtlasStore(
    (state) => state.executeRevisionAction
  );

  useEffect(() => {
    setSelectedProjectId((current) => current ?? currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !projects[selectedProjectId]) {
      setSelectedProjectId(currentProjectId);
      setSelected((current) =>
        current?.projectId === currentProjectId
          ? current
          : {
              type: "main_window",
              projectId: currentProjectId
            }
      );
      return;
    }

    setSelected((current) =>
      current?.projectId === selectedProjectId
        ? current
        : {
            type: "main_window",
            projectId: selectedProjectId
          }
    );
  }, [currentProjectId, projects, selectedProjectId]);

  const datasets = useMemo(() => {
    return Object.values(projects)
      .map((project): ProjectDataset => {
        if (project.id === currentProjectId) {
          return {
            projectId: project.id,
            projectName: project.name,
            projectUpdatedAt: project.updatedAt,
            mainWindowId,
            currentDocumentId,
            windows,
            conversationMessages,
            documents,
            mainConversations,
            revisionMessages,
            documentVersions,
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
            timelineNodes
          };
        }

        return {
          projectId: project.id,
          projectName: project.name,
          projectUpdatedAt: project.updatedAt,
          mainWindowId: project.snapshot.mainWindowId,
          currentDocumentId: project.snapshot.currentDocumentId,
          windows: project.snapshot.windows,
          conversationMessages: project.snapshot.conversationMessages,
          documents: project.snapshot.documents,
          mainConversations: project.snapshot.mainConversations,
          revisionMessages: project.snapshot.revisionMessages,
          documentVersions: project.snapshot.documentVersions,
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
          timelineNodes: project.snapshot.timelineNodes
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
    anchors,
    blocks,
    comparisonGraphs,
    conversationMessages,
    currentDocumentId,
    currentProjectId,
    documents,
    documentVersions,
    localSelections,
    localThreads,
    mainConversations,
    mainWindowId,
    mergeRecords,
    messages,
    projects,
    revisionAnnotations,
    revisionBranches,
    revisionMessages,
    textSelections,
    threads,
    timelineNodes,
    windows
  ]);

  const views = useMemo(
    () => datasets.map((dataset) => buildProjectView(dataset, filter, query)),
    [datasets, filter, query]
  );
  const selectedProject =
    views.find((view) => view.projectId === selectedProjectId) ??
    views.find((view) => view.projectId === currentProjectId) ??
    views[0];

  function toggleExpanded(id: string, defaultOpen = true) {
    setExpanded((current) => ({
      ...current,
      [id]: !(current[id] ?? defaultOpen)
    }));
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelected({
      type: "main_window",
      projectId
    });
  }

  function beginProjectRename(projectId: string, currentName: string) {
    setSelectedProjectId(projectId);
    setRenamingProjectId(projectId);
    setRenamingProjectName(currentName);
  }

  function cancelProjectRename() {
    setRenamingProjectId(null);
    setRenamingProjectName("");
  }

  function commitProjectRename(projectId: string, currentName: string) {
    const nextName = renamingProjectName.trim();

    if (!nextName) {
      return;
    }

    if (nextName === currentName.trim()) {
      cancelProjectRename();
      return;
    }

    renameProject(projectId, nextName);
    setSelectedProjectId(projectId);
    setSelected((current) =>
      current?.projectId === projectId
        ? current
        : {
            type: "main_window",
            projectId
          }
    );
    cancelProjectRename();
  }

  function deleteProjectFromNavigator(projectId: string, projectName: string) {
    if (views.length <= 1) {
      window.alert("You need at least one project. Create another project before deleting this one.");
      return;
    }

    const fallbackProjectId =
      views.find((view) => view.projectId !== projectId)?.projectId ?? null;
    const confirmed = window.confirm(
      `Delete project "${projectName}"?\n\nScope: this removes the project card, its saved project snapshot, and the currently loaded workspace data if this is the active project. This does not delete files from disk.\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const wasDeleted = deleteProject(projectId);

    if (wasDeleted) {
      setSelectedProjectId(fallbackProjectId);
      setSelected(
        fallbackProjectId
          ? {
              type: "main_window",
              projectId: fallbackProjectId
            }
          : null
      );
    }
  }

  function openExplorerThread(thread: ExplorerThread) {
    function doOpen() {
      const targetObjectId =
        thread.thread.revisionLocalThreadId ??
        thread.thread.sourceLocalSelectionId ??
        thread.thread.sourceSelectionId ??
        thread.thread.id;
      const targetObjectType: RevisionObjectType =
        thread.thread.revisionLocalThreadId
          ? "local_thread"
          : thread.thread.sourceLocalSelectionId
            ? "local_selection"
            : "text_selection";
      const result = executeRevisionAction("related_thread.open", {
        target: {
          objectType: targetObjectType,
          objectId: targetObjectId,
          projectId: thread.projectId,
          conversationId: thread.thread.conversationSessionId,
          status: thread.status
        }
      });

      if (result.status !== "blocked" && thread.status !== "deleted") {
        openThread(thread.thread.id);
        setSelected({
          type: "thread",
          projectId: thread.projectId,
          threadId: thread.thread.id
        });
      }
    }

    setSelectedProjectId(thread.projectId);

    if (thread.projectId !== currentProjectId) {
      switchProject(thread.projectId);
      window.setTimeout(doOpen, 0);
      return;
    }

    doOpen();
  }

  function discardExplorerThread(thread: ExplorerThread) {
    const confirmed = window.confirm(
      "Discard this thread?\n\nScope: the thread stays in history, but it is excluded from normal future LLM context by default."
    );

    if (!confirmed) {
      return;
    }

    function doDiscard() {
      discardThread(thread.thread.id);
      setSelected({
        type: "thread",
        projectId: thread.projectId,
        threadId: thread.thread.id
      });
    }

    setSelectedProjectId(thread.projectId);

    if (thread.projectId !== currentProjectId) {
      switchProject(thread.projectId);
      window.setTimeout(doDiscard, 0);
      return;
    }

    doDiscard();
  }

  function deleteExplorerThread(thread: ExplorerThread) {
    const confirmed = window.confirm(
      "Delete this thread?\n\nScope: the thread's local answer/messages are redacted or marked deleted and will never be included in future LLM context. Timeline history remains."
    );

    if (!confirmed) {
      return;
    }

    function doDelete() {
      deleteAnswer(thread.thread.id);
      setSelected({
        type: "thread",
        projectId: thread.projectId,
        threadId: thread.thread.id
      });
    }

    setSelectedProjectId(thread.projectId);

    if (thread.projectId !== currentProjectId) {
      switchProject(thread.projectId);
      window.setTimeout(doDelete, 0);
      return;
    }

    doDelete();
  }

  function revertVersion(projectId: string, version: DocumentVersionModel) {
    if (!version.createdFromTimelineNodeId) {
      return;
    }

    if (!window.confirm("Revert the active path to this document version?")) {
      return;
    }

    function doRevert() {
      returnToDocumentVersion(version.id);
    }

    if (projectId !== currentProjectId) {
      switchProject(projectId);
      window.setTimeout(doRevert, 0);
      return;
    }

    doRevert();
  }

  const mainWindowKey = selectedProject
    ? `${selectedProject.projectId}:main-window`
    : "main-window";
  const mainWindowOpen = expanded[mainWindowKey] ?? true;
  const conversationKey = selectedProject
    ? `${selectedProject.projectId}:conversation`
    : "conversation";
  const conversationOpen = expanded[conversationKey] ?? true;
  const versionsKey = selectedProject
    ? `${selectedProject.projectId}:versions`
    : "versions";
  const versionsOpen = expanded[versionsKey] ?? true;
  const threadsKey = selectedProject ? `${selectedProject.projectId}:threads` : "threads";
  const threadsOpen = expanded[threadsKey] ?? true;
  const selectedItem = selected;

  return (
    <div className="grid max-h-[calc(100vh-145px)] min-h-[590px] grid-cols-[220px_340px_minmax(0,1fr)] overflow-hidden max-[1180px]:grid-cols-[210px_minmax(0,1fr)] max-[900px]:grid-cols-1">
      <aside className="border-r border-line bg-slate-50/70 p-3 max-[900px]:border-r-0 max-[900px]:border-b">
        <div className="mb-3 px-1">
          <p className="text-sm font-bold text-ink">Projects</p>
          <p className="text-xs text-muted">Jump back to previous work</p>
        </div>
        <div className="thin-scrollbar max-h-[calc(100vh-235px)] space-y-2 overflow-auto pr-1">
          {views.map((view) => {
            const isSelected = view.projectId === selectedProject?.projectId;
            const isCurrent = view.projectId === currentProjectId;
            const isRenaming = renamingProjectId === view.projectId;
            const renameValue = isRenaming
              ? renamingProjectName.trim()
              : view.projectName;

            return (
              <div
                key={view.projectId}
                className={`rounded-lg border p-3 transition ${
                  isSelected
                    ? "border-atlasBlue bg-white shadow-sm"
                    : "border-line bg-white/70 hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectProject(view.projectId)}
                  className="w-full text-left"
                >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold text-ink">
                    {view.projectName}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-atlasBlue">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {view.stats.totalThreads} threads · {view.versions.length} versions
                </p>
                <p className="mt-1 text-xs text-muted">
                  Latest: {formatTime(view.latestActivityAt)}
                </p>
                </button>
                {isRenaming ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={renamingProjectName}
                      autoFocus
                      onChange={(event) =>
                        setRenamingProjectName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitProjectRename(view.projectId, view.projectName);
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelProjectRename();
                        }
                      }}
                      className="h-8 w-full rounded-md border border-atlasBlue bg-white px-2 text-xs font-semibold text-ink outline-none ring-2 ring-blue-100"
                      aria-label="Project name"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          commitProjectRename(view.projectId, view.projectName)
                        }
                        disabled={!renameValue}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 text-[11px] font-bold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-45"
                        title="Save project name"
                      >
                        <Check size={12} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelProjectRename}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        title="Cancel rename"
                      >
                        <XCircle size={12} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        beginProjectRename(view.projectId, view.projectName)
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      title="Rename project"
                    >
                      <PencilLine size={12} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteProjectFromNavigator(view.projectId, view.projectName)
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[11px] font-bold text-atlasRed hover:bg-red-100"
                      title="Delete project"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col border-r border-line max-[1180px]:border-r-0">
        <div className="space-y-3 border-b border-line p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-muted">
              Revision Outline
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-ink">
              {selectedProject?.projectName ?? "No project selected"}
            </h3>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-muted">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Search threads..."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${tagClass(
                  filter === item.id
                )}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-3">
          {selectedProject ? (
            <>
              <OutlineRow
                title="Main Answer Window"
                meta={`${selectedProject.mainAnswer.documentTitle} · ${formatTime(
                  selectedProject.mainAnswer.updatedAt
                )}`}
                depth={0}
                isSelected={
                  selectedKey(selectedItem) ===
                  selectedKey({
                    type: "main_window",
                    projectId: selectedProject.projectId
                  })
                }
                isOpen={mainWindowOpen}
                hasChildren
                onToggle={() => toggleExpanded(mainWindowKey)}
                onSelect={() =>
                  setSelected({
                    type: "main_window",
                    projectId: selectedProject.projectId
                  })
                }
              />

              {mainWindowOpen && (
                <>
                  <OutlineRow
                    title="Main Conversation"
                    meta={`${selectedProject.mainAnswer.messageCount} messages`}
                    depth={1}
                    isSelected={
                      selectedKey(selectedItem) ===
                      selectedKey({
                        type: "main_conversation",
                        projectId: selectedProject.projectId
                      })
                    }
                    isOpen={conversationOpen}
                    hasChildren={false}
                    onToggle={() => toggleExpanded(conversationKey)}
                    onSelect={() =>
                      setSelected({
                        type: "main_conversation",
                        projectId: selectedProject.projectId
                      })
                    }
                  />
                  <OutlineRow
                    title="Document Versions"
                    meta={`${selectedProject.versions.length} versions`}
                    depth={1}
                    isSelected={
                      selectedKey(selectedItem) ===
                      selectedKey({
                        type: "document_versions",
                        projectId: selectedProject.projectId
                      })
                    }
                    isOpen={versionsOpen}
                    hasChildren={selectedProject.versions.length > 0}
                    onToggle={() => toggleExpanded(versionsKey)}
                    onSelect={() =>
                      setSelected({
                        type: "document_versions",
                        projectId: selectedProject.projectId
                      })
                    }
                  />
                  {versionsOpen &&
                    selectedProject.versions.map((version) => (
                      <OutlineRow
                        key={version.id}
                        title={
                          version.versionNumber
                            ? `v${version.versionNumber}`
                            : compactText(version.id, 22)
                        }
                        meta={`${version.sourceType ?? "unknown source"} · ${formatTime(
                          version.createdAt
                        )}`}
                        badge={versionStatusLabel(selectedProject, version)}
                        depth={2}
                        isSelected={
                          selectedKey(selectedItem) ===
                          selectedKey({
                            type: "document_version",
                            projectId: selectedProject.projectId,
                            versionId: version.id
                          })
                        }
                        onSelect={() =>
                          setSelected({
                            type: "document_version",
                            projectId: selectedProject.projectId,
                            versionId: version.id
                          })
                        }
                      />
                    ))}
                  <OutlineRow
                    title="Local Revision Threads"
                    meta={`${selectedProject.stats.totalThreads} selection-based threads`}
                    depth={1}
                    isSelected={
                      selectedKey(selectedItem) ===
                      selectedKey({
                        type: "main_threads",
                        projectId: selectedProject.projectId
                      })
                    }
                    isOpen={threadsOpen}
                    hasChildren
                    onToggle={() => toggleExpanded(threadsKey)}
                    onSelect={() =>
                      setSelected({
                        type: "main_threads",
                        projectId: selectedProject.projectId
                      })
                    }
                  />
                  {threadsOpen &&
                    (selectedProject.selectionGroups.length === 0 ? (
                      <div className="ml-10 rounded-md border border-dashed border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                        No local revision threads yet. Select text in an
                        answer and open a local window to create one.
                      </div>
                    ) : (
                      selectedProject.selectionGroups.map((group) => {
                        const groupKey = `${selectedProject.projectId}:group:${group.id}`;
                        const groupOpen = expanded[groupKey] ?? true;

                        return (
                          <div key={group.id}>
                            <OutlineRow
                              title="Selection"
                              meta={group.sourcePreview}
                              depth={2}
                              isSelected={
                                selectedKey(selectedItem) ===
                                selectedKey({
                                  type: "selection_group",
                                  projectId: selectedProject.projectId,
                                  groupId: group.id
                                })
                              }
                              isOpen={groupOpen}
                              hasChildren={group.threads.length > 0}
                              onToggle={() => toggleExpanded(groupKey)}
                              onSelect={() =>
                                setSelected({
                                  type: "selection_group",
                                  projectId: selectedProject.projectId,
                                  groupId: group.id
                                })
                              }
                            />
                            {groupOpen &&
                              group.threads.map((thread) => (
                                <ThreadRows
                                  key={thread.thread.id}
                                  thread={thread}
                                  view={selectedProject}
                                  depth={3}
                                  expanded={expanded}
                                  selected={selectedItem}
                                  onToggle={toggleExpanded}
                                  onSelect={setSelected}
                                />
                              ))}
                          </div>
                        );
                      })
                    ))}
                </>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm text-slate-600">
              No project selected.
            </div>
          )}
        </div>
      </section>

      <section className="thin-scrollbar min-w-0 overflow-auto p-4 max-[1180px]:col-span-2 max-[900px]:col-span-1">
        <DetailPanel
          views={views}
          selected={selectedItem}
          currentProjectId={currentProjectId}
          onSelect={setSelected}
          onOpenThread={openExplorerThread}
          onDiscardThread={discardExplorerThread}
          onDeleteThread={deleteExplorerThread}
          onRevertVersion={revertVersion}
        />
      </section>
    </div>
  );
}
