import type { ContextSnapshot, ContextSnapshotItem, LLMCallRecord } from "@/types/context";
import type {
  AnnotationModel,
  AnnotationScopeType,
  DocumentVersionModel,
  EventLogRecord,
  LocalSelectionModel,
  LocalThreadModel,
  MessageModel,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";
import { ContextSnapshotService } from "./ContextSnapshotService";
import { EventService } from "./EventService";

type CreateStartedLocalSendInput = {
  state: RevisionRepositoryState;
  projectId: string;
  localThreadId: string;
  question: string;
  model: string;
  windowId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  activeDocumentVersion?: DocumentVersionModel;
  now: string;
  suffix: string;
};

type CompleteLocalSendInput = {
  state: RevisionRepositoryState;
  projectId: string;
  localThreadId: string;
  question: string;
  answer: string;
  model: string;
  provider?: "openai" | "mock";
  llmCallId: string;
  contextSnapshotId: string;
  userMessageId: string;
  userTimelineNodeId: string;
  now: string;
  suffix: string;
};

function snapshotItem(params: ContextSnapshotItem): ContextSnapshotItem {
  return params;
}

function localThreadSummary(thread: LocalThreadModel) {
  return thread.payload?.selected_text?.toString() ??
    thread.payload?.summary?.toString() ??
    "";
}

function localSelectionSummary(selection?: LocalSelectionModel) {
  if (!selection) {
    return "";
  }

  return [
    selection.beforeContext,
    selection.selectedText,
    selection.afterContext
  ]
    .filter(Boolean)
    .join("");
}

function estimateTokens(items: ContextSnapshotItem[]) {
  return Math.ceil(
    items.reduce((total, item) => total + item.text.length, 0) / 4
  );
}

function annotationScopeType(annotation: AnnotationModel): AnnotationScopeType {
  if (annotation.scopeType) {
    return annotation.scopeType;
  }

  if (annotation.scope === "selected_text") {
    return "selected_text";
  }

  if (annotation.scope === "nested_local_thread") {
    return "nested_local_thread";
  }

  if (annotation.scope === "local_thread") {
    return "local_thread";
  }

  if (annotation.scope === "branch") {
    return "branch";
  }

  if (annotation.scope === "comparison") {
    return "comparison";
  }

  if (annotation.scope === "conversation") {
    return "conversation";
  }

  if (annotation.scope === "document") {
    return "document";
  }

  return "project";
}

function annotationScopeId(annotation: AnnotationModel) {
  return annotation.scopeId ?? annotation.scopeObjectId;
}

function annotationCanInclude(annotation: AnnotationModel) {
  return (
    annotation.status === "active" &&
    annotation.memoryPolicy !== "manual_only" &&
    annotation.memoryPolicy !== "excluded_by_default" &&
    annotation.memoryPolicy !== "never_include" &&
    annotation.includeInContext
  );
}

function includedAnnotationReason(params: {
  scopeType: AnnotationScopeType;
  scopeId?: string;
  localThread: LocalThreadModel;
  selection: TextSelectionModel;
  parentThreadIds: Set<string>;
}) {
  if (
    params.scopeType === "selected_text" &&
    params.scopeId === params.selection.id
  ) {
    return "because active_note_matching_parent_selection";
  }

  if (
    (params.scopeType === "local_thread" ||
      params.scopeType === "nested_local_thread") &&
    params.scopeId === params.localThread.id
  ) {
    return "because active_note_matching_current_local_thread";
  }

  if (
    (params.scopeType === "local_thread" ||
      params.scopeType === "nested_local_thread") &&
    params.scopeId &&
    params.parentThreadIds.has(params.scopeId)
  ) {
    return "because active_note_matching_parent_local_thread";
  }

  if (params.scopeType === "document") {
    return "because active_note_matching_document";
  }

  return "because active_note_matching_local_context";
}

function excludedAnnotationReason(scopeType: AnnotationScopeType) {
  if (scopeType === "selected_text") {
    return "because unrelated_selected_text_scope";
  }

  if (scopeType === "local_thread" || scopeType === "nested_local_thread") {
    return "because unrelated_local_thread_scope";
  }

  if (scopeType === "branch") {
    return "because branch_note_outside_branch_context";
  }

  if (scopeType === "comparison") {
    return "because comparison_note_not_active";
  }

  return "because annotation_scope_not_active_for_local_thread";
}

function annotationSnapshotItem(params: {
  annotation: AnnotationModel;
  reason: string;
  included: boolean;
}): ContextSnapshotItem {
  return snapshotItem({
    id: `ctx-annotation-${params.annotation.id}`,
    type: params.included ? "included_note" : "excluded_note",
    sourceId: params.annotation.id,
    text: params.annotation.status === "deleted" ? "" : params.annotation.content,
    reason: [
      params.reason,
      `scope=${annotationScopeType(params.annotation)}`,
      `scope_id=${annotationScopeId(params.annotation)}`,
      `source=${params.annotation.sourceType ?? "unknown"}`
    ].join(" | "),
    included: params.included
  });
}

function excludedStateReason(status: string) {
  if (status === "deleted") {
    return "because deleted_memory_never_included";
  }

  if (status === "discarded") {
    return "because discarded_excluded_by_default";
  }

  if (status === "inactive") {
    return "because inactive_path_excluded";
  }

  if (status === "superseded") {
    return "because superseded_answer_excluded";
  }

  if (status === "pending") {
    return "because pending_proposal_not_confirmed";
  }

  if (status === "cancelled") {
    return "because cancelled_object_excluded";
  }

  if (status === "failed") {
    return "because failed_generation_excluded";
  }

  if (status === "conflict") {
    return "because conflict_not_resolved";
  }

  return "because object_state_excluded";
}

function buildLocalContextSnapshot(input: {
  id: string;
  llmCallId: string;
  projectId: string;
  model: string;
  localThread: LocalThreadModel;
  selection: TextSelectionModel;
  prompt: string;
  windowId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  activeDocumentVersion?: DocumentVersionModel;
  state: RevisionRepositoryState;
  createdAt: string;
}): ContextSnapshot {
  const includedItems: ContextSnapshotItem[] = [];
  const excludedItems: ContextSnapshotItem[] = [];
  const isNestedLocal = input.localThread.threadType === "nested_local";
  const sourceDocumentVersion = input.selection.sourceDocumentVersionId
    ? input.state.documentVersions[input.selection.sourceDocumentVersionId]
    : undefined;
  const sourceVersionIsNotActive = Boolean(
    sourceDocumentVersion &&
      input.activeDocumentVersion &&
      sourceDocumentVersion.id !== input.activeDocumentVersion.id
  );
  const currentLocalSelection = input.localThread.parentLocalSelectionId
    ? input.state.localSelections[input.localThread.parentLocalSelectionId]
    : undefined;
  const parentThreadIds = new Set<string>();
  let parentThreadCursor = input.localThread.parentThreadId
    ? input.state.localThreads[input.localThread.parentThreadId]
    : undefined;

  while (parentThreadCursor) {
    parentThreadIds.add(parentThreadCursor.id);
    parentThreadCursor = parentThreadCursor.parentThreadId
      ? input.state.localThreads[parentThreadCursor.parentThreadId]
      : undefined;
  }
  const localMessages = Object.values(input.state.revisionMessages)
    .filter(
      (message) =>
        message.threadId === input.localThread.id &&
        message.status !== "deleted" &&
        message.includeInContext
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  includedItems.push(
    snapshotItem({
      id: `ctx-selection-${input.selection.id}`,
      type: "source_text_selection",
      sourceId: input.selection.id,
      text: input.selection.selectedText,
      reason: "Included source TextSelection for this local thread.",
      included: true
    })
  );

  if (isNestedLocal && currentLocalSelection) {
    includedItems.push(
      snapshotItem({
        id: `ctx-current-local-selection-${currentLocalSelection.id}`,
        type: "current_local_selection",
        sourceId: currentLocalSelection.id,
        text: currentLocalSelection.selectedText,
        reason: "Included current LocalSelection for this nested local thread.",
        included: true
      })
    );
    includedItems.push(
      snapshotItem({
        id: `ctx-selected-local-fragment-${currentLocalSelection.id}`,
        type: "selected_local_fragment",
        sourceId: currentLocalSelection.id,
        text: localSelectionSummary(currentLocalSelection),
        reason:
          "Included selected local fragment with nearby context for nested reasoning.",
        included: true
      })
    );

    const parentAnswer =
      input.state.revisionMessages[currentLocalSelection.sourceAnswerId] ??
      input.state.revisionMessages[currentLocalSelection.sourceMessageId];

    if (parentAnswer?.status === "active") {
      includedItems.push(
        snapshotItem({
          id: `ctx-parent-local-answer-${parentAnswer.id}`,
          type: "source_parent_local_answer",
          sourceId: parentAnswer.id,
          text: parentAnswer.content,
          reason: "Included source parent local assistant answer.",
          included: true
        })
      );
    }

    for (const parentThreadId of parentThreadIds) {
      const parentThread = input.state.localThreads[parentThreadId];

      if (parentThread?.status === "active") {
        includedItems.push(
          snapshotItem({
            id: `ctx-parent-local-thread-${parentThread.id}`,
            type: "parent_local_thread",
            sourceId: parentThread.id,
            text: localThreadSummary(parentThread),
            reason: "Included parent LocalThread chain for nested reasoning.",
            included: true
          })
        );
      }
    }
  }

  if (input.selection.beforeContext || input.selection.afterContext) {
    includedItems.push(
      snapshotItem({
        id: `ctx-selection-excerpt-${input.selection.id}`,
        type: "source_excerpt",
        sourceId: input.selection.sourceId,
        text: [
          input.selection.beforeContext,
          input.selection.selectedText,
          input.selection.afterContext
        ]
          .filter(Boolean)
          .join(""),
        reason: "Included surrounding source excerpt for the selected text.",
        included: true
      })
    );
  }

  if (input.activeDocumentVersion?.status === "active") {
    includedItems.push(
      snapshotItem({
        id: `ctx-document-version-${input.activeDocumentVersion.id}`,
        type: "active_document_version",
        sourceId: input.activeDocumentVersion.id,
        text: input.activeDocumentVersion.content,
        reason: [
          "because active_document_version_reference",
          `version_number=${input.activeDocumentVersion.versionNumber ?? "unknown"}`,
          `source_type=${input.activeDocumentVersion.sourceType ?? "unknown"}`
        ].join(" | "),
        included: true
      })
    );
  }

  if (sourceDocumentVersion) {
    includedItems.push(
      snapshotItem({
        id: `ctx-source-document-version-${sourceDocumentVersion.id}`,
        type: "source_document_version_metadata",
        sourceId: sourceDocumentVersion.id,
        text: JSON.stringify({
          source_document_version_id: sourceDocumentVersion.id,
          source_version_number: sourceDocumentVersion.versionNumber,
          source_type: sourceDocumentVersion.sourceType,
          source_version_is_not_active: sourceVersionIsNotActive
        }),
        reason: sourceVersionIsNotActive
          ? "because local_thread_source_version_is_not_active"
          : "because local_thread_source_version_is_active",
        included: true
      })
    );
  }

  includedItems.push(
    snapshotItem({
      id: `ctx-parent-selection-${input.selection.id}`,
      type: "parent_selection_metadata",
      sourceId: input.selection.id,
      text: JSON.stringify({
        sourceType: input.selection.sourceType,
        sourceId: input.selection.sourceId,
        sourceDocumentVersionId: input.selection.sourceDocumentVersionId,
        startOffset: input.selection.startOffset,
        endOffset: input.selection.endOffset,
        textHash: input.selection.textHash
      }),
      reason: "Included parent selection metadata for local reasoning.",
      included: true
    })
  );

  for (const message of localMessages.slice(-12)) {
    includedItems.push(
      snapshotItem({
        id: `ctx-local-message-${message.id}`,
        type: "local_thread_message",
        sourceId: message.id,
        text: `${message.role}: ${message.content}`,
        reason: "Included current local thread message history.",
        included: true
      })
    );
  }

  const includableAnnotationScopes = new Set<string>();
  includableAnnotationScopes.add(`selected_text:${input.selection.id}`);
  includableAnnotationScopes.add(`local_thread:${input.localThread.id}`);

  if (input.localThread.threadType === "nested_local") {
    includableAnnotationScopes.add(`nested_local_thread:${input.localThread.id}`);
  }

  for (const parentThreadId of parentThreadIds) {
    includableAnnotationScopes.add(`local_thread:${parentThreadId}`);
    includableAnnotationScopes.add(`nested_local_thread:${parentThreadId}`);
  }

  if (input.documentId) {
    includableAnnotationScopes.add(`document:${input.documentId}`);
  }

  if (input.activeDocumentVersion?.id) {
    includableAnnotationScopes.add(`document:${input.activeDocumentVersion.id}`);
  }

  for (const annotation of Object.values(input.state.annotations)) {
    const scopeType = annotationScopeType(annotation);
    const scopeId = annotationScopeId(annotation);
    const scopeKey = `${scopeType}:${scopeId}`;
    if (annotation.status === "deleted") {
      excludedItems.push(
        annotationSnapshotItem({
          annotation,
          reason: `${excludedStateReason(annotation.status)} | because deleted_memory_never_included`,
          included: false
        })
      );
      continue;
    }

    if (
      annotation.status === "discarded" ||
      annotation.memoryPolicy === "excluded_by_default"
    ) {
      excludedItems.push(
        annotationSnapshotItem({
          annotation,
          reason: `${excludedStateReason(annotation.status)} | because discarded_note_excluded_by_default`,
          included: false
        })
      );
      continue;
    }

    if (annotation.memoryPolicy === "never_include") {
      excludedItems.push(
        annotationSnapshotItem({
          annotation,
          reason: "because never_include_policy_excluded",
          included: false
        })
      );
      continue;
    }

    if (annotationCanInclude(annotation) && includableAnnotationScopes.has(scopeKey)) {
      includedItems.push(
        annotationSnapshotItem({
          annotation,
          reason: includedAnnotationReason({
            scopeType,
            scopeId,
            localThread: input.localThread,
            selection: input.selection,
            parentThreadIds
          }),
          included: true
        })
      );
      continue;
    }

    excludedItems.push(
      annotationSnapshotItem({
        annotation,
        reason: excludedAnnotationReason(scopeType),
        included: false
      })
    );
  }

  for (const thread of Object.values(input.state.localThreads)) {
    if (thread.id === input.localThread.id || parentThreadIds.has(thread.id)) {
      continue;
    }

    excludedItems.push(
      snapshotItem({
        id: `ctx-local-thread-${thread.id}`,
        type: "local_thread",
        sourceId: thread.id,
        text: thread.status === "deleted" ? "" : localThreadSummary(thread),
        reason:
          thread.status === "deleted"
            ? excludedStateReason(thread.status)
            : thread.status === "discarded"
              ? excludedStateReason(thread.status)
              : "Excluded because unrelated local threads stay local.",
        included: false
      })
    );
  }

  for (const branch of Object.values(input.state.revisionBranches)) {
    excludedItems.push(
      snapshotItem({
        id: `ctx-branch-${branch.id}`,
        type: "revision_branch",
        sourceId: branch.id,
        text: branch.status === "deleted" ? "" : branch.payload?.summary?.toString() ?? "",
        reason:
          branch.status === "deleted"
            ? excludedStateReason(branch.status)
            : branch.status === "discarded"
              ? excludedStateReason(branch.status)
              : "because unmerged_branch",
        included: false
      })
    );
  }

  for (const merge of Object.values(input.state.mergeRecords)) {
    const relatedToCurrentThread =
      merge.sourceLocalThreadId === input.localThread.id ||
      merge.sourceSelectionId === input.selection.id ||
      merge.targetSelectionId === input.selection.id;

    if (merge.status === "deleted") {
      excludedItems.push(
        snapshotItem({
          id: `ctx-merge-${merge.id}`,
          type: "merge_record",
          sourceId: merge.id,
          text: "",
          reason: "because deleted_memory_never_included",
          included: false
        })
      );
      continue;
    }

    if (merge.status === "confirmed" && relatedToCurrentThread) {
      includedItems.push(
        snapshotItem({
          id: `ctx-merge-${merge.id}`,
          type: "related_merge_history",
          sourceId: merge.id,
          text: JSON.stringify({
            merge_id: merge.id,
            source_type: merge.sourceType,
            merge_mode: merge.mergeMode,
            result_document_version_id: merge.resultDocumentVersionId,
            diff_summary: merge.diffSummary
          }),
          reason: "because related_confirmed_merge_for_current_scope",
          included: true
        })
      );
      continue;
    }

    excludedItems.push(
      snapshotItem({
        id: `ctx-merge-${merge.id}`,
        type: "merge_record",
        sourceId: merge.id,
        text: merge.sourceText ?? "",
        reason:
          merge.status === "conflict"
            ? "because merge_conflict_not_confirmed"
            : merge.status === "discarded"
              ? "because discarded_merge_excluded_by_default"
              : merge.status === "cancelled"
                ? "because cancelled_merge_not_confirmed"
                : relatedToCurrentThread
                  ? "because pending_merge_not_confirmed"
                  : "because unrelated_merge_proposal",
        included: false
      })
    );
  }

  for (const draft of Object.values(input.state.manualEditDrafts)) {
    excludedItems.push(
      snapshotItem({
        id: `ctx-manual-edit-draft-${draft.id}`,
        type: "manual_edit_draft",
        sourceId: draft.id,
        text: draft.status === "discarded" ? "" : draft.draftContent,
        reason:
          draft.status === "discarded"
            ? "because discarded_draft_excluded_by_default"
            : "because draft_not_confirmed",
        included: false
      })
    );
  }

  for (const graph of Object.values(input.state.comparisonGraphs)) {
    excludedItems.push(
      snapshotItem({
        id: `ctx-comparison-${graph.id}`,
        type: "comparison_graph",
        sourceId: graph.id,
        text: graph.status === "deleted" ? "" : graph.summary ?? "",
        reason:
          graph.status === "deleted"
            ? "deleted_memory_never_included"
            : graph.status === "discarded"
              ? "discarded_excluded_by_default"
              : graph.status === "cleared"
                ? "cleared_comparison_excluded"
                : "comparison_not_active_or_pinned",
        included: false
      })
    );
  }

  for (const node of Object.values(input.state.timelineNodes)) {
    if (node.status === "inactive" || node.status === "deleted") {
      excludedItems.push(
        snapshotItem({
          id: `ctx-timeline-node-${node.id}`,
          type: "timeline_node",
          sourceId: node.id,
        text: node.status === "deleted" ? "" : node.label,
        reason:
          node.status === "deleted"
            ? excludedStateReason(node.status)
            : excludedStateReason(node.status),
        included: false
      })
      );
    }
  }

  return {
    id: input.id,
    llmCallId: input.llmCallId,
    projectId: input.projectId,
    callType: "local_window",
    purpose: "local_question",
    model: input.model,
    windowId: input.windowId,
    sessionId: input.localThread.conversationId,
    documentId: input.documentId,
    activeVersionNodeId: input.activeVersionNodeId,
    threadId: input.localThread.id,
    threadType: input.localThread.threadType,
    includedItems,
    excludedItems,
    tokenEstimate: estimateTokens(includedItems),
    createdAt: input.createdAt,
    metadata: {
      source_document_version_id: sourceDocumentVersion?.id,
      active_document_version_id: input.activeDocumentVersion?.id,
      source_version_number: sourceDocumentVersion?.versionNumber,
      active_version_number: input.activeDocumentVersion?.versionNumber,
      source_version_is_not_active: sourceVersionIsNotActive
    }
  };
}

function latestThreadNode(
  state: RevisionRepositoryState,
  localThreadId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectId === localThreadId ||
        node.payload?.local_thread_id === localThreadId
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

export class LocalThreadMessageService {
  static createStartedLocalSend(input: CreateStartedLocalSendInput): {
    state: RevisionRepositoryState;
    localThread: LocalThreadModel;
    selection: TextSelectionModel;
    userMessage: MessageModel;
    contextSnapshot: ContextSnapshot;
    llmCallRecord: LLMCallRecord;
    events: EventLogRecord[];
    timelineNodes: RevisionTimelineNode[];
    timelineEdges: RevisionTimelineEdge[];
  } {
    const localThread = input.state.localThreads[input.localThreadId];

    if (!localThread || localThread.status !== "active") {
      throw new Error("Active LocalThread not found");
    }

    const selection = input.state.textSelections[localThread.sourceSelectionId];

    if (!selection) {
      throw new Error("TextSelection not found for LocalThread");
    }

    const isNestedLocal = localThread.threadType === "nested_local";
    const messagePrefix = isNestedLocal
      ? "rev-nested-local-message"
      : "rev-local-message";
    const callPrefix = isNestedLocal ? "nested-local" : "local";
    const userEventType = isNestedLocal
      ? "nested_local_message.user.created"
      : "local_message.user.created";
    const userMessage: MessageModel = {
      id: `${messagePrefix}-user-${input.suffix}`,
      projectId: input.projectId,
      conversationId: localThread.conversationId ?? input.localThreadId,
      threadId: localThread.id,
      threadType: localThread.threadType,
      role: "user",
      content: input.question,
      status: "active",
      memoryScope: "local_thread",
      includeInContext: true,
      createdAt: input.now
    };
    const llmCallId = `llm-call-${callPrefix}-${input.suffix}`;
    const contextSnapshot = buildLocalContextSnapshot({
      id: `context-snapshot-${callPrefix}-${input.suffix}`,
      llmCallId,
      projectId: input.projectId,
      model: input.model,
      localThread,
      selection,
      prompt: input.question,
      windowId: input.windowId,
      documentId: input.documentId,
      activeVersionNodeId: input.activeVersionNodeId,
      activeDocumentVersion: input.activeDocumentVersion,
      state: {
        ...input.state,
        revisionMessages: {
          ...input.state.revisionMessages,
          [userMessage.id]: userMessage
        }
      },
      createdAt: input.now
    });
    const llmCallRecord = ContextSnapshotService.createStartedLLMCall({
      id: llmCallId,
      projectId: input.projectId,
      callType: "local_window",
      purpose: "local_question",
      model: input.model,
      prompt: input.question,
      contextSnapshotId: contextSnapshot.id,
      windowId: input.windowId,
      sessionId: localThread.conversationId,
      documentId: input.documentId,
      activeVersionNodeId: input.activeVersionNodeId,
      threadId: localThread.id,
      threadType: localThread.threadType,
      createdAt: input.now
    });
    const sourceNode = latestThreadNode(input.state, localThread.id);
    const userEventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-${callPrefix}-message-user-${input.suffix}`,
        projectId: input.projectId,
        eventType: userEventType,
        objectType: "message",
        objectId: userMessage.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          localThreadId: localThread.id,
          selectionId: selection.id,
          localSelectionId: localThread.parentLocalSelectionId,
          threadType: localThread.threadType
        }
      },
      {
        id: `timeline-${callPrefix}-user-${input.suffix}`,
        conversationId: localThread.conversationId,
        parentNodeId: sourceNode?.id,
        label: isNestedLocal ? "Nested local user message" : "Local user message",
        memoryScope: "local_thread",
        memoryEffect: "local_only",
        createdContentRef: userMessage.id,
        payload: {
          local_thread_id: localThread.id,
          selection_id: selection.id,
          local_selection_id: localThread.parentLocalSelectionId,
          thread_type: localThread.threadType
        }
      },
      sourceNode
        ? {
            id: `timeline-edge-${sourceNode.id}-timeline-${callPrefix}-user-${input.suffix}`,
            sourceNodeId: sourceNode.id,
            edgeType: "sequence"
          }
        : undefined
    );
    const contextEventResult = EventService.createEvent(userEventResult, {
      id: `event-context-snapshot-${callPrefix}-${input.suffix}`,
      projectId: input.projectId,
      eventType: "context_snapshot.created",
      objectType: "context_snapshot",
      objectId: contextSnapshot.id,
      actor: "system",
      timestamp: input.now,
      payload: {
        llmCallId,
        localThreadId: localThread.id,
        localSelectionId: localThread.parentLocalSelectionId,
        threadType: localThread.threadType
      }
    });
    const llmStartedEventResult = EventService.createEvent(
      {
        eventLogs: contextEventResult.eventLogs
      },
      {
        id: `event-llm-${callPrefix}-started-${input.suffix}`,
        projectId: input.projectId,
        eventType: "llm.call.started",
        objectType: "llm_call",
        objectId: llmCallId,
        actor: "system",
        timestamp: input.now,
        payload: {
          model: input.model,
          contextSnapshotId: contextSnapshot.id,
          localThreadId: localThread.id,
          localSelectionId: localThread.parentLocalSelectionId,
          threadType: localThread.threadType
        }
      }
    );
    const nextState: RevisionRepositoryState = {
      ...input.state,
      localThreads: {
        ...input.state.localThreads,
        [localThread.id]: {
          ...localThread,
          updatedAt: input.now
        }
      },
      revisionMessages: {
        ...input.state.revisionMessages,
        [userMessage.id]: userMessage
      },
      contextSnapshots: {
        ...input.state.contextSnapshots,
        [contextSnapshot.id]: contextSnapshot
      },
      llmCallRecords: {
        ...input.state.llmCallRecords,
        [llmCallRecord.id]: llmCallRecord
      },
      eventLogs: llmStartedEventResult.eventLogs,
      timelineNodes: userEventResult.timelineNodes,
      timelineEdges: userEventResult.timelineEdges
    };

    return {
      state: nextState,
      localThread,
      selection,
      userMessage,
      contextSnapshot,
      llmCallRecord,
      events: [
        userEventResult.event,
        contextEventResult.event,
        llmStartedEventResult.event
      ],
      timelineNodes: [userEventResult.timelineNode],
      timelineEdges: userEventResult.timelineEdge ? [userEventResult.timelineEdge] : []
    };
  }

  static completeLocalSend(input: CompleteLocalSendInput): {
    state: RevisionRepositoryState;
    localThread: LocalThreadModel;
    selection: TextSelectionModel;
    assistantMessage: MessageModel;
    llmCallRecord: LLMCallRecord;
    events: EventLogRecord[];
    timelineNodes: RevisionTimelineNode[];
    timelineEdges: RevisionTimelineEdge[];
  } {
    const localThread = input.state.localThreads[input.localThreadId];

    if (!localThread) {
      throw new Error("LocalThread not found");
    }

    const selection = input.state.textSelections[localThread.sourceSelectionId];

    if (!selection) {
      throw new Error("TextSelection not found for LocalThread");
    }

    const isNestedLocal = localThread.threadType === "nested_local";
    const messagePrefix = isNestedLocal
      ? "rev-nested-local-message"
      : "rev-local-message";
    const callPrefix = isNestedLocal ? "nested-local" : "local";
    const assistantEventType = isNestedLocal
      ? "nested_local_message.assistant.created"
      : "local_message.assistant.created";
    const assistantMessage: MessageModel = {
      id: `${messagePrefix}-assistant-${input.suffix}`,
      projectId: input.projectId,
      conversationId: localThread.conversationId ?? input.localThreadId,
      threadId: localThread.id,
      threadType: localThread.threadType,
      role: "assistant",
      content: input.answer,
      status: "active",
      memoryScope: "local_thread",
      includeInContext: true,
      model: input.model,
      llmCallId: input.llmCallId,
      createdAt: input.now
    };
    const previousCall = input.state.llmCallRecords[input.llmCallId];
    const llmCallRecord: LLMCallRecord = {
      ...previousCall,
      id: input.llmCallId,
      projectId: input.projectId,
      callType: previousCall?.callType ?? "local_window",
      purpose: previousCall?.purpose ?? "local_question",
      model: input.model,
      provider: input.provider,
      status: "completed",
      prompt: previousCall?.prompt ?? input.question,
      contextSnapshotId: input.contextSnapshotId,
      sessionId: previousCall?.sessionId ?? localThread.conversationId,
      threadId: localThread.id,
      threadType: previousCall?.threadType ?? localThread.threadType,
      outputMessageId: assistantMessage.id,
      createdAt: previousCall?.createdAt ?? input.now,
      completedAt: input.now
    };
    const completedEventResult = EventService.createEvent(input.state, {
      id: `event-llm-${callPrefix}-completed-${input.suffix}`,
      projectId: input.projectId,
      eventType: "llm.call.completed",
      objectType: "llm_call",
      objectId: input.llmCallId,
      actor: "system",
      timestamp: input.now,
      payload: {
        model: input.model,
        provider: input.provider,
        outputMessageId: assistantMessage.id,
        localThreadId: localThread.id,
        localSelectionId: localThread.parentLocalSelectionId,
        threadType: localThread.threadType
      }
    });
    const assistantEventResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: completedEventResult.eventLogs
      },
      {
        id: `event-${callPrefix}-message-assistant-${input.suffix}`,
        projectId: input.projectId,
        eventType: assistantEventType,
        objectType: "message",
        objectId: assistantMessage.id,
        actor: "assistant",
        timestamp: input.now,
        payload: {
          localThreadId: localThread.id,
          selectionId: selection.id,
          localSelectionId: localThread.parentLocalSelectionId,
          threadType: localThread.threadType,
          llmCallId: input.llmCallId
        }
      },
      {
        id: `timeline-${callPrefix}-assistant-${input.suffix}`,
        conversationId: localThread.conversationId,
        parentNodeId: input.userTimelineNodeId,
        label: isNestedLocal
          ? "Nested local assistant answer"
          : "Local assistant answer",
        model: input.model,
        memoryScope: "local_thread",
        memoryEffect: "local_only",
        createdContentRef: assistantMessage.id,
        affectedContextRefs: [input.contextSnapshotId],
        payload: {
          local_thread_id: localThread.id,
          selection_id: selection.id,
          local_selection_id: localThread.parentLocalSelectionId,
          thread_type: localThread.threadType,
          llm_call_id: input.llmCallId,
          context_snapshot_id: input.contextSnapshotId
        }
      },
      {
        id: `timeline-edge-${input.userTimelineNodeId}-timeline-${callPrefix}-assistant-${input.suffix}`,
        sourceNodeId: input.userTimelineNodeId,
        edgeType: "sequence"
      }
    );
    const nextState: RevisionRepositoryState = {
      ...input.state,
      localThreads: {
        ...input.state.localThreads,
        [localThread.id]: {
          ...localThread,
          updatedAt: input.now
        }
      },
      revisionMessages: {
        ...input.state.revisionMessages,
        [assistantMessage.id]: assistantMessage
      },
      llmCallRecords: {
        ...input.state.llmCallRecords,
        [llmCallRecord.id]: llmCallRecord
      },
      eventLogs: assistantEventResult.eventLogs,
      timelineNodes: assistantEventResult.timelineNodes,
      timelineEdges: assistantEventResult.timelineEdges
    };

    return {
      state: nextState,
      localThread,
      selection,
      assistantMessage,
      llmCallRecord,
      events: [completedEventResult.event, assistantEventResult.event],
      timelineNodes: [assistantEventResult.timelineNode],
      timelineEdges: assistantEventResult.timelineEdge
        ? [assistantEventResult.timelineEdge]
        : []
    };
  }
}
