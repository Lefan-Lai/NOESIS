"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { getBlocksVisibleAtVersion } from "@/lib/version/getBlocksVisibleAtVersion";
import { MarkdownText } from "@/components/MarkdownText";
import { DiffService, type TextDiff } from "@/services/revision/DiffService";
import type { DocumentVersionModel } from "@/types/revision";
import {
  DocumentAnswerRenderer,
  type TextSelectionDraft
} from "./DocumentAnswerRenderer";
import { DiffReviewModal } from "./DiffReviewModal";
import { DocumentVersionHistoryPanel } from "./DocumentVersionHistoryPanel";
import {
  conversationMessageIdFromSource,
  focusMainMessageBySource,
  focusMainSelectionByAnchor,
  requestSourceFocus,
  type SourceFocusRequest
} from "@/lib/navigation/sourceLocator";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  EyeOff,
  GitCompareArrows,
  History,
  LocateFixed,
  MessageSquare,
  PencilLine,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound
} from "lucide-react";

type MainDocumentPanelProps = {
  documentId: string;
};

type ChatVisibility = "active" | "inactive" | "removed" | "all";
type ChatPathStatus = "active" | "inactive" | "discarded" | "deleted";

export function MainDocumentPanel({ documentId }: MainDocumentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [chatVisibility, setChatVisibility] = useState<ChatVisibility>("active");
  const [isChatStatusBarVisible, setIsChatStatusBarVisible] = useState(true);
  const [pendingSourceFocus, setPendingSourceFocus] =
    useState<SourceFocusRequest | null>(null);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [diffForReview, setDiffForReview] = useState<TextDiff | null>(null);
  const [diffBaseVersion, setDiffBaseVersion] =
    useState<DocumentVersionModel | null>(null);
  const [isDiffReadOnly, setIsDiffReadOnly] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [versionPreview, setVersionPreview] =
    useState<DocumentVersionModel | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const currentProjectId = useAnswerAtlasStore((state) => state.currentProjectId);
  const documents = useAnswerAtlasStore((state) => state.documents);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
  const manualEditDrafts = useAnswerAtlasStore(
    (state) => state.manualEditDrafts
  );
  const versionNodes = useAnswerAtlasStore((state) => state.versionNodes);
  const snapshots = useAnswerAtlasStore((state) => state.snapshots);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const generateDocumentFromPrompt = useAnswerAtlasStore(
    (state) => state.generateDocumentFromPrompt
  );
  const regenerateMainAnswer = useAnswerAtlasStore(
    (state) => state.regenerateMainAnswer
  );
  const isGeneratingDocument = useAnswerAtlasStore(
    (state) => state.isGeneratingDocument
  );
  const availableModels = useAnswerAtlasStore((state) => state.availableModels);
  const mainWindowId = useAnswerAtlasStore((state) => state.mainWindowId);
  const windows = useAnswerAtlasStore((state) => state.windows);
  const sessions = useAnswerAtlasStore((state) => state.sessions);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const comparisons = useAnswerAtlasStore((state) => state.comparisons);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const setWindowModel = useAnswerAtlasStore((state) => state.setWindowModel);
  const openSelectionBranch = useAnswerAtlasStore(
    (state) => state.openSelectionBranch
  );
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const openComparisonWindow = useAnswerAtlasStore(
    (state) => state.openComparisonWindow
  );
  const addNoteForSelection = useAnswerAtlasStore(
    (state) => state.addNoteForSelection
  );
  const createManualEditDraft = useAnswerAtlasStore(
    (state) => state.createManualEditDraft
  );
  const previewManualEditDraftDiff = useAnswerAtlasStore(
    (state) => state.previewManualEditDraftDiff
  );
  const confirmManualEditDraft = useAnswerAtlasStore(
    (state) => state.confirmManualEditDraft
  );
  const cancelManualEditDraft = useAnswerAtlasStore(
    (state) => state.cancelManualEditDraft
  );
  const document = documents[documentId] ?? Object.values(documents)[0];
  const mainWindow = windows[mainWindowId];
  const mainSession = mainWindow
    ? sessions[mainWindow.conversationSessionId]
    : null;
  const mainMessages = useMemo(
    () =>
      Object.values(conversationMessages)
        .filter(
          (message) => message.sessionId === mainSession?.id
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [conversationMessages, mainSession?.id]
  );
  function versionNodeForConversationMessage(messageId: string) {
    const suffix = messageId.startsWith("conv-assistant-")
      ? messageId.slice("conv-assistant-".length)
      : messageId.startsWith("conv-user-")
        ? messageId.slice("conv-user-".length)
        : "";

    if (!suffix) {
      return undefined;
    }

    return (
      versionNodes[`v-created-${suffix}`] ??
      versionNodes[`v-main-answer-${suffix}`]
    );
  }

  function documentVersionForConversationMessage(messageId: string) {
    const revisionMessageId = revisionMessageIdForConversation(messageId);
    const node = versionNodeForConversationMessage(messageId);

    return Object.values(documentVersions).find(
      (version) =>
        (node?.id && version.createdFromTimelineNodeId === node.id) ||
        version.sourceId === revisionMessageId
    );
  }

  function chatPathStatusForMessage(
    message: (typeof mainMessages)[number]
  ): ChatPathStatus {
    if (message.contentState === "deleted") {
      return "deleted";
    }

    const node = versionNodeForConversationMessage(message.id);

    if (!node) {
      return "active";
    }

    if (node.nodeType === "deleted") {
      return "deleted";
    }

    if (node.nodeType === "discarded") {
      return "discarded";
    }

    return node.isActivePath ? "active" : "inactive";
  }

  const messageStatusById = useMemo(
    () =>
      Object.fromEntries(
        mainMessages.map((message) => [
          message.id,
          chatPathStatusForMessage(message)
        ])
      ) as Record<string, ChatPathStatus>,
    [mainMessages, versionNodes]
  );
  const displayedMainMessages = useMemo(
    () =>
      mainMessages.filter((message) => {
        const status = messageStatusById[message.id] ?? "active";

        if (chatVisibility === "all") {
          return true;
        }

        if (chatVisibility === "removed") {
          return status === "deleted" || status === "discarded";
        }

        return status === chatVisibility;
      }),
    [chatVisibility, mainMessages, messageStatusById]
  );
  const chatStatusCounts = useMemo(
    () =>
      mainMessages.reduce(
        (counts, message) => {
          const status = messageStatusById[message.id] ?? "active";

          counts.all += 1;

          if (status === "deleted" || status === "discarded") {
            counts.removed += 1;
          } else {
            counts[status] += 1;
          }

          return counts;
        },
        {
          active: 0,
          inactive: 0,
          removed: 0,
          all: 0
        } as Record<ChatVisibility, number>
      ),
    [mainMessages, messageStatusById]
  );
  const userQuestions = useMemo(
    () =>
      mainMessages.filter(
        (message) =>
          message.role === "user" &&
          (messageStatusById[message.id] ?? "active") === "active"
      ),
    [mainMessages, messageStatusById]
  );
  const latestAssistantMessage = useMemo(
    () =>
      [...mainMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            (messageStatusById[message.id] ?? "active") === "active"
        ),
    [mainMessages, messageStatusById]
  );
  const versionHistory = useMemo(
    () =>
      Object.values(documentVersions)
        .filter(
          (version) =>
            version.projectId === currentProjectId &&
            (!mainSession?.id || version.conversationId === mainSession.id)
        )
        .sort(
          (a, b) =>
            (a.versionNumber ?? 0) - (b.versionNumber ?? 0) ||
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [currentProjectId, documentVersions, mainSession?.id]
  );
  const activeDocumentVersion = useMemo(
    () =>
      [...versionHistory]
        .reverse()
        .find((version) => version.status === "active"),
    [versionHistory]
  );

  useEffect(() => {
    if (!document) {
      setPrompt("");
    }
  }, [document]);

  useEffect(() => {
    chatAreaRef.current?.scrollTo({
      top: chatAreaRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [displayedMainMessages.length, isGeneratingDocument]);

  useEffect(() => {
    function handleSourceFocus(event: Event) {
      const request = (event as CustomEvent<SourceFocusRequest>).detail;
      const conversationMessageId = conversationMessageIdFromSource(
        request?.sourceMessageId
      );

      if (conversationMessageId) {
        const status = messageStatusById[conversationMessageId] ?? "active";

        setChatVisibility(
          status === "deleted" || status === "discarded" ? "removed" : status
        );
      }

      setPendingSourceFocus(request);
    }

    window.addEventListener("answer-atlas:focus-source", handleSourceFocus);

    return () =>
      window.removeEventListener("answer-atlas:focus-source", handleSourceFocus);
  }, [messageStatusById]);

  useEffect(() => {
    if (!pendingSourceFocus) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const focused =
        focusMainSelectionByAnchor(pendingSourceFocus.anchorId) ||
        focusMainMessageBySource(pendingSourceFocus.sourceMessageId);

      if (focused) {
        setPendingSourceFocus(null);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [displayedMainMessages, pendingSourceFocus]);

  const blocks = useMemo(() => {
    if (!document || !activeVersionNodeId) {
      return [];
    }

    return getBlocksVisibleAtVersion(
      { snapshots, versionNodes },
      document.id,
      document.rootVersionNodeId,
      activeVersionNodeId
    );
  }, [activeVersionNodeId, document, snapshots, versionNodes]);

  const sentenceCount = blocks.filter((block) => block.blockType === "sentence").length;
  const wordCount = blocks
    .filter((block) => block.blockType === "sentence")
    .reduce((total, block) => total + block.text.split(/\s+/).filter(Boolean).length, 0);

  async function handleGenerate() {
    const currentPrompt = prompt.trim();

    if (!currentPrompt) {
      return;
    }

    setPrompt("");
    await generateDocumentFromPrompt(currentPrompt);
  }

  function scrollToQuestion(messageId: string) {
    globalThis.document
      ?.getElementById(`main-message-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleAddNote(selection: TextSelectionDraft) {
    const note = window.prompt("Add a note for future LLM context");

    if (note?.trim()) {
      addNoteForSelection(selection, note);
    }
  }

  function startEditingActiveVersion() {
    const draftId = createManualEditDraft();

    if (!draftId) {
      return;
    }

    setEditDraftId(draftId);
    setDraftContent(
      manualEditDrafts[draftId]?.draftContent ??
        activeDocumentVersion?.content ??
        latestAssistantMessage?.content ??
        ""
    );
    setConflictMessage(null);
  }

  function openDiffReview() {
    if (!editDraftId) {
      return;
    }

    const diff = previewManualEditDraftDiff(editDraftId, draftContent);
    const baseVersionId = manualEditDrafts[editDraftId]?.baseDocumentVersionId;

    if (!diff) {
      return;
    }

    setDiffForReview(diff);
    setDiffBaseVersion(
      baseVersionId ? documentVersions[baseVersionId] ?? null : null
    );
    setIsDiffReadOnly(false);
    setConflictMessage(null);
  }

  function confirmDiffReview() {
    if (!editDraftId) {
      return;
    }

    const result = confirmManualEditDraft(editDraftId, draftContent);

    if (!result) {
      return;
    }

    if (!result.ok) {
      setDiffForReview(result.diffAgainstCurrent ?? diffForReview);
      setConflictMessage(
        `Conflict: this draft was based on ${result.baseDocumentVersionId}, but the active version is ${result.activeDocumentVersionId ?? "missing"}.`
      );
      return;
    }

    setEditDraftId(null);
    setDraftContent("");
    setDiffForReview(null);
    setDiffBaseVersion(null);
    setIsDiffReadOnly(false);
    setConflictMessage(null);
  }

  function cancelEditing() {
    if (editDraftId) {
      cancelManualEditDraft(editDraftId);
    }

    setEditDraftId(null);
    setDraftContent("");
    setDiffForReview(null);
    setDiffBaseVersion(null);
    setIsDiffReadOnly(false);
    setConflictMessage(null);
  }

  function showVersionDiff(version: DocumentVersionModel) {
    const parentId = version.parentDocumentVersionId ?? version.parentVersionId;
    const parent = parentId ? documentVersions[parentId] : undefined;

    if (!parent) {
      return;
    }

    setDiffForReview(DiffService.createTextDiff(parent.content, version.content));
    setDiffBaseVersion(parent);
    setDraftContent(version.content);
    setIsDiffReadOnly(true);
    setConflictMessage(null);
  }

  function revisionMessageIdForConversation(messageId: string) {
    return messageId.startsWith("conv-assistant-")
      ? messageId.replace("conv-assistant-", "rev-message-assistant-")
      : messageId;
  }

  function localThreadsForSourceMessage(sourceMessageId: string) {
    return Object.values(threads)
      .filter((thread) => {
        const anchor = anchors[thread.anchorId];

        return (
          thread.status !== "deleted" &&
          (thread.sourceMessageId === sourceMessageId ||
            anchor?.sourceMessageId === sourceMessageId)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  function mapComparisonsForSourceMessage(sourceMessageId: string) {
    return Object.values(comparisons)
      .filter((comparison) => {
        const anchor = anchors[comparison.anchorId];

        return (
          comparison.status !== "deleted" &&
          anchor?.sourceMessageId === sourceMessageId
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  function openLocalThreadFromAnswer(
    threadId: string,
    anchorId?: string,
    sourceMessageId?: string
  ) {
    openThread(threadId);
    window.setTimeout(() => {
      requestSourceFocus({ anchorId, sourceMessageId });
    });
  }

  return (
    <main className="panel h-full min-h-0 min-w-[320px] overflow-hidden rounded-lg max-[900px]:h-[520px]">
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="truncate text-lg font-bold text-ink">
            {mainWindow?.title ?? "Main Answer Window"}
            <span className="ml-2 text-sm font-medium text-muted">
              {document?.title ?? "empty session"}
            </span>
          </h2>
          <div className="flex gap-1 text-slate-600">
            <button
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100"
              title="Forward"
              aria-label="Forward"
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div
          ref={chatAreaRef}
          className="thin-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4"
        >
          {mainMessages.length === 0 ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-atlasBlue">
                  <Sparkles size={24} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-ink">
                  Start with a question
                </h3>
                <p className="text-sm leading-6 text-muted">
                  Choose a model, ask a question, and Answer Atlas will generate
                  the document, outline, sentence anchors, side threads, and
                  comparison workspace from the model response.
                </p>
              </div>
            </div>
          ) : (
            <div id="answer-body" className="mx-auto max-w-4xl space-y-4 py-2">
              {isVersionHistoryOpen && (
                <DocumentVersionHistoryPanel
                  versions={versionHistory}
                  activeVersionId={activeDocumentVersion?.id}
                  onView={(version) => setVersionPreview(version)}
                  onViewDiff={showVersionDiff}
                  onClose={() => setIsVersionHistoryOpen(false)}
                />
              )}
              {versionPreview && (
                <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-bold text-ink">
                      Version {versionPreview.versionNumber ?? "?"} Preview
                    </div>
                    <button
                      type="button"
                      onClick={() => setVersionPreview(null)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
                    >
                      Close
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap">
                    {versionPreview.status === "deleted"
                      ? "[deleted version]"
                      : versionPreview.content}
                  </pre>
                </div>
              )}
              <div className="sticky top-0 z-10 flex justify-end">
                {isChatStatusBarVisible ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-white/95 p-2 text-xs shadow-sm backdrop-blur">
                    {([
                      ["active", "Active"],
                      ["inactive", "Inactive"],
                      ["removed", "Removed"],
                      ["all", "All"]
                    ] as Array<[ChatVisibility, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setChatVisibility(value)}
                        className={`rounded-md px-2.5 py-1 font-semibold ${
                          chatVisibility === value
                            ? "bg-atlasBlue text-white"
                            : "border border-line bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                        <span className="ml-1 opacity-80">
                          {chatStatusCounts[value]}
                        </span>
                      </button>
                    ))}
                    <span className="ml-auto text-[11px] font-semibold text-muted">
                      Active messages are the only default main-chat memory path.
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsChatStatusBarVisible(false)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-white text-slate-600 hover:bg-slate-50"
                      title="Hide message filters"
                      aria-label="Hide message filters"
                    >
                      <EyeOff size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsChatStatusBarVisible(true)}
                    className="flex h-8 items-center gap-2 rounded-md border border-line bg-white/95 px-2.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-slate-50"
                    title="Show message filters"
                    aria-label="Show message filters"
                  >
                    <SlidersHorizontal size={14} />
                    <span className="max-[900px]:hidden">
                      {chatVisibility === "active"
                        ? "Active"
                        : chatVisibility === "inactive"
                          ? "Inactive"
                          : chatVisibility === "removed"
                            ? "Removed"
                            : "All"}
                      <span className="ml-1 text-muted">
                        {chatStatusCounts[chatVisibility]}
                      </span>
                    </span>
                  </button>
                )}
              </div>
              {displayedMainMessages.length === 0 && (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 p-5 text-center text-sm text-muted">
                  No messages in this view.
                </div>
              )}
              {displayedMainMessages.map((message) => {
                const isUser = message.role === "user";
                const Icon = isUser ? UserRound : Bot;
                const pathStatus = messageStatusById[message.id] ?? "active";
                const messageVersionNode = versionNodeForConversationMessage(
                  message.id
                );
                const messageDocumentVersion =
                  !isUser && pathStatus !== "deleted"
                    ? documentVersionForConversationMessage(message.id)
                    : undefined;
                const revisionMessageId = revisionMessageIdForConversation(
                  message.id
                );
                const relatedLocalThreads = isUser
                  ? []
                  : localThreadsForSourceMessage(revisionMessageId);
                const relatedComparisons = isUser
                  ? []
                  : mapComparisonsForSourceMessage(revisionMessageId);
                const isLatestAssistant =
                  pathStatus === "active" &&
                  !isUser &&
                  message.id === latestAssistantMessage?.id;
                const displayModelName =
                  !isUser &&
                  (message.modelName ??
                    message.modelConfigId ??
                    mainWindow?.modelConfigId);
                const assistantStatusLabel =
                  pathStatus === "active"
                    ? isLatestAssistant
                      ? "Active"
                      : "Earlier"
                    : pathStatus === "inactive"
                      ? "Historical"
                      : pathStatus === "discarded"
                        ? "Discarded"
                        : "Deleted";
                const canSelectAssistantAnswer =
                  !isUser &&
                  document &&
                  pathStatus !== "deleted";
                const renderedAssistantText =
                  isLatestAssistant && activeDocumentVersion
                    ? activeDocumentVersion.content
                    : message.content;

                return (
                  <article
                    id={`main-message-${message.id}`}
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"} ${
                      pathStatus === "inactive" ? "opacity-70" : ""
                    }`}
                  >
                    <div
                      className={`max-w-[86%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                        pathStatus === "deleted"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : pathStatus === "discarded"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : pathStatus === "inactive"
                              ? "border-slate-200 bg-slate-50 text-slate-600"
                              : isUser
                                ? "border-blue-200 bg-blue-50 text-slate-800"
                                : "border-line bg-white text-slate-800"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 font-semibold text-ink">
                        <span className="flex items-center gap-2">
                          <Icon
                            size={16}
                            className={isUser ? "text-atlasBlue" : "text-atlasPurple"}
                          />
                          {isUser ? "You" : "Assistant"}
                        </span>
                        <span className="flex items-center gap-1">
                          {!isUser && (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                                pathStatus === "deleted"
                                  ? "bg-red-100 text-red-700"
                                  : pathStatus === "discarded"
                                    ? "bg-amber-100 text-amber-700"
                                    : pathStatus === "inactive"
                                      ? "bg-slate-200 text-slate-600"
                                      : isLatestAssistant
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-blue-50 text-atlasBlue"
                              }`}
                            >
                              {assistantStatusLabel}
                            </span>
                          )}
                          {!isUser && relatedLocalThreads.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openLocalThreadFromAnswer(
                                  relatedLocalThreads[0].id,
                                  relatedLocalThreads[0].anchorId,
                                  revisionMessageId
                                )
                              }
                              className="flex h-7 items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 text-xs font-semibold text-atlasBlue hover:bg-blue-100"
                              title="Open a local thread created from this answer"
                            >
                              <MessageSquare size={13} />
                              Local {relatedLocalThreads.length}
                            </button>
                          )}
                          {!isUser && relatedComparisons.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openComparisonWindow(relatedComparisons[0].id)
                              }
                              className="flex h-7 items-center gap-1 rounded-md border border-purple-100 bg-purple-50 px-2 text-xs font-semibold text-atlasPurple hover:bg-purple-100"
                              title="Open a semantic difference map created from this answer"
                            >
                              <GitCompareArrows size={13} />
                              Map {relatedComparisons.length}
                            </button>
                          )}
                          {!isUser && isLatestAssistant && (
                            <>
                              <button
                                type="button"
                                onClick={startEditingActiveVersion}
                                disabled={!activeDocumentVersion || Boolean(editDraftId)}
                                className="flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                              >
                                <PencilLine size={13} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setIsVersionHistoryOpen((open) => !open)
                                }
                                className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                              >
                                View Versions
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  activeDocumentVersion &&
                                  showVersionDiff(activeDocumentVersion)
                                }
                                disabled={
                                  !activeDocumentVersion ||
                                  (!activeDocumentVersion.parentDocumentVersionId &&
                                    !activeDocumentVersion.parentVersionId)
                                }
                                className="flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                              >
                                <GitCompareArrows size={13} />
                                View Diff
                              </button>
                            </>
                          )}
                          {!isUser && displayModelName && (
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-atlasBlue">
                              {displayModelName === "gpt-5.5"
                                ? "GPT-5.5"
                                : displayModelName}
                            </span>
                          )}
                        </span>
                      </div>
                      {pathStatus === "deleted" ? (
                        <div className="rounded-md border border-red-200 bg-white/70 px-3 py-2 text-sm font-semibold text-red-700">
                          [deleted message]
                        </div>
                      ) : isLatestAssistant && editDraftId ? (
                        <div className="space-y-3">
                          <textarea
                            value={draftContent}
                            onChange={(event) => setDraftContent(event.target.value)}
                            className="min-h-[260px] w-full rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-atlasBlue"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={openDiffReview}
                              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-atlasBlue"
                            >
                              Preview Diff
                            </button>
                            <button
                              type="button"
                              onClick={openDiffReview}
                              className="rounded-md bg-atlasBlue px-3 py-2 text-sm font-semibold text-white"
                            >
                              Save Edit
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : canSelectAssistantAnswer ? (
                        <div className="space-y-2">
                          {!isLatestAssistant && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                              {pathStatus === "active"
                                ? "Earlier answer. Local questions stay attached to this answer."
                                : "Historical answer. Local questions stay attached to this non-active path."}
                            </div>
                          )}
                          {relatedLocalThreads.length > 0 && (
                            <div className="flex flex-wrap gap-2 rounded-md border border-blue-100 bg-blue-50/45 px-2.5 py-2 text-xs">
                              <span className="flex items-center gap-1 font-bold text-atlasBlue">
                                <LocateFixed size={13} />
                                Source locals
                              </span>
                              {relatedLocalThreads.map((thread, index) => {
                                const threadAnchor = anchors[thread.anchorId];

                                return (
                                  <button
                                    id={`source-anchor-${thread.anchorId}`}
                                    key={thread.id}
                                    type="button"
                                    onClick={() =>
                                      openLocalThreadFromAnswer(
                                        thread.id,
                                        thread.anchorId,
                                        revisionMessageId
                                      )
                                    }
                                    className="max-w-[260px] truncate rounded-full border border-blue-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:border-atlasBlue hover:text-atlasBlue"
                                    title={
                                      threadAnchor?.selectedText ??
                                      thread.selectedText ??
                                      "Open related local thread"
                                    }
                                  >
                                    {index + 1}.{" "}
                                    {threadAnchor?.selectedText ??
                                      thread.selectedText ??
                                      "related local thread"}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {relatedComparisons.length > 0 && (
                            <div className="flex flex-wrap gap-2 rounded-md border border-purple-100 bg-purple-50/45 px-2.5 py-2 text-xs">
                              <span className="flex items-center gap-1 font-bold text-atlasPurple">
                                <GitCompareArrows size={13} />
                                Semantic maps
                              </span>
                              {relatedComparisons.map((comparison, index) => {
                                const comparisonAnchor = anchors[comparison.anchorId];

                                return (
                                  <button
                                    key={comparison.id}
                                    type="button"
                                    onClick={() => openComparisonWindow(comparison.id)}
                                    className="max-w-[260px] truncate rounded-full border border-purple-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:border-atlasPurple hover:text-atlasPurple"
                                    title={
                                      comparisonAnchor?.selectedText ??
                                      "Open semantic difference map"
                                    }
                                  >
                                    {index + 1}.{" "}
                                    {comparisonAnchor?.selectedText ??
                                      comparison.semanticMap?.overview.mainSummary ??
                                      "semantic difference map"}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <DocumentAnswerRenderer
                            answerId={`${document.id}-${message.id}`}
                            text={renderedAssistantText}
                            source={{
                              conversationId: mainSession?.id,
                              sourceType: "message",
                              sourceId: revisionMessageId,
                              sourceMessageId: revisionMessageId,
                              sourceDocumentVersionId:
                                messageDocumentVersion?.id ??
                                (isLatestAssistant
                                  ? activeDocumentVersion?.id
                                  : undefined),
                              sourcePathStatus: pathStatus,
                              sourceVersionNodeId: messageVersionNode?.id,
                              sourceDocumentVersionNumber:
                                messageDocumentVersion?.versionNumber ??
                                (isLatestAssistant
                                  ? activeDocumentVersion?.versionNumber
                                  : undefined)
                            }}
                            onAskAboutThis={(selection) =>
                              openSelectionBranch(selection, "ask")
                            }
                            onReviseThis={(selection) =>
                              openSelectionBranch(selection, "revise")
                            }
                            onCreateBranch={(selection) =>
                              openSelectionBranch(selection, "ask")
                            }
                            onAddNote={handleAddNote}
                          />
                        </div>
                      ) : (
                        <MarkdownText text={renderedAssistantText} />
                      )}
                    </div>
                  </article>
                );
              })}
              {isGeneratingDocument && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-muted shadow-sm">
                    Assistant is thinking...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-line bg-slate-50/70 p-3">
          <div className="flex gap-2">
            <div className="group relative">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Previous questions"
                aria-label="Previous questions"
                disabled={userQuestions.length === 0}
              >
                <History size={16} />
              </button>
              {userQuestions.length > 0 && (
                <div className="invisible absolute bottom-11 left-0 z-30 w-72 rounded-lg border border-line bg-white p-2 opacity-0 shadow-panel transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Previous Questions
                  </div>
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {userQuestions.map((message, index) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => scrollToQuestion(message.id)}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm leading-5 text-slate-700 hover:bg-slate-50"
                      >
                        <span className="mr-2 font-semibold text-atlasBlue">
                          {index + 1}.
                        </span>
                        {message.content}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleGenerate();
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-atlasBlue"
              placeholder="Ask a question..."
            />
            <select
              value={mainWindow?.modelConfigId ?? "gpt-5.5"}
              onChange={(event) =>
                mainWindow && setWindowModel(mainWindow.id, event.target.value)
              }
              className="h-9 max-w-[170px] rounded-md border border-line bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-atlasBlue"
              title="Main window model"
              aria-label="Main window model"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model === "gpt-5.5" ? "GPT-5.5" : model}
                </option>
              ))}
            </select>
            <button
              onClick={regenerateMainAnswer}
              disabled={isGeneratingDocument || userQuestions.length === 0}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-700 disabled:opacity-50"
              title="Regenerate"
              aria-label="Regenerate"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGeneratingDocument || !prompt.trim()}
              className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-atlasBlue px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send size={16} />
              {isGeneratingDocument ? "Sending" : "Send"}
            </button>
          </div>
        </div>
        <div className="flex h-10 items-center gap-5 border-t border-line px-4 text-xs text-muted">
          <span>Words: {wordCount}</span>
          <span>Sentences: {sentenceCount}</span>
          <span>Active node: {activeVersionNodeId ?? "none"}</span>
          {activeDocumentVersion && (
            <span>
              Document version: {activeDocumentVersion.versionNumber ?? "?"}
            </span>
          )}
        </div>
      </div>
      {diffForReview && (
        <DiffReviewModal
          diff={diffForReview}
          baseVersion={diffBaseVersion ?? undefined}
          draftPreview={draftContent}
          conflictMessage={conflictMessage}
          confirmDisabled={isDiffReadOnly || !editDraftId}
          onConfirm={confirmDiffReview}
          onContinueEditing={() => {
            setDiffForReview(null);
            setIsDiffReadOnly(false);
            setConflictMessage(null);
          }}
          onCancel={() => {
            setDiffForReview(null);
            setIsDiffReadOnly(false);
            setConflictMessage(null);
          }}
        />
      )}
    </main>
  );
}
