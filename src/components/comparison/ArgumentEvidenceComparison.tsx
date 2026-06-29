"use client";

import { useMemo, useState } from "react";
import { Bot, Maximize2, MoreHorizontal, Send, UserRound } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { getComparisonForAnchor } from "@/lib/comparison/buildArgumentComparison";
import { LayeredComparisonBoard } from "./LayeredComparisonBoard";
import { LayeredComparisonScaffoldView } from "./LayeredComparisonScaffoldView";
import {
  ViewModeToggle,
  type ComparisonViewMode
} from "./ViewModeToggle";

function getAnchorLabel(blockId?: string) {
  return blockId ? blockId.toUpperCase() : "-";
}

export function ArgumentEvidenceComparison() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [treeQuestion, setTreeQuestion] = useState("");
  const [viewMode, setViewMode] = useState<ComparisonViewMode>("board");
  const comparisons = useAnswerAtlasStore((state) => state.comparisons);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const selectedAnchorId = useAnswerAtlasStore((state) => state.selectedAnchorId);
  const comparison = getComparisonForAnchor(comparisons, selectedAnchorId);
  const activeTreeWindowId = useAnswerAtlasStore(
    (state) => state.activeTreeWindowId
  );
  const windows = useAnswerAtlasStore((state) => state.windows);
  const sessions = useAnswerAtlasStore((state) => state.sessions);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const availableModels = useAnswerAtlasStore((state) => state.availableModels);
  const setWindowModel = useAnswerAtlasStore((state) => state.setWindowModel);
  const askTreeQuestion = useAnswerAtlasStore((state) => state.askTreeQuestion);
  const isSendingWindowMessage = useAnswerAtlasStore(
    (state) => state.isSendingWindowMessage
  );
  const selectedAnchor = selectedAnchorId ? anchors[selectedAnchorId] : null;
  const isComparisonExpanded = useAnswerAtlasStore(
    (state) => state.isComparisonExpanded
  );
  const toggleComparisonExpanded = useAnswerAtlasStore(
    (state) => state.toggleComparisonExpanded
  );
  const treeWindow =
    (activeTreeWindowId ? windows[activeTreeWindowId] : null) ??
    (comparison ? windows[`window-tree-${comparison.id}`] : null);
  const treeSession = treeWindow
    ? sessions[treeWindow.conversationSessionId]
    : null;
  const treeMessages = useMemo(
    () =>
      Object.values(conversationMessages)
        .filter(
          (message) =>
            message.sessionId === treeSession?.id &&
            message.contentState !== "deleted"
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [conversationMessages, treeSession?.id]
  );

  async function submitTreeQuestion() {
    if (!treeQuestion.trim()) {
      return;
    }

    await askTreeQuestion(treeQuestion);
    setTreeQuestion("");
  }

  return (
    <section
      className={`panel min-h-0 overflow-hidden rounded-lg max-[900px]:h-[560px] ${
        isComparisonExpanded
          ? "fixed bottom-[300px] left-4 right-4 top-20 z-40"
          : ""
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Layered Comparison Board
            </h2>
            <p className="text-sm text-muted">Original vs Revised</p>
          </div>
          <div className="flex items-center gap-1">
            {comparison && (
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            )}
            {treeWindow && (
              <select
                value={treeWindow.modelConfigId}
                onChange={(event) =>
                  setWindowModel(treeWindow.id, event.target.value)
                }
                className="h-8 max-w-[160px] rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-700"
                title="Tree window model"
                aria-label="Tree window model"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model === "gpt-5.5" ? "GPT-5.5" : model}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={toggleComparisonExpanded}
              className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-700"
              title="Expand"
              aria-label="Expand"
            >
              <Maximize2 size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((value) => !value)}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
                title="More"
                aria-label="More"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-50 w-48 rounded-lg border border-line bg-white p-1 text-sm shadow-panel">
                  <button className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-50">
                    Regenerate comparison
                  </button>
                  <button className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-50">
                    View source context
                  </button>
                  <button className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-50">
                    Export map
                  </button>
                  <button className="w-full rounded-md px-3 py-2 text-left text-atlasRed hover:bg-red-50">
                    Clear comparison
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4">
          {comparison ? (
            <div className="space-y-4">
              {viewMode === "board" ? (
                <LayeredComparisonBoard board={comparison.board} />
              ) : (
                <LayeredComparisonScaffoldView scaffold={comparison.scaffold} />
              )}
              <div className="rounded-lg border border-line bg-slate-50/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-ink">
                    Board chat
                  </div>
                  <div className="text-xs font-semibold text-muted">
                    {treeSession?.id ?? "no board session"}
                  </div>
                </div>
                <div className="mb-3 max-h-48 space-y-2 overflow-auto">
                  {treeMessages.length === 0 ? (
                    <div className="rounded-md border border-dashed border-line bg-white p-3 text-sm text-muted">
                      Ask about semantic changes, risks, or merge consequences.
                    </div>
                  ) : (
                    treeMessages.map((message) => {
                      const isUser = message.role === "user";
                      const Icon = isUser ? UserRound : Bot;

                      return (
                        <article
                          key={message.id}
                          className="rounded-md border border-line bg-white px-3 py-2 text-sm leading-6"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 font-semibold text-ink">
                            <span className="flex items-center gap-2">
                              <Icon size={15} className={isUser ? "text-atlasBlue" : "text-atlasPurple"} />
                              {isUser ? "You" : "Board Assistant"}
                            </span>
                            {!isUser && message.modelName && (
                              <span className="rounded bg-purple-50 px-2 py-0.5 text-xs text-atlasPurple">
                                {message.modelName}
                              </span>
                            )}
                          </div>
                          <div className="whitespace-pre-line text-slate-700">
                            {message.content}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={treeQuestion}
                    onChange={(event) => setTreeQuestion(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-atlasBlue"
                    placeholder="Ask about this comparison board..."
                  />
                  <button
                    onClick={submitTreeQuestion}
                    disabled={
                      !treeWindow ||
                      !treeQuestion.trim() ||
                      Boolean(isSendingWindowMessage[treeWindow.id])
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-atlasBlue text-white disabled:opacity-50"
                    title="Send"
                    aria-label="Send"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">
              Ask a local question on a selected passage to generate comparison.
            </div>
          )}
        </div>

        <div className="grid h-12 grid-cols-[1fr_120px_120px] items-center gap-3 border-t border-line px-4 text-sm">
          <div className="truncate font-semibold text-slate-700">
            Selected Anchor Sentence:{" "}
            <span className="text-ink">
              {selectedAnchor?.anchorType === "text_selection"
                ? "Selection"
                : getAnchorLabel(selectedAnchor?.blockId)}
            </span>
          </div>
          <div className="text-center text-muted">
            Original:{" "}
            <span className="rounded bg-blue-50 px-2 py-1 font-bold text-atlasBlue">
              C0
            </span>
          </div>
          <div className="text-center text-muted">
            Revised:{" "}
            <span className="rounded bg-blue-50 px-2 py-1 font-bold text-atlasBlue">
              C1
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
