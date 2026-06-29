"use client";

import type { AnswerBlock } from "@/types/document";
import { SentenceAnchor } from "./SentenceAnchor";

type AnswerBlockRendererProps = {
  block: AnswerBlock;
  paragraphLabel?: string;
  sentenceLabel?: string;
};

export function AnswerBlockRenderer({
  block,
  paragraphLabel,
  sentenceLabel
}: AnswerBlockRendererProps) {
  if (block.blockType === "heading") {
    return (
      <div
        id={`block-${block.id}`}
        className="mt-5"
      >
        <h2 className="text-base font-bold text-ink">{block.text}</h2>
        {block.summary && (
          <p className="mt-1 text-xs leading-5 text-muted">{block.summary}</p>
        )}
      </div>
    );
  }

  return (
    <SentenceAnchor block={block} sentenceLabel={sentenceLabel ?? "S"} />
  );
}
