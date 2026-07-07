"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  CircleX,
  GitCompareArrows,
  LocateFixed,
  MessageSquarePlus,
  Minus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserRound
} from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { DocumentAnswerRenderer } from "@/components/document/DocumentAnswerRenderer";
import { ThreadMessageCard } from "./ThreadMessageCard";
import { ThreadActionBar } from "./ThreadActionBar";
import { DeleteAnswerDialog } from "./DeleteAnswerDialog";
import type { TextSelectionDraft } from "@/components/document/DocumentAnswerRenderer";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import { requestSourceFocus } from "@/lib/navigation/sourceLocator";

function getAnchorDisplayLabel(blockId?: string) {
  return blockId ? blockId.toUpperCase() : "-";
}

function compactLabel(value?: string, fallback = "Local thread") {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

type SideThreadPanelProps = {
  threadId?: string;
  chainRole?: "active" | "parent" | "child";
};

export function SideThreadPanel({
  threadId,
  chainRole = "active"
}: SideThreadPanelProps = {}) {
  const [question, setQuestion] = useState("");
  const [annotationText, setAnnotationText] = useState("");
  const [contextNotesOpen, setContextNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const contextNoteInputRef = useRef<HTMLTextAreaElement>(null);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const blocks = useAnswerAtlasStore((state) => state.blocks);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const messages = useAnswerAtlasStore((state) => state.messages);
  const comparisons = useAnswerAtlasStore((state) => state.comparisons);
  const annotations = useAnswerAtlasStore((state) => state.annotations);
  const revisionAnnotations = useAnswerAtlasStore(
    (state) => state.revisionAnnotations
  );
  const textSelections = useAnswerAtlasStore((state) => state.textSelections);
  const documentVersions = useAnswerAtlasStore((state) => state.documentVersions);
  const windows = useAnswerAtlasStore((state) => state.windows);
  const availableModels = useAnswerAtlasStore((state) => state.availableModels);
  const setWindowModel = useAnswerAtlasStore((state) => state.setWindowModel);
  const selectedAnchorId = useAnswerAtlasStore((state) => state.selectedAnchorId);
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const askLocalQuestion = useAnswerAtlasStore((state) => state.askLocalQuestion);
  const openSelectionBranch = useAnswerAtlasStore(
    (state) => state.openSelectionBranch
  );
  const addNoteForSelection = useAnswerAtlasStore(
    (state) => state.addNoteForSelection
  );
  const regenerateLocalQuestion = useAnswerAtlasStore(
    (state) => state.regenerateLocalQuestion
  );
  const addAnnotation = useAnswerAtlasStore((state) => state.addAnnotation);
  const deleteAnnotation = useAnswerAtlasStore((state) => state.deleteAnnotation);
  const isAskingLocalQuestion = useAnswerAtlasStore(
    (state) => state.isAskingLocalQuestion
  );
  const isGeneratingComparison = useAnswerAtlasStore(
    (state) => state.isGeneratingComparison
  );
  const revisionSuggestions = useAnswerAtlasStore(
    (state) => state.revisionSuggestions
  );
  const keepAsNote = useAnswerAtlasStore((state) => state.keepAsNote);
  const requestMerge = useAnswerAtlasStore((state) => state.requestMerge);
  const requestMergeFromSelection = useAnswerAtlasStore(
    (state) => state.requestMergeFromSelection
  );
  const discardThread = useAnswerAtlasStore((state) => state.discardThread);
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const closeSideThread = useAnswerAtlasStore((state) => state.closeSideThread);
  const minimizeSideThread = useAnswerAtlasStore(
    (state) => state.minimizeSideThread
  );
  const openComparisonWindow = useAnswerAtlasStore(
    (state) => state.openComparisonWindow
  );
  const closeComparisonWindow = useAnswerAtlasStore(
    (state) => state.closeComparisonWindow
  );
  const openThread = useAnswerAtlasStore((state) => state.openThread);

  const effectiveThreadId = threadId ?? selectedThreadId;
  const isActivePanel = Boolean(
    effectiveThreadId && effectiveThreadId === selectedThreadId && chainRole !== "parent"
  );
  const thread = effectiveThreadId ? threads[effectiveThreadId] : null;
  const effectiveAnchorId = thread?.anchorId ?? selectedAnchorId;
  const anchor = effectiveAnchorId ? anchors[effectiveAnchorId] : null;
  const block = anchor?.blockId ? blocks[anchor.blockId] : null;
  const selectedText = anchor?.selectedText ?? block?.text ?? "";
  const branchWindow = thread ? windows[`window-${thread.id}`] : null;
  const threadMessages = useMemo(
    () =>
      Object.values(messages)
        .filter((message) => message.threadId === effectiveThreadId)
        .filter((message) => message.contentState !== "deleted")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [messages, effectiveThreadId]
  );
  const latestAssistantMessage = useMemo(
    () =>
      [...threadMessages]
        .reverse()
        .find((message) => message.role === "assistant"),
    [threadMessages]
  );
  const anchorAnnotations = useMemo(
    () =>
      Object.values(annotations)
        .filter(
          (annotation) =>
            annotation.anchorId === effectiveAnchorId &&
            annotation.status !== "deleted"
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [annotations, effectiveAnchorId]
  );
  const relatedRevisionNotes = useMemo(() => {
    if (!thread) {
      return [];
    }

    const scopeIds = new Set(
      [
        thread.sourceSelectionId,
        thread.sourceLocalSelectionId,
        thread.revisionLocalThreadId
      ].filter(Boolean)
    );

    return Object.values(revisionAnnotations)
      .filter(
        (annotation) =>
          scopeIds.has(annotation.scopeId ?? annotation.scopeObjectId) ||
          annotation.sourceLocalThreadId === thread.revisionLocalThreadId ||
          annotation.sourceLocalSelectionId === thread.sourceLocalSelectionId
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [revisionAnnotations, thread]);
  const sourceSelection = thread?.sourceSelectionId
    ? textSelections[thread.sourceSelectionId]
    : undefined;
  const sourceDocumentVersion = sourceSelection?.sourceDocumentVersionId
    ? documentVersions[sourceSelection.sourceDocumentVersionId]
    : undefined;
  const activeDocumentVersion = useMemo(
    () =>
      Object.values(documentVersions)
        .filter((version) => version.status === "active")
        .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0],
    [documentVersions]
  );
  const isOlderSourceVersion = Boolean(
    sourceDocumentVersion &&
      activeDocumentVersion &&
      sourceDocumentVersion.id !== activeDocumentVersion.id
  );
  const sourceMessageId =
    sourceSelection?.sourceMessageId ?? anchor?.sourceMessageId ?? thread?.sourceMessageId;
  const relatedComparisons = useMemo(
    () =>
      Object.values(comparisons)
        .filter(
          (comparison) =>
            comparison.status !== "deleted" &&
            comparison.anchorId === effectiveAnchorId
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [comparisons, effectiveAnchorId]
  );
  const threadTreeItems = useMemo(() => {
    if (!thread) {
      return [];
    }

    const messageCountByThreadId = new Map<string, number>();

    Object.values(messages).forEach((message) => {
      if (message.contentState === "deleted") {
        return;
      }

      messageCountByThreadId.set(
        message.threadId,
        (messageCountByThreadId.get(message.threadId) ?? 0) + 1
      );
    });

    const visited = new Set<string>();
    let cursor: typeof thread | undefined = thread;

    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      cursor = cursor.parentThreadId ? threads[cursor.parentThreadId] : undefined;
    }

    const rootId = [...visited]
      .map((id) => threads[id])
      .find((item) => item && !item.parentThreadId)?.id;
    const root = rootId ? threads[rootId] : thread;
    const childrenByParentId = new Map<string, LocalThread[]>();

    Object.values(threads)
      .filter((item) => item.status !== "deleted")
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .forEach((item) => {
        const parentId = item.parentThreadId;

        if (!parentId) {
          return;
        }

        const siblings = childrenByParentId.get(parentId) ?? [];

        siblings.push(item);
        childrenByParentId.set(parentId, siblings);
      });

    const shouldShowThread = (item: LocalThread) =>
      item.id === thread.id ||
      (messageCountByThreadId.get(item.id) ?? 0) > 0 ||
      item.status !== "active";

    const rows: Array<{
      id: string;
      depth: number;
      role: string;
      label: string;
      fullLabel: string;
      status: LocalThread["status"];
      messageCount: number;
      mapCount: number;
      isCurrent: boolean;
      isDraft: boolean;
    }> = [];

    const visit = (item: LocalThread, depth: number) => {
      if (!shouldShowThread(item)) {
        return;
      }

      const firstQuestion = Object.values(messages)
        .filter((message) => message.threadId === item.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .find((message) => message.role === "user");
      const isCurrent = item.id === thread.id;
      const messageCount = messageCountByThreadId.get(item.id) ?? 0;
      const mapCount = Object.values(comparisons).filter(
        (comparison) =>
          comparison.status !== "deleted" &&
          comparison.anchorId === item.anchorId
      ).length;
      const role = isCurrent
        ? "Current"
        : depth === 0
          ? "Root"
          : "Follow-up";
      const label = compactLabel(
        firstQuestion?.content ?? item.selectedText,
        role
      );

      rows.push({
        id: item.id,
        depth,
        role,
        label,
        fullLabel: firstQuestion?.content ?? item.selectedText ?? role,
        status: item.status,
        messageCount,
        mapCount,
        isCurrent,
        isDraft: messageCount === 0
      });

      (childrenByParentId.get(item.id) ?? []).forEach((child) => {
        visit(child, depth + 1);
      });
    };

    visit(root, 0);

    return rows;
  }, [comparisons, messages, thread, threads]);
  const shouldShowContextNotesPanel =
    isActivePanel &&
    Boolean(thread && anchor && selectedText) &&
    (contextNotesOpen || anchorAnnotations.length > 0);
  const revisionSuggestionText = thread
    ? revisionSuggestions[thread.id] ?? "No revised sentence returned yet."
    : "";

  function openThreadFromStack(targetThreadId: string) {
    const targetThread = threads[targetThreadId];

    if (!targetThread) {
      return;
    }

    openThread(targetThreadId);

    const comparison = Object.values(comparisons)
      .filter(
        (item) =>
          item.status !== "deleted" &&
          item.anchorId === targetThread.anchorId
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];

    if (comparison) {
      openComparisonWindow(comparison.id);
    } else {
      closeComparisonWindow();
    }
  }

  useEffect(() => {
    setContextNotesOpen(false);
    setAnnotationText("");
  }, [effectiveThreadId]);

  useEffect(() => {
    if (!contextNotesOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      contextNoteInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [contextNotesOpen]);

  function submitQuestion() {
    const currentQuestion = question.trim();

    if (!currentQuestion || isAskingLocalQuestion || !isActivePanel) {
      return;
    }

    void askLocalQuestion(currentQuestion);
    setQuestion("");
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitQuestion();
  }

  function nestedSelection(
    selection: TextSelectionDraft,
    message: ThreadMessage
  ) {
    return {
      ...selection,
      createdFromWindowId: branchWindow?.id,
      sourceThreadId: thread?.id,
      sourceMessageId: message.revisionMessageId ?? selection.sourceMessageId,
      sourceAnswerId: message.revisionMessageId ?? selection.sourceAnswerId
    };
  }

  function handleNestedNote(
    selection: TextSelectionDraft,
    message: ThreadMessage
  ) {
    const note = window.prompt("Add a note for future LLM context");

    if (note?.trim()) {
      addNoteForSelection(nestedSelection(selection, message), note);
    }
  }

  function submitAnnotation() {
    if (!annotationText.trim()) {
      return;
    }

    addAnnotation(annotationText);
    setAnnotationText("");
    setContextNotesOpen(false);
  }

  function cancelContextNote() {
    setAnnotationText("");
    setContextNotesOpen(false);
  }

  const isDeleted = thread?.status === "deleted";
  const isHidden = thread?.visibility === "hidden" && !isDeleted;
  const showLocalThinking = Boolean(
    thread && isActivePanel && isAskingLocalQuestion && !isDeleted && !isHidden
  );

  return (
    <section
      className={`panel min-h-0 overflow-hidden rounded-lg max-[900px]:h-[520px] ${
        chainRole === "parent" ? "border-blue-100 bg-blue-50/30" : ""
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-line px-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-lg font-bold text-ink">
              Ask Locally
            </h2>
            <span className="shrink-0 text-sm font-medium text-muted">
              (local context)
            </span>
          </div>
          <div className="flex items-center gap-1">
            {branchWindow && (
              <select
                value={branchWindow.modelConfigId}
                onChange={(event) =>
                  setWindowModel(branchWindow.id, event.target.value)
                }
                disabled={!isActivePanel}
                className="h-8 max-w-[160px] rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-700"
                title="Branch window model"
                aria-label="Branch window model"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model === "gpt-5.5" ? "GPT-5.5" : model}
                  </option>
                ))}
              </select>
            )}
            {isActivePanel ? (
              <>
                <button
                  onClick={minimizeSideThread}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
                  title="Minimize"
                  aria-label="Minimize"
                >
                  <Minus size={18} />
                </button>
                <button
                  onClick={closeSideThread}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
                  title="Close"
                  aria-label="Close"
                >
                  <CircleX size={18} />
                </button>
              </>
            ) : (
              <span className="rounded-full border border-blue-100 bg-white px-2 py-1 text-xs font-bold text-atlasBlue">
                Parent
              </span>
            )}
          </div>
        </div>
        {thread && (
          <div className="border-b border-line bg-slate-50/70 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Local thread tree
              </span>
              <span className="text-[11px] font-semibold text-muted">
                Empty drafts hide after switching
              </span>
            </div>
            <div className="thin-scrollbar max-h-32 space-y-1 overflow-auto pr-1">
              {threadTreeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center"
                  style={{ paddingLeft: item.depth * 16 }}
                >
                  {item.depth > 0 && (
                    <span className="mr-2 h-px w-4 shrink-0 bg-slate-300" />
                  )}
                  <button
                    type="button"
                    onClick={() => openThreadFromStack(item.id)}
                    title={item.fullLabel}
                    className={`group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-left text-xs ${
                      item.isCurrent
                        ? "border-blue-200 bg-blue-600 text-white shadow-sm"
                        : "border-line bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-atlasBlue"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.isDraft
                          ? "border border-current bg-transparent"
                          : item.isCurrent
                            ? "bg-white"
                            : "bg-atlasBlue"
                      }`}
                    />
                    <span className="shrink-0 font-bold opacity-80">
                      {item.role}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {item.label}
                    </span>
                    {item.isDraft && (
                      <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                        draft
                      </span>
                    )}
                    {!item.isDraft && (
                      <span className="shrink-0 text-[10px] opacity-75">
                        {item.messageCount}
                      </span>
                    )}
                    {item.status !== "active" && (
                      <span className="shrink-0 text-[10px] opacity-75">
                        {item.status.replaceAll("_", " ")}
                      </span>
                    )}
                  </button>
                  {item.mapCount > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openThreadFromStack(item.id);
                      }}
                      className="ml-1 h-8 shrink-0 rounded-md border border-purple-100 bg-purple-50 px-2 text-[11px] font-bold text-atlasPurple hover:bg-purple-100"
                      title="Open this thread's semantic map"
                    >
                      Map
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4">
          {anchor && selectedText ? (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
                <Anchor size={18} className="text-atlasBlue" />
                {anchor.anchorType === "text_selection"
                  ? "Selected Text"
                  : `Anchor: ${getAnchorDisplayLabel(anchor.blockId)}`}
                {sourceSelection?.anchorStatus === "needs_review" && (
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    Selection anchor needs review
                  </span>
                )}
                {thread && (
                  <span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-xs font-semibold text-muted">
                    {thread.status.replaceAll("_", " ")}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {relatedComparisons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openComparisonWindow(relatedComparisons[0].id)}
                      className="flex h-7 items-center gap-1 rounded-md border border-purple-100 bg-purple-50 px-2 text-xs font-semibold text-atlasPurple hover:bg-purple-100"
                      title="Open the semantic difference map for this local thread"
                    >
                      <GitCompareArrows size={13} />
                      Map {relatedComparisons.length}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      requestSourceFocus({
                        anchorId: anchor.id,
                        sourceMessageId
                      })
                    }
                    className="flex h-7 items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 text-xs font-semibold text-atlasBlue hover:bg-blue-100"
                    title="Go to the selected source in the main answer"
                  >
                    <LocateFixed size={13} />
                    Go to Source
                  </button>
                </div>
              </div>
              {isOlderSourceVersion && (
                <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">
                  This local thread was created from an older document version.
                  Source version {sourceDocumentVersion?.versionNumber ?? "?"};
                  active version {activeDocumentVersion?.versionNumber ?? "?"}.
                  Original selected text: {sourceSelection?.selectedText}
                </div>
              )}
              <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm leading-6 text-slate-700">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-atlasBlue">
                  {anchor.anchorType === "text_selection"
                    ? "Selected passage"
                    : "Selected sentence"}
                </div>
                {selectedText}
              </div>

              <div className="mb-4">
                <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                  <UserRound size={17} />
                  Your Question
                </label>
                <div className="flex gap-2 rounded-lg border border-line bg-white p-2">
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    disabled={!isActivePanel}
                    className="min-h-16 flex-1 resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                    placeholder={
                      isActivePanel
                        ? "Ask a local question about this sentence..."
                        : "Parent context is shown for reference."
                    }
                  />
                  <button
                    onClick={submitQuestion}
                    disabled={
                      !isActivePanel || isAskingLocalQuestion || !question.trim()
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-atlasBlue text-white disabled:opacity-50"
                    title="Send"
                    aria-label="Send"
                  >
                    <Send size={17} />
                  </button>
                  <button
                    onClick={regenerateLocalQuestion}
                    disabled={
                      !isActivePanel ||
                      isAskingLocalQuestion ||
                      threadMessages.length === 0
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-700 disabled:opacity-50"
                    title="Regenerate"
                    aria-label="Regenerate"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {isDeleted && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-atlasRed">
                  Deleted, excluded from context
                </div>
              )}

              {isHidden && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-atlasOrange">
                  Discarded, context eligible
                </div>
              )}

              {!isHidden && !isDeleted && (
                <div className="space-y-3">
                  {threadMessages.map((message) => (
                    <ThreadMessageCard
                      key={message.id}
                      message={message}
                      sourceLocalThreadId={thread?.revisionLocalThreadId}
                      parentSelectionId={thread?.sourceSelectionId}
                      parentLocalSelectionId={thread?.sourceLocalSelectionId}
                      sourceThreadType={thread?.revisionThreadType ?? "local"}
                      onAskAboutThis={(selection) =>
                        openSelectionBranch(nestedSelection(selection, message), "ask")
                      }
                      onReviseThis={(selection) =>
                        openSelectionBranch(nestedSelection(selection, message), "revise")
                      }
                      onCreateBranch={(selection) =>
                        openSelectionBranch(nestedSelection(selection, message), "branch")
                      }
                      onAddNote={(selection) => handleNestedNote(selection, message)}
                      onMergeSelection={(selection) =>
                        requestMergeFromSelection(nestedSelection(selection, message))
                      }
                    />
                  ))}
                  {showLocalThinking && (
                    <article className="rounded-lg border border-line bg-white p-3 text-sm font-semibold leading-6 text-muted shadow-sm">
                      <div className="flex items-center gap-2">
                        <Sparkles size={17} className="animate-pulse text-atlasPurple" />
                        Assistant is thinking...
                      </div>
                    </article>
                  )}
                </div>
              )}

              {!isDeleted && !isHidden && threadMessages.length === 0 && !showLocalThinking && (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm text-muted">
                  No local answer yet.
                </div>
              )}

              {!isDeleted && !isHidden && isActivePanel && isGeneratingComparison && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-6 text-atlasBlue">
                  <div className="flex items-center gap-2">
                    <Sparkles size={17} className="animate-pulse" />
                    Generating comparison map...
                  </div>
                </div>
              )}

              {!isDeleted && !isHidden && threadMessages.length > 0 && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-slate-700">
                  <div className="mb-1 flex items-center gap-2 font-bold text-atlasBlue">
                    <Sparkles size={17} />
                    Revision Suggestion
                  </div>
                  {thread && latestAssistantMessage ? (
                    <DocumentAnswerRenderer
                      answerId={`${thread.id}-revision-suggestion`}
                      text={revisionSuggestionText}
                      toolbarMode="local_answer"
                      source={{
                        conversationId: latestAssistantMessage.sessionId,
                        sourceType: "message",
                        sourceId:
                          latestAssistantMessage.revisionMessageId ??
                          latestAssistantMessage.id,
                        sourceMessageId:
                          latestAssistantMessage.revisionMessageId ??
                          latestAssistantMessage.id,
                        sourceAnswerId:
                          latestAssistantMessage.revisionMessageId ??
                          latestAssistantMessage.id,
                        sourceLocalThreadId: thread.revisionLocalThreadId,
                        parentSelectionId: thread.sourceSelectionId,
                        parentLocalSelectionId: thread.sourceLocalSelectionId,
                        sourceThreadType: thread.revisionThreadType ?? "local"
                      }}
                      onAskAboutThis={(selection) =>
                        openSelectionBranch(
                          nestedSelection(selection, latestAssistantMessage),
                          "ask"
                        )
                      }
                      onReviseThis={(selection) =>
                        openSelectionBranch(
                          nestedSelection(selection, latestAssistantMessage),
                          "revise"
                        )
                      }
                      onCreateBranch={(selection) =>
                        openSelectionBranch(
                          nestedSelection(selection, latestAssistantMessage),
                          "branch"
                        )
                      }
                      onAddNote={(selection) =>
                        handleNestedNote(selection, latestAssistantMessage)
                      }
                      onMergeSelection={(selection) =>
                        requestMergeFromSelection(
                          nestedSelection(selection, latestAssistantMessage)
                        )
                      }
                    />
                  ) : (
                    revisionSuggestionText
                  )}
                </div>
              )}

              {relatedRevisionNotes.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm leading-6 text-slate-700">
                  <div className="mb-2 flex items-center gap-2 font-bold text-amber-900">
                    <MessageSquarePlus size={17} />
                    Related Notes
                  </div>
                  <div className="space-y-2">
                    {relatedRevisionNotes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-md border border-amber-200 bg-white px-3 py-2"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-800">
                          <span>{note.scopeType ?? note.scope}</span>
                          <span>{note.sourceType ?? "manual_note"}</span>
                          <span>{note.status}</span>
                        </div>
                        <div className="line-clamp-3 text-slate-700">
                          {note.status === "deleted"
                            ? "Deleted note tombstone"
                            : note.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">
              Select a sentence anchor
            </div>
          )}
        </div>

        {shouldShowContextNotesPanel && (
          <div className="border-t border-line bg-amber-50/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <MessageSquarePlus size={17} />
                Context Notes
              </div>
              {!contextNotesOpen && (
                <button
                  onClick={() => setContextNotesOpen(true)}
                  className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                >
                  Add Context Note
                </button>
              )}
            </div>

            {contextNotesOpen && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-white p-2">
                <textarea
                  ref={contextNoteInputRef}
                  value={annotationText}
                  onChange={(event) => setAnnotationText(event.target.value)}
                  className="min-h-20 w-full resize-none rounded-md border border-amber-100 bg-amber-50/30 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500"
                  placeholder="Add an instruction or note for future generation..."
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={cancelContextNote}
                    className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitAnnotation}
                    disabled={!annotationText.trim()}
                    className="h-8 rounded-md bg-amber-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}

            {anchorAnnotations.length > 0 ? (
              <div className="max-h-28 space-y-2 overflow-auto pr-1">
                {anchorAnnotations.map((annotation) => (
                  <div
                    key={annotation.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span className="min-w-0 leading-5">{annotation.content}</span>
                    <button
                      onClick={() => deleteAnnotation(annotation.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded text-atlasRed hover:bg-red-50"
                      title="Delete context note"
                      aria-label="Delete context note"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              !contextNotesOpen && (
                <div className="rounded-md border border-dashed border-amber-200 bg-white/70 px-3 py-2 text-sm text-amber-800">
                  No context notes saved for this selection.
                </div>
              )
            )}
          </div>
        )}

        {thread && isActivePanel && (
          <ThreadActionBar
            disabled={false}
            noteActionsEnabled
            onKeep={() => keepAsNote(thread.id)}
            onAddContextNote={() => setContextNotesOpen(true)}
            onMerge={() => requestMerge(thread.id)}
            onDiscard={() => discardThread(thread.id)}
            onDelete={() => setDeleteOpen(true)}
          />
        )}
      </div>

      {thread && isActivePanel && (
        <DeleteAnswerDialog
          open={deleteOpen}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            deleteAnswer(thread.id);
            setDeleteOpen(false);
          }}
        />
      )}
    </section>
  );
}
