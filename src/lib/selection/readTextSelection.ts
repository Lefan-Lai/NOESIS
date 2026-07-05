import type { TextSelectionModel } from "@/types/revision";

export type SelectionSourcePayload = {
  conversationId?: string;
  sourceType: TextSelectionModel["sourceType"];
  sourceId: string;
  sourceDocumentVersionId?: string;
  sourceMessageId?: string;
  sourceLocalThreadId?: string;
  sourceAnswerId?: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceThreadType?: "local" | "nested_local";
};

export type BrowserTextSelectionPayload = {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
  textHash: string;
} & SelectionSourcePayload;

export function hashSelectedText(input: {
  selectedText: string;
  startOffset?: number;
  endOffset?: number;
  sourceId?: string;
}) {
  const text = [
    input.sourceId ?? "",
    input.startOffset ?? "",
    input.endOffset ?? "",
    input.selectedText.replace(/\s+/g, " ").trim()
  ].join("|");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `sel-${(hash >>> 0).toString(36)}`;
}

export function readBrowserTextSelection(
  root: HTMLElement,
  source: SelectionSourcePayload
): BrowserTextSelectionPayload | null {
  const activeSelection = window.getSelection();

  if (!activeSelection || activeSelection.isCollapsed || activeSelection.rangeCount === 0) {
    return null;
  }

  const selectedText = activeSelection.toString().trim();

  if (!selectedText) {
    return null;
  }

  const range = activeSelection.getRangeAt(0);

  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);

  const startOffset = beforeRange.toString().length;
  const endOffset = startOffset + selectedText.length;
  const fullText = root.textContent ?? "";

  return {
    ...source,
    selectedText,
    startOffset,
    endOffset,
    contextBefore: fullText.slice(Math.max(0, startOffset - 80), startOffset),
    contextAfter: fullText.slice(endOffset, endOffset + 80),
    textHash: hashSelectedText({
      selectedText,
      startOffset,
      endOffset,
      sourceId: source.sourceId
    })
  };
}
