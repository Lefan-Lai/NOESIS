"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, StickyNote } from "lucide-react";
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

type HighlightSet = {
  add: (range: Range) => void;
  delete: (range: Range) => void;
};

type HighlightRegistry = {
  get: (name: string) => HighlightSet | undefined;
  set: (name: string, highlight: HighlightSet) => void;
};

type HighlightConstructor = new (...ranges: Range[]) => HighlightSet;

function exactTextRange(
  root: HTMLElement,
  snippet?: string,
  preferredOffset?: number
) {
  if (!snippet) {
    return null;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  const fullText = nodes.map((node) => node.data).join("");
  const matches: number[] = [];
  let match = fullText.indexOf(snippet);

  while (match >= 0) {
    matches.push(match);
    match = fullText.indexOf(snippet, match + 1);
  }

  if (matches.length === 0) {
    return null;
  }

  const start = typeof preferredOffset === "number"
    ? matches.reduce((best, candidate) =>
        Math.abs(candidate - preferredOffset) < Math.abs(best - preferredOffset)
          ? candidate
          : best
      )
    : matches[0];
  const end = start + snippet.length;
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const node of nodes) {
    const nodeEnd = cursor + node.data.length;

    if (!startNode && start >= cursor && start <= nodeEnd) {
      startNode = node;
      startOffset = start - cursor;
    }

    if (!endNode && end >= cursor && end <= nodeEnd) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }

    cursor = nodeEnd;
  }

  if (!startNode || !endNode) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  return { range, element: startNode.parentElement };
}

function addExactReviewHighlight(
  root: HTMLElement,
  snippet: string | undefined,
  preferredOffset: number | undefined,
  tone: "original" | "revised"
) {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const HighlightClass = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  const match = exactTextRange(root, snippet, preferredOffset);

  if (!registry || !HighlightClass || !match) {
    return null;
  }

  const name = tone === "original"
    ? "noesis-review-original"
    : "noesis-review-revised";
  const highlight = registry.get(name) ?? new HighlightClass();

  highlight.add(match.range);
  registry.set(name, highlight);

  return {
    element: match.element,
    clear: () => highlight.delete(match.range)
  };
}

export function DocumentAnswerRenderer({
  answerId,
  text,
  source,
  toolbarMode = "main_answer",
  onAskAboutThis,
  onAddNote
}: DocumentAnswerRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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

    if (!activeReviewFocus) {
      return;
    }

    const tone = toolbarMode === "main_answer" ? "original" : "revised";
    const belongsToSource = tone === "original"
      ? !activeReviewFocus.sourceMessageId ||
        activeReviewFocus.sourceMessageId === source.sourceMessageId
      : !activeReviewFocus.revisedThreadId ||
        activeReviewFocus.revisedThreadId === source.sourceLocalThreadId;

    if (!belongsToSource) {
      return;
    }

    const snippet =
      tone === "original"
        ? activeReviewFocus.originalText
        : activeReviewFocus.revisedText;
    const preferredOffset = tone === "original"
      ? activeReviewFocus.originalStartOffset
      : activeReviewFocus.revisedStartOffset;
    const target = addExactReviewHighlight(root, snippet, preferredOffset, tone);

    if (!target) {
      return;
    }

    target.element?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

    return target.clear;
  }, [
    activeReviewFocus,
    activeReviewFocus?.id,
    activeReviewFocus?.originalText,
    activeReviewFocus?.revisedText,
    activeReviewFocus?.originalStartOffset,
    activeReviewFocus?.revisedStartOffset,
    activeReviewFocus?.sourceMessageId,
    activeReviewFocus?.revisedThreadId,
    source.sourceLocalThreadId,
    source.sourceMessageId,
    text,
    toolbarMode
  ]);

  function clearToolbar() {
    setSelection(null);
    setPosition(null);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (target && toolbarRef.current?.contains(target)) {
        return;
      }

      clearToolbar();
    }

    function handleSelectionChange() {
      const activeSelection = document.getSelection();

      if (!activeSelection || activeSelection.isCollapsed) {
        clearToolbar();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

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
          ref={toolbarRef}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-blue-100 bg-white px-2 py-1 shadow-[0_14px_40px_rgba(15,23,42,0.18)]"
          style={{
            top: Math.max(72, position.top),
            left: position.left
          }}
        >
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(onAskAboutThis)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
            title={
              toolbarMode === "local_answer"
                ? "Ask a nested local question about this selected fragment."
                : "Ask a local question about this selected passage."
            }
          >
            <MessageSquare size={14} />
            Ask Locally
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(onAddNote)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700"
            title={
              toolbarMode === "local_answer"
                ? "Keep this selected local fragment as a scoped note."
                : "Add a context note for this selected passage."
            }
          >
            <StickyNote size={14} />
            Note
          </button>
        </div>
      )}
    </>
  );
}
