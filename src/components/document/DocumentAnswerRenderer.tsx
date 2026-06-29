"use client";

import { useRef, useState } from "react";
import { GitBranchPlus, MessageSquare, PencilLine, StickyNote } from "lucide-react";

export type TextSelectionDraft = {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
};

type ToolbarPosition = {
  top: number;
  left: number;
};

type DocumentAnswerRendererProps = {
  answerId: string;
  text: string;
  onAskAboutThis: (selection: TextSelectionDraft) => void;
  onReviseThis: (selection: TextSelectionDraft) => void;
  onCreateBranch: (selection: TextSelectionDraft) => void;
  onAddNote: (selection: TextSelectionDraft) => void;
};

function selectionOffsets(root: HTMLElement, range: Range, selectedText: string) {
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);

  const startOffset = beforeRange.toString().length;
  const endOffset = startOffset + selectedText.length;
  const fullText = root.textContent ?? "";

  return {
    startOffset,
    endOffset,
    contextBefore: fullText.slice(Math.max(0, startOffset - 30), startOffset),
    contextAfter: fullText.slice(endOffset, endOffset + 30)
  };
}

export function DocumentAnswerRenderer({
  answerId,
  text,
  onAskAboutThis,
  onReviseThis,
  onCreateBranch,
  onAddNote
}: DocumentAnswerRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TextSelectionDraft | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);

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

    const selectedText = activeSelection.toString().trim();

    if (!selectedText || activeSelection.rangeCount === 0) {
      clearToolbar();
      return;
    }

    const range = activeSelection.getRangeAt(0);

    if (!root.contains(range.commonAncestorContainer)) {
      clearToolbar();
      return;
    }

    const offsets = selectionOffsets(root, range, selectedText);
    const rect = range.getBoundingClientRect();

    setSelection({
      selectedText,
      ...offsets
    });
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
        className="select-text whitespace-pre-wrap text-[15px] leading-8 text-slate-800"
      >
        {text}
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
            onClick={() => run(onAskAboutThis)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
          >
            <MessageSquare size={14} />
            Ask
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(onReviseThis)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
          >
            <PencilLine size={14} />
            Revise
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(onCreateBranch)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-atlasBlue"
          >
            <GitBranchPlus size={14} />
            Branch
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(onAddNote)}
            className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700"
          >
            <StickyNote size={14} />
            Note
          </button>
        </div>
      )}
    </>
  );
}
