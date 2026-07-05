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

export type ContextSnapshotItem = {
  id: string;
  type: string;
  sourceId?: string;
  text: string;
  reason: string;
  included: boolean;
};

export type ContextSnapshot = {
  id: string;
  llmCallId: string;
  projectId: string;
  callType:
    | "main_conversation"
    | "local_window"
    | "comparison_generation"
    | "comparison_chat";
  purpose: BuildContextParams["purpose"] | "comparison_chat";
  model: string;
  windowId?: string;
  sessionId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  threadId?: string;
  threadType?: "main" | "local" | "nested_local" | "branch" | "comparison";
  comparisonId?: string;
  status?: "active" | "reconstructed" | "deleted";
  includedItems: ContextSnapshotItem[];
  excludedItems: ContextSnapshotItem[];
  compressedItems?: ContextSnapshotItem[];
  truncatedItems?: ContextSnapshotItem[];
  tokenEstimate: number;
  contextBuildStrategy?: "legacy" | "indexed" | "cached" | "reconstructed";
  contextRulesVersion?: string;
  cacheHit?: boolean;
  cacheKey?: string;
  cacheInvalidatedReason?: string;
  candidateCount?: number;
  includedCount?: number;
  excludedCount?: number;
  compressedCount?: number;
  truncatedCount?: number;
  tokenBudget?: number;
  tokenEstimateBefore?: number;
  tokenEstimateAfter?: number;
  buildLatencyMs?: number;
  retrievalLatencyMs?: number;
  rankingLatencyMs?: number;
  compressionLatencyMs?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type LLMCallRecord = {
  id: string;
  projectId: string;
  callType: ContextSnapshot["callType"];
  purpose: ContextSnapshot["purpose"];
  model: string;
  provider?: "openai" | "mock";
  modelProvider?: "openai" | "mock" | "unknown";
  status: "started" | "completed" | "failed";
  prompt: string;
  contextSnapshotId: string;
  inputMessageId?: string;
  windowId?: string;
  sessionId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  threadId?: string;
  threadType?: "main" | "local" | "nested_local" | "branch" | "comparison";
  comparisonId?: string;
  outputMessageId?: string;
  outputObjectId?: string;
  createdAt: string;
  completedAt: string;
  metadata?: Record<string, unknown>;
};
