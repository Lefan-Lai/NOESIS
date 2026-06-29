import type { Anchor, AnswerBlock } from "./document";
import type { Annotation, ThreadMessage } from "./thread";

export type BuildContextParams = {
  documentId: string;
  activeVersionNodeId: string;
  anchorId?: string;
  purpose:
    | "local_question"
    | "revision"
    | "argument_comparison"
    | "merge"
    | "general_followup";
};

export type ContextItem =
  | {
      id: string;
      type: "document_block";
      sourceId: string;
      text: string;
      block: AnswerBlock;
      included: boolean;
      reason: string;
    }
  | {
      id: string;
      type: "thread_message";
      sourceId: string;
      text: string;
      message: ThreadMessage;
      anchor?: Anchor;
      included: boolean;
      reason: string;
    }
  | {
      id: string;
      type: "annotation";
      sourceId: string;
      text: string;
      annotation: Annotation;
      anchor?: Anchor;
      included: boolean;
      reason: string;
    };

export type LLMContext = {
  documentId: string;
  activeVersionNodeId: string;
  activePath: string[];
  items: ContextItem[];
};

export type ContextPreview = {
  includedItems: ContextItem[];
  excludedItems: ContextItem[];
  tokenEstimate: number;
};
