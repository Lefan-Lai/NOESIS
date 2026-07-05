"use client";

import { useRef, useState } from "react";
import {
  GitBranchPlus,
  GitMerge,
  MessageSquare,
  PencilLine,
  StickyNote
} from "lucide-react";
import { MarkdownText } from "@/components/MarkdownText";
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
