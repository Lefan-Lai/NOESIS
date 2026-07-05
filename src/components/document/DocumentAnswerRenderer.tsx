"use client";

import { useEffect, useRef, useState } from "react";
import {
  GitBranchPlus,
  GitMerge,
  MessageSquare,
  PencilLine,
  StickyNote
} from "lucide-react";
import { MarkdownText } from "@/components/MarkdownText";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import {
  readBrowserTextSelection,
  type BrowserTextSelectionPayload,
  type SelectionSourcePayload
} from "@/lib/selection/readTextSelection";

export type TextSelectionDraft = BrowserTextSelectionPayload & {
  createdFromWindowId?: string;
  sourceThreadId?: string;
};

type ToolbarPosition = {
  top: number;
  left: number;
};

type DocumentAnswerRendererProps = {
  answerId: string;
  text: string;
  source: SelectionSourcePayload;
  toolbarMode?: "main_answer" | "local_answer";
  onAskAboutThis: (selection: TextSelectionDraft) => void;
  onReviseThis: (selection: TextSelectionDraft) => void;
  onCreateBranch: (selection: TextSelectionDraft) => void;
  onAddNote: (selection: TextSelectionDraft) => void;
  onMergeSelection?: (selection: TextSelectionDraft) => void;
};

function normalizeReviewText(value: string) {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function importantWords(value: string) {
  return normalizeReviewText(value)
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 16);
}

function findLinkedReviewElement(root: HTMLElement, snippet?: string) {
  if (!snippet || normalizeReviewText(snippet).length < 6) {
    return null;
  }

  const normalizedSnippet = normalizeReviewText(snippet);
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, code"
    )
  );
  const directMatch = candidates.find((element) =>
    normalizeReviewText(element.textContent ?? "").includes(normalizedSnippet)
  );

  if (directMatch) {
    return directMatch;
  }

  const words = importantWords(snippet);

  if (words.length < 3) {
    return null;
  }

  return (
    candidates.find((element) => {
      const text = normalizeReviewText(element.textContent ?? "");
      const hits = words.filter((word) => text.includes(word)).length;

      return hits >= Math.min(5, Math.ceil(words.length * 0.55));
    }) ?? null
  );
}

function clearLinkedReviewHighlight(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("[data-review-linked-focus='true']")
    .forEach((element) => {
      element.removeAttribute("data-review-linked-focus");
      element.style.backgroundColor = "";
      element.style.boxShadow = "";
      element.style.borderRadius = "";
      element.style.paddingInline = "";
      element.style.scrollMargin = "";
      element.style.transition = "";
    });
}

function applyLinkedReviewHighlight(
  element: HTMLElement,
  tone: "original" | "revised"
) {
  const isOriginal = tone === "original";

  element.setAttribute("data-review-linked-focus", "true");
  element.style.backgroundColor = isOriginal
    ? "rgba(37, 99, 235, 0.10)"
    : "rgba(124, 58, 237, 0.11)";
  element.style.boxShadow = isOriginal
    ? "0 0 0 2px rgba(37, 99, 235, 0.24)"
    : "0 0 0 2px rgba(124, 58, 237, 0.24)";
  element.style.borderRadius = "8px";
  element.style.paddingInline = "4px";
  element.style.scrollMargin = "96px";
  element.style.transition = "background-color 160ms ease, box-shadow 160ms ease";
}

export function DocumentAnswerRenderer({
  answerId,
  text,
  source,
  toolbarMode = "main_answer",
  onAskAboutThis,
  onReviseThis,
  onCreateBranch,
  onAddNote,
  onMergeSelection
}: DocumentAnswerRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TextSelectionDraft | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const activeReviewFocus = useAnswerAtlasStore(
    (state) => state.activeReviewFocus
  );

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    clearLinkedReviewHighlight(root);

    if (!activeReviewFocus) {
      return;
    }

    const tone = toolbarMode === "main_answer" ? "original" : "revised";
    const snippet =
      tone === "original"
        ? activeReviewFocus.originalText
        : activeReviewFocus.revisedText;
    const target = findLinkedReviewElement(root, snippet);

    if (!target) {
      return;
    }

    applyLinkedReviewHighlight(target, tone);
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

    return () => clearLinkedReviewHighlight(root);
  }, [
    activeReviewFocus,
    activeReviewFocus?.id,
    activeReviewFocus?.originalText,
    activeReviewFocus?.revisedText,
    text,
    toolbarMode
  ]);

  function clearToolbar() {
    setSelection(null);
    setPosition(null);
  }

  function handleMouseUp() {
    const root = rootRef.current;
    const activeSelection = window.getSelection();

    if (!root || !activeSelection || activeSelection.isCollapsed) {
      clearToolbar();
      return;
    }

    if (activeSelection.rangeCount === 0) {
      clearToolbar();
      return;
    }

    const range = activeSelection.getRangeAt(0);

    if (!root.contains(range.commonAncestorContainer)) {
      clearToolbar();
      return;
    }

    const payload = readBrowserTextSelection(root, source);

    if (!payload) {
      clearToolbar();
      return;
    }

    const rect = range.getBoundingClientRect();

    setSelection(payload);
    setPosition({
      top: rect.top + window.scrollY - 44,
      left: rect.left + window.scrollX + rect.width / 2
    });
  }

  function run(action: (selection: TextSelectionDraft) => void) {
    if (!selection) {
      return;
    }

    action(selection);
    window.getSelection()?.removeAllRanges();
    clearToolbar();
  }

  return (
    <>
      <div
        ref={rootRef}
        id={`answer-${answerId}`}
        onMouseUp={handleMouseUp}
        className="select-text text-[15px] text-slate-800"
      >
        <MarkdownText text={text} />
      </div>

      {selection && position && (
        <div
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-blue-100 bg-white px-2 py-1 shadow-[0_14px_40px_rgba(15,23,42,0.18)]"
          style={{
            top: Math.max(72, position.top),
            left: position.left
          }}
        >
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run(toolbarMode === "local_answer" ? onReviseThis : onAskAboutThis)
            }
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
          >
            {toolbarMode === "local_answer" ? (
              <PencilLine size={14} />
            ) : (
              <MessageSquare size={14} />
            )}
            {toolbarMode === "local_answer" ? "Revise" : "Ask Locally"}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run(toolbarMode === "local_answer" ? onCreateBranch : onReviseThis)
            }
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
          >
            {toolbarMode === "local_answer" ? (
              <GitBranchPlus size={14} />
            ) : (
              <PencilLine size={14} />
            )}
            {toolbarMode === "local_answer" ? "Branch" : "Open Local Window"}
          </button>
          {toolbarMode === "main_answer" && (
            <>
              <button
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(onCreateBranch)}
                disabled
                className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-400"
                title="Branch editing starts from local answer selections in Phase 3."
              >
                <GitBranchPlus size={14} />
                Branch
              </button>
              <button
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(onAddNote)}
                className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700"
                title="Add context note for this selection."
              >
                <StickyNote size={14} />
                Note
              </button>
            </>
          )}
          {toolbarMode === "local_answer" && (
            <>
              {onMergeSelection && (
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(onMergeSelection)}
                  className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-atlasPurple"
                  title="Create a merge proposal for this selected fragment."
                >
                  <GitMerge size={14} />
                  Merge
                </button>
              )}
              <button
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(onAddNote)}
                className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700"
                title="Keep selected fragment as scoped context note."
              >
                <StickyNote size={14} />
                Keep Note
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
