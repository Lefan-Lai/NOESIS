export type BlockType =
  | "heading"
  | "paragraph"
  | "sentence"
  | "claim"
  | "reason"
  | "evidence"
  | "example"
  | "limitation"
  | "conclusion";

export type Document = {
  id: string;
  title: string;
  rawText: string;
  rootVersionNodeId: string;
  activeVersionNodeId: string;
  createdAt: string;
  updatedAt: string;
};

export type AnswerBlock = {
  id: string;
  documentId: string;
  parentId?: string;
  blockType: BlockType;
  text: string;
  summary?: string;
  order: number;
  anchorable: boolean;
  createdInVersionNodeId: string;
  deletedInVersionNodeId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Anchor = {
  id: string;
  documentId: string;
  blockId?: string;
  selectedText: string;
  anchorType: "sentence" | "paragraph" | "claim" | "text_selection";
  startOffset?: number;
  endOffset?: number;
  contextBefore?: string;
  contextAfter?: string;
  createdFromWindowId?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  createdAt: string;
};

export type VersionSnapshot = {
  id: string;
  documentId: string;
  versionNodeId: string;
  blocks: AnswerBlock[];
  createdAt: string;
};
