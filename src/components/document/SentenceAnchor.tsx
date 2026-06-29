"use client";

import { Anchor as AnchorIcon } from "lucide-react";
import type { AnswerBlock } from "@/types/document";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

type SentenceAnchorProps = {
  block: AnswerBlock;
  sentenceLabel: string;
};

export function SentenceAnchor({ block, sentenceLabel }: SentenceAnchorProps) {
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const annotations = useAnswerAtlasStore((state) => state.annotations);
  const selectedAnchorId = useAnswerAtlasStore((state) => state.selectedAnchorId);
  const selectSentence = useAnswerAtlasStore((state) => state.selectSentence);
  const anchor = Object.values(anchors).find((item) => item.blockId === block.id);
  const selected = anchor?.id === selectedAnchorId;
  const thread = anchor
    ? Object.values(threads).find((item) => item.anchorId === anchor.id)
    : null;
  const annotationCount = Object.values(annotations).filter(
    (annotation) =>
      annotation.blockId === block.id && annotation.status !== "deleted"
  ).length;

  return (
    <div
      id={`block-${block.id}`}
      className={`group relative grid w-full grid-cols-[1fr_34px] items-start gap-2 rounded-md border px-3 py-2 text-left text-sm leading-6 transition ${
        selected
          ? "border-atlasBlue bg-blue-50 text-atlasBlue shadow-sm"
          : "border-transparent hover:border-blue-100 hover:bg-blue-50/50"
      }`}
    >
      <span>
        {block.text}
        {annotationCount > 0 && (
          <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
            {annotationCount} annotation
          </span>
        )}
        {(thread?.status === "branch_created" || thread?.status === "merged") && (
          <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-atlasBlue">
            {thread.status === "merged" ? "merged" : "branch"}
          </span>
        )}
      </span>
      <button
        onClick={() => selectSentence(block.id)}
        className={`grid h-8 w-8 place-items-center rounded-full border bg-white text-atlasBlue shadow-sm transition ${
          selected
            ? "border-atlasBlue opacity-100"
            : "border-blue-100 opacity-0 group-hover:opacity-100"
        }`}
        title="Open local thread"
        aria-label="Open local thread"
      >
        <AnchorIcon size={16} />
      </button>
    </div>
  );
}
