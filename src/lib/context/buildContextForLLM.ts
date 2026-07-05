import type { ContextItem, ContextPreview, LLMContext, BuildContextParams } from "@/types/context";
import type { Anchor, Document, VersionSnapshot } from "@/types/document";
import type { Annotation, LocalThread, ThreadMessage } from "@/types/thread";
import type { VersionNode } from "@/types/version";
import { computeActivePath } from "@/lib/version/computeActivePath";
import { getBlocksVisibleAtVersion } from "@/lib/version/getBlocksVisibleAtVersion";
import { canIncludeMessageInContext } from "./canIncludeMessageInContext";

export type ContextBuilderState = {
  documents: Record<string, Document>;
  anchors: Record<string, Anchor>;
  threads: Record<string, LocalThread>;
  messages: Record<string, ThreadMessage>;
  annotations?: Record<string, Annotation>;
  versionNodes: Record<string, VersionNode>;
  snapshots: Record<string, VersionSnapshot>;
};

function exclusionReason(
  message: ThreadMessage,
  thread: LocalThread,
  activePath: string[]
) {
  if (!activePath.includes(thread.createdInVersionNodeId)) {
    return "Thread was created outside the active version path.";
  }

  if (thread.status === "deleted") {
    return "Thread is deleted.";
  }

  if (thread.status === "discarded") {
    return "Thread is discarded and excluded by default.";
  }

  if (thread.contextPolicy === "exclude") {
    return "Thread context policy excludes it.";
  }

  if (message.contentState === "deleted") {
    return "Message content is deleted.";
  }

  if (!message.includeInContext) {
    return "Message opted out of context.";
  }

  return "Included by active path and context policy.";
}

function canIncludeAnnotationInContext(
  annotation: Annotation,
  activePath: string[]
) {
  if (!activePath.includes(annotation.createdInVersionNodeId)) {
    return false;
  }

  if (annotation.status === "deleted") {
    return false;
  }

  if (annotation.contextPolicy === "exclude") {
    return false;
  }

  if (!annotation.includeInContext) {
    return false;
  }

  return true;
}

function annotationReason(annotation: Annotation, activePath: string[]) {
  if (!activePath.includes(annotation.createdInVersionNodeId)) {
    return "Annotation was created outside the active version path.";
  }

  if (annotation.status === "deleted") {
    return "Annotation is deleted.";
  }

  if (annotation.contextPolicy === "exclude") {
    return "Annotation context policy excludes it.";
  }

  if (!annotation.includeInContext) {
    return "Annotation opted out of context.";
  }

  return "Included as sentence annotation on the active version path.";
}

export function buildContextForLLM(
  params: BuildContextParams,
  state: ContextBuilderState
): LLMContext {
  const document = state.documents[params.documentId];

  if (!document) {
    return {
      documentId: params.documentId,
      activeVersionNodeId: params.activeVersionNodeId,
      activePath: [],
      items: []
    };
  }

  const activePath = computeActivePath(
    state.versionNodes,
    document.rootVersionNodeId,
    params.activeVersionNodeId
  );
  const visibleBlocks = getBlocksVisibleAtVersion(
    state,
    params.documentId,
    document.rootVersionNodeId,
    params.activeVersionNodeId
  );

  const blockItems: ContextItem[] = visibleBlocks.map((block) => ({
    id: `ctx-block-${block.id}`,
    type: "document_block",
    sourceId: block.id,
    text: block.text,
    block,
    included: true,
    reason: "Visible in the active document snapshot."
  }));

  const messageItems: ContextItem[] = Object.values(state.messages)
    .flatMap((message): ContextItem[] => {
      const thread = state.threads[message.threadId];

      if (!thread || thread.documentId !== params.documentId) {
        return [];
      }

      const anchor = state.anchors[thread.anchorId];
      const included = canIncludeMessageInContext(message, thread, activePath);

      return [{
        id: `ctx-message-${message.id}`,
        type: "thread_message" as const,
        sourceId: message.id,
        text: message.content,
        message,
        anchor,
        included,
        reason: exclusionReason(message, thread, activePath)
      }];
    });

  const annotationItems: ContextItem[] = Object.values(state.annotations ?? {})
    .filter((annotation) => annotation.documentId === params.documentId)
    .map((annotation) => {
      const anchor = state.anchors[annotation.anchorId];
      const included = canIncludeAnnotationInContext(annotation, activePath);

      return {
        id: `ctx-annotation-${annotation.id}`,
        type: "annotation" as const,
        sourceId: annotation.id,
        text: annotation.content,
        annotation,
        anchor,
        included,
        reason: annotationReason(annotation, activePath)
      };
    });

  return {
    documentId: params.documentId,
    activeVersionNodeId: params.activeVersionNodeId,
    activePath,
    items: [...blockItems, ...messageItems, ...annotationItems]
  };
}

export function buildContextPreview(
  params: BuildContextParams,
  state: ContextBuilderState
): ContextPreview {
  const context = buildContextForLLM(params, state);
  const includedItems = context.items.filter((item) => item.included);
  const excludedItems = context.items.filter((item) => !item.included);
  const tokenEstimate = Math.ceil(
    includedItems.reduce((total, item) => total + item.text.length, 0) / 4
  );

  return {
    includedItems,
    excludedItems,
    tokenEstimate
  };
}
