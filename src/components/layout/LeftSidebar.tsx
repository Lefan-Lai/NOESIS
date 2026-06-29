"use client";

import { useMemo } from "react";
import { Filter, Home, Search, ShieldCheck } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { getBlocksVisibleAtVersion } from "@/lib/version/getBlocksVisibleAtVersion";
import type { AnswerBlock } from "@/types/document";

type OutlineItem = {
  id: string;
  label: string;
  title: string;
  children: Array<{
    id: string;
    label: string;
    title: string;
  }>;
};

function summarizeBlock(block: AnswerBlock) {
  const text = block.summary || block.text;

  return text.length > 54 ? `${text.slice(0, 51)}...` : text;
}

function buildOutline(blocks: AnswerBlock[]): OutlineItem[] {
  const outline: OutlineItem[] = [];
  let paragraphCount = 0;
  let sentenceCount = 0;
  let current: OutlineItem | null = null;

  for (const block of blocks) {
    if (block.blockType === "heading") {
      paragraphCount += 1;
      current = {
        id: block.id,
        label: `P${paragraphCount}`,
        title: summarizeBlock(block),
        children: []
      };
      outline.push(current);
      continue;
    }

    if (block.blockType === "sentence") {
      sentenceCount += 1;

      if (!current) {
        paragraphCount += 1;
        current = {
          id: `virtual-section-${paragraphCount}`,
          label: `P${paragraphCount}`,
          title: "Generated Answer",
          children: []
        };
        outline.push(current);
      }

      current.children.push({
        id: block.id,
        label: `S${sentenceCount}`,
        title: summarizeBlock(block)
      });
    }
  }

  return outline;
}

export function LeftSidebar() {
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const annotations = useAnswerAtlasStore((state) => state.annotations);
  const documents = useAnswerAtlasStore((state) => state.documents);
  const currentDocumentId = useAnswerAtlasStore((state) => state.currentDocumentId);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const snapshots = useAnswerAtlasStore((state) => state.snapshots);
  const versionNodes = useAnswerAtlasStore((state) => state.versionNodes);
  const selectedAnchorId = useAnswerAtlasStore((state) => state.selectedAnchorId);
  const selectSentence = useAnswerAtlasStore((state) => state.selectSentence);
  const selectedBlockId = selectedAnchorId ? anchors[selectedAnchorId]?.blockId : null;
  const currentDocument = currentDocumentId ? documents[currentDocumentId] : null;
  const blocks = useMemo(() => {
    if (!currentDocument || !activeVersionNodeId) {
      return [];
    }

    return getBlocksVisibleAtVersion(
      { snapshots, versionNodes },
      currentDocument.id,
      currentDocument.rootVersionNodeId,
      activeVersionNodeId
    );
  }, [activeVersionNodeId, currentDocument, snapshots, versionNodes]);
  const outline = useMemo(() => buildOutline(blocks), [blocks]);

  function getStatus(blockId: string) {
    if (blockId === selectedBlockId) {
      return "selected";
    }

    const anchor = Object.values(anchors).find((item) => item.blockId === blockId);
    const thread = anchor
      ? Object.values(threads).find((item) => item.anchorId === anchor.id)
      : null;

    if (!thread) {
      const hasAnnotation = Object.values(annotations).some(
        (annotation) =>
          annotation.blockId === blockId && annotation.status !== "deleted"
      );

      return hasAnnotation ? "annotation" : "none";
    }

    return thread.status;
  }

  function scrollToBlock(blockId: string) {
    window.requestAnimationFrame(() => {
      (document.getElementById(`block-${blockId}`) ??
        document.getElementById("answer-body"))?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }

  function handleSentenceSelect(blockId: string) {
    selectSentence(blockId);
    scrollToBlock(blockId);
  }

  return (
    <aside className="row-span-1 overflow-hidden bg-white/35 max-[1280px]:row-span-1 max-[900px]:h-[340px]">
      <div className="flex h-full flex-col p-3">
        <button className="mb-2 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Home size={17} />
          Home
        </button>
        <button className="mb-4 flex h-10 items-center justify-between rounded-md bg-blue-50 px-3 text-sm font-semibold text-atlasBlue">
          <span className="flex items-center gap-2">
            <ShieldCheck size={17} />
            All Threads
          </span>
          <span className="h-2 w-2 rounded-full bg-atlasBlue" />
        </button>

        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-ink">Contents</h2>
          <div className="flex items-center gap-2 text-slate-600">
            <Search size={16} />
            <Filter size={16} />
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-auto pr-1">
          {outline.length === 0 && (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm leading-6 text-muted">
              Generate an answer first. The outline will be summarized from the
              model response.
            </div>
          )}

          {outline.map((item) => (
            <div key={item.id} className="mb-1">
              <button
                onClick={() => scrollToBlock(item.id)}
                className={`flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition ${
                  item.children.some((child) => child.id === selectedBlockId)
                    ? "bg-slate-100 text-atlasBlue"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="w-7 shrink-0 font-semibold text-slate-800">
                  {item.label}
                </span>
                <span className="leading-snug">{item.title}</span>
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <h2 className="mb-2 text-sm font-bold text-ink">Document Map</h2>
          <div className="bg-white/40 p-3">
            <div className="space-y-2">
              {outline.length === 0 ? (
                <>
                  <div className="h-2 w-24 rounded bg-slate-200" />
                  <div className="h-2 w-32 rounded bg-slate-100" />
                  <div className="rounded border border-dashed border-line p-3 text-xs text-muted">
                    Empty
                  </div>
                </>
              ) : (
                outline.slice(0, 5).map((item, index) => (
                  <div
                    key={item.id}
                    className={`h-2 rounded ${
                      index === 0 ? "w-full bg-blue-100" : "bg-slate-100"
                    }`}
                    style={{ width: `${Math.max(42, 92 - index * 10)}%` }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
