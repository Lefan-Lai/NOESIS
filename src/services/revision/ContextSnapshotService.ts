import type {
  ContextSnapshot,
  ContextSnapshotItem,
  LLMCallRecord
} from "@/types/context";
import type {
  AnnotationScopeType,
  AnnotationModel,
  ComparisonGraphModel,
  ComparisonRunModel,
  ContextItemIndexModel,
  DocumentVersionModel,
  LocalThreadModel,
  ManualEditDraftModel,
  MergeRecordModel,
  MessageModel,
  RevisionBranchModel,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import { ContextBuildCacheService, CONTEXT_RULES_VERSION } from "./ContextBuildCacheService";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";
import { WorkspaceProjectionService } from "./WorkspaceProjectionService";

type BuildContextSnapshotInput = {
  id?: string;
  llmCallId: string;
  projectId: string;
  callType: ContextSnapshot["callType"];
  purpose: ContextSnapshot["purpose"];
  model: string;
  windowId?: string;
  sessionId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  threadId?: string;
  threadType?: ContextSnapshot["threadType"];
  activeSelectionId?: string;
  activeLocalThreadId?: string;
  activeBranchId?: string;
  comparisonId?: string;
  activeComparisonId?: string;
  activeComparisonRunId?: string;
  pinnedComparisonIds?: string[];
  activeDocumentVersion?: DocumentVersionModel;
  documentVersions?: DocumentVersionModel[];
  manualEditDrafts?: ManualEditDraftModel[];
  recentMessages?: MessageModel[];
  annotations?: AnnotationModel[];
  localThreads?: LocalThreadModel[];
  revisionBranches?: RevisionBranchModel[];
  mergeRecords?: MergeRecordModel[];
  comparisonGraphs?: ComparisonGraphModel[];
  comparisonRuns?: ComparisonRunModel[];
  timelineNodes?: RevisionTimelineNode[];
  createdAt?: string;
};

type ScalableContextInput = {
  state: RevisionRepositoryState;
  id?: string;
  llmCallId: string;
  projectId: string;
  conversationId?: string;
  callType: ContextSnapshot["callType"];
  purpose: ContextSnapshot["purpose"];
  model: string;
  threadType?: ContextSnapshot["threadType"];
  threadId?: string;
  scopeType?: string;
  scopeId?: string;
  activeDocumentVersionId?: string;
  activeTimelineNodeId?: string;
  activePathId?: string;
  activeSelectionId?: string;
  activeLocalThreadId?: string;
  activeBranchId?: string;
  activeComparisonId?: string;
  inputFingerprint?: string;
  tokenBudget?: number;
  reserveOutputTokens?: number;
  now?: string;
  useCache?: boolean;
};

function estimateTokens(items: ContextSnapshotItem[]) {
  return Math.ceil(
    items.reduce((total, item) => total + item.text.length, 0) / 4
  );
}

function contextIndexRef(itemIndex: ContextItemIndexModel) {
  return {
    object_type: itemIndex.objectType,
    object_id: itemIndex.objectId,
    context_item_id: itemIndex.id
  };
}

function itemFromContextIndex(
  itemIndex: ContextItemIndexModel,
  included: boolean,
  reason: string
): ContextSnapshotItem {
  return {
    id: `ctx-index-${itemIndex.id}`,
    type: itemIndex.objectType,
    sourceId: itemIndex.objectId,
    text:
      itemIndex.status === "deleted" ||
      itemIndex.memoryPolicy === "never_include"
        ? ""
        : itemIndex.contentPreview,
    reason,
    included
  };
}

function indexedStatusExcludeReason(itemIndex: ContextItemIndexModel) {
  if (itemIndex.status === "deleted" || itemIndex.memoryPolicy === "never_include") {
    return "deleted_memory_never_included";
  }

  if (
    itemIndex.status === "discarded" ||
    itemIndex.memoryPolicy === "excluded_by_default"
  ) {
    return "discarded_excluded_by_default";
  }

  if (itemIndex.status === "inactive") return "inactive_path_excluded";
  if (itemIndex.status === "superseded") return "superseded_object_excluded";
  if (
    itemIndex.status === "pending" ||
    itemIndex.status === "cancelled" ||
    itemIndex.status === "failed" ||
    itemIndex.status === "conflict"
  ) {
    return "pending_or_failed_object_excluded";
  }

  return undefined;
}

function scopeMatchesIndexed(
  input: ScalableContextInput,
  itemIndex: ContextItemIndexModel
) {
  if (itemIndex.objectType === "document_chunk") {
    return itemIndex.documentVersionId === input.activeDocumentVersionId;
  }

  if (itemIndex.objectType === "document_version") {
    return itemIndex.objectId === input.activeDocumentVersionId;
  }

  if (itemIndex.objectType === "message") {
    if (input.callType === "main_conversation") {
      return (itemIndex.threadId ?? input.conversationId) === input.conversationId;
    }

    return itemIndex.threadId === input.threadId;
  }

  if (itemIndex.objectType === "thread_summary") {
    return itemIndex.threadId === input.threadId ||
      itemIndex.threadId === input.conversationId;
  }

  if (itemIndex.objectType === "annotation") {
    if (itemIndex.scopeType === "project") return itemIndex.scopeId === input.projectId;
    if (itemIndex.scopeType === "conversation") return itemIndex.scopeId === input.conversationId;
    if (itemIndex.scopeType === "selected_text") return itemIndex.scopeId === input.activeSelectionId;
    if (itemIndex.scopeType === "local_thread" || itemIndex.scopeType === "nested_local_thread") {
      return itemIndex.scopeId === input.activeLocalThreadId || itemIndex.scopeId === input.threadId;
    }
    if (itemIndex.scopeType === "branch") return itemIndex.scopeId === input.activeBranchId;
    if (itemIndex.scopeType === "comparison") return itemIndex.scopeId === input.activeComparisonId;
    return itemIndex.scopeId === input.activeDocumentVersionId;
  }

  if (itemIndex.objectType === "comparison_run") {
    return input.callType === "comparison_chat" &&
      itemIndex.comparisonId === input.activeComparisonId;
  }

  if (itemIndex.objectType === "text_selection") {
    return itemIndex.objectId === input.activeSelectionId;
  }

  if (itemIndex.objectType === "local_selection") {
    return itemIndex.localThreadId === input.activeLocalThreadId ||
      itemIndex.localThreadId === input.threadId;
  }

  if (itemIndex.objectType === "merge_record") {
    return itemIndex.status === "confirmed" &&
      itemIndex.documentVersionId === input.activeDocumentVersionId;
  }

  if (itemIndex.objectType === "revision_branch") {
    return itemIndex.branchId === input.activeBranchId;
  }

  return itemIndex.scopeId === input.scopeId || itemIndex.threadId === input.threadId;
}

function priorityForIndexed(
  input: ScalableContextInput,
  itemIndex: ContextItemIndexModel
) {
  if (itemIndex.objectType === "text_selection" && itemIndex.objectId === input.activeSelectionId) return 95;
  if (itemIndex.objectType === "local_selection" && itemIndex.localThreadId === input.activeLocalThreadId) return 95;
  if (itemIndex.objectType === "document_chunk" && itemIndex.documentVersionId === input.activeDocumentVersionId) return 90;
  if (itemIndex.objectType === "message" && itemIndex.threadId === input.threadId) return 85;
  if (itemIndex.objectType === "annotation") return 80;
  if (itemIndex.objectType === "thread_summary" && itemIndex.threadId === input.threadId) return 75;
  if (itemIndex.objectType === "merge_record" && itemIndex.status === "confirmed") return 70;
  if (itemIndex.objectType === "thread_summary") return 60;
  if (itemIndex.scopeType === "project") return 50;
  if (itemIndex.objectType === "comparison_run") return 45;
  if (itemIndex.objectType === "document_version" && itemIndex.objectId === input.activeDocumentVersionId) return 40;
  return 20;
}

function item(params: {
  id: string;
  type: string;
  sourceId?: string;
  text: string;
  reason: string;
  included: boolean;
}): ContextSnapshotItem {
  return params;
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

function annotationPreview(annotation: AnnotationModel) {
  return annotation.status === "deleted" ? "" : annotation.content;
}

function annotationPolicyAllowsInclude(annotation: AnnotationModel) {
  return (
    annotation.memoryPolicy === "always_include_when_scope_matches" ||
    annotation.memoryPolicy === "auto_by_scope" ||
    (!annotation.memoryPolicy && annotation.includeInContext)
  );
}

function mainIncludedNoteReason(scopeType: AnnotationScopeType) {
  if (scopeType === "project") {
    return "because active_note_matching_project_scope";
  }

  if (scopeType === "conversation") {
    return "because active_note_matching_main_conversation";
  }

  if (scopeType === "document") {
    return "because active_note_matching_document";
  }

  if (scopeType === "selected_text") {
    return "because active_note_matching_active_selection";
  }

  if (scopeType === "local_thread" || scopeType === "nested_local_thread") {
    return "because active_note_matching_current_local_thread";
  }

  if (scopeType === "branch") {
    return "because active_note_matching_branch";
  }

  return "because active_note_matching_context_scope";
}

function mainExcludedNoteReason(scopeType: AnnotationScopeType) {
  if (scopeType === "selected_text") {
    return "because selected_text_scope_requires_active_focus";
  }

  if (scopeType === "local_thread" || scopeType === "nested_local_thread") {
    return "because local_thread_scope_requires_active_focus";
  }

  if (scopeType === "branch") {
    return "because branch_scope_requires_active_focus";
  }

  return "because annotation_scope_not_active_for_call";
}

function noteItem(params: {
  annotation: AnnotationModel;
  reason: string;
  included: boolean;
}) {
  return item({
    id: `ctx-annotation-${params.annotation.id}`,
    type: params.included ? "included_note" : "excluded_note",
    sourceId: params.annotation.id,
    text: annotationPreview(params.annotation),
    reason: [
      params.reason,
      `scope=${annotationScopeType(params.annotation)}`,
      `scope_id=${annotationScopeId(params.annotation)}`,
      `source=${params.annotation.sourceType ?? "unknown"}`
    ].join(" | "),
    included: params.included
  });
}

function comparisonReason(status: string) {
  if (status === "deleted") {
    return "deleted_memory_never_included";
  }

  if (status === "discarded") {
    return "discarded_excluded_by_default";
  }

  if (status === "cleared") {
    return "cleared_comparison_excluded";
  }

  if (status === "inactive") {
    return "comparison_not_active_or_pinned";
  }

  return "comparison_not_active_or_pinned";
}

function comparisonSnapshotText(
  graph: ComparisonGraphModel,
  run?: ComparisonRunModel
) {
  if (graph.status === "deleted" || run?.status === "deleted") {
    return "";
  }

  return [
    graph.title,
    run?.summary ?? graph.summary,
    run?.differenceSummary,
    run?.conflictSummary
  ]
    .filter(Boolean)
    .join("\n");
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

export class ContextSnapshotService {
  static buildScalableContextSnapshot(input: ScalableContextInput): {
    state: RevisionRepositoryState;
    snapshot: ContextSnapshot;
    cacheHit: boolean;
  } {
    const totalStart = performance.now();
    const now = input.now ?? new Date().toISOString();
    const indexedState = Object.keys(input.state.contextItemIndex).length > 0
      ? input.state
      : WorkspaceProjectionService.rebuildContextItemIndex({
          state: input.state,
          projectId: input.projectId,
          conversationId: input.conversationId,
          now
        });
    const inputFingerprint =
      input.inputFingerprint ??
      ContextBuildCacheService.inputFingerprint({
        callType: input.callType,
        purpose: input.purpose,
        threadType: input.threadType,
        threadId: input.threadId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        activeDocumentVersionId: input.activeDocumentVersionId,
        activeTimelineNodeId: input.activeTimelineNodeId,
        activePathId: input.activePathId,
        activeSelectionId: input.activeSelectionId,
        activeLocalThreadId: input.activeLocalThreadId,
        activeBranchId: input.activeBranchId,
        activeComparisonId: input.activeComparisonId
      });
    const cacheKey = ContextBuildCacheService.buildCacheKey({
      projectId: input.projectId,
      conversationId: input.conversationId,
      threadType: input.threadType,
      threadId: input.threadId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      activeDocumentVersionId: input.activeDocumentVersionId,
      activeTimelineNodeId: input.activeTimelineNodeId,
      activePathId: input.activePathId,
      inputFingerprint
    });
    const refsToItems = (refs: Array<Record<string, unknown>>) =>
      refs
        .map((ref) =>
          Object.values(indexedState.contextItemIndex).find(
            (itemIndex) =>
              itemIndex.objectType === ref.object_type &&
              itemIndex.objectId === ref.object_id
          )
        )
        .filter(Boolean) as ContextItemIndexModel[];
    const cached =
      input.useCache === false
        ? undefined
        : ContextBuildCacheService.getCache(indexedState, cacheKey, now);

    if (cached) {
      const cachedItems = [
        ...refsToItems(cached.includedItemRefs),
        ...refsToItems(cached.compressedItemRefs)
      ];
      const staleDueToUnsafeStatus = cachedItems.some((itemIndex) =>
        ["deleted", "discarded", "inactive"].includes(itemIndex.status)
      );

      if (!staleDueToUnsafeStatus) {
        const stateWithCacheHit = ContextBuildCacheService.recordCacheHit({
          state: indexedState,
          cacheId: cached.id,
          projectId: input.projectId,
          conversationId: input.conversationId,
          now,
          metadata: {
            thread_type: input.threadType,
            thread_id: input.threadId,
            scope_type: input.scopeType,
            scope_id: input.scopeId
          }
        });
        const includedItems = refsToItems(cached.includedItemRefs).map((itemIndex) =>
          itemFromContextIndex(itemIndex, true, "cache_hit_included_decision")
        );
        const excludedItems = refsToItems(cached.excludedItemRefs).map((itemIndex) =>
          itemFromContextIndex(itemIndex, false, "cache_hit_excluded_decision")
        );
        const compressedItems = refsToItems(cached.compressedItemRefs).map((itemIndex) =>
          itemFromContextIndex(itemIndex, true, "cache_hit_compressed_decision")
        );
        const snapshot: ContextSnapshot = {
          id: input.id ?? `context-snapshot-${input.llmCallId}`,
          llmCallId: input.llmCallId,
          projectId: input.projectId,
          callType: input.callType,
          purpose: input.purpose,
          model: input.model,
          sessionId: input.conversationId,
          threadId: input.threadId,
          threadType: input.threadType,
          includedItems,
          excludedItems,
          compressedItems,
          truncatedItems: [],
          tokenEstimate: cached.tokenEstimate,
          contextBuildStrategy: "cached",
          contextRulesVersion: CONTEXT_RULES_VERSION,
          cacheHit: true,
          cacheKey,
          candidateCount: cachedItems.length,
          includedCount: includedItems.length,
          excludedCount: excludedItems.length,
          compressedCount: compressedItems.length,
          truncatedCount: 0,
          tokenBudget: input.tokenBudget,
          tokenEstimateBefore: cached.tokenEstimate,
          tokenEstimateAfter: cached.tokenEstimate,
          buildLatencyMs: performance.now() - totalStart,
          retrievalLatencyMs: 0,
          rankingLatencyMs: 0,
          compressionLatencyMs: 0,
          createdAt: now,
          metadata: {
            cache_id: cached.id
          }
        };

        return {
          state: {
            ...stateWithCacheHit,
            contextSnapshots: {
              ...stateWithCacheHit.contextSnapshots,
              [snapshot.id]: snapshot
            }
          },
          snapshot,
          cacheHit: true
        };
      }

      const invalidated = ContextBuildCacheService.invalidateCaches({
        state: indexedState,
        reason: "cache_stale_read_prevented_due_to_unsafe_status",
        projectId: input.projectId,
        conversationId: input.conversationId,
        now
      });
      const measured = WorkspaceObservabilityService.increment({
        state: invalidated,
        name: "cache_stale_read_prevented_count",
        projectId: input.projectId,
        conversationId: input.conversationId,
        now
      }).state;

      return ContextSnapshotService.buildScalableContextSnapshot({
        ...input,
        state: measured,
        useCache: false
      });
    }

    const retrievalStart = performance.now();
    const candidates = Object.values(indexedState.contextItemIndex).filter(
      (itemIndex) =>
        itemIndex.projectId === input.projectId &&
        (!input.conversationId || itemIndex.conversationId === input.conversationId)
    );
    const retrievalLatencyMs = performance.now() - retrievalStart;
    const statusStart = performance.now();
    const statusFiltered = candidates.map((itemIndex) => ({
      itemIndex,
      excludeReason: indexedStatusExcludeReason(itemIndex)
    }));
    const statusLatencyMs = performance.now() - statusStart;
    const rankingStart = performance.now();
    const includedCandidates = statusFiltered
      .filter(({ itemIndex, excludeReason }) => !excludeReason && scopeMatchesIndexed(input, itemIndex))
      .map(({ itemIndex }) => ({
        itemIndex,
        priority: priorityForIndexed(input, itemIndex)
      }))
      .sort((a, b) => b.priority - a.priority || b.itemIndex.tokenEstimate - a.itemIndex.tokenEstimate);
    const scopeExcluded = statusFiltered.filter(
      ({ itemIndex, excludeReason }) => !excludeReason && !scopeMatchesIndexed(input, itemIndex)
    );
    const rankingLatencyMs = performance.now() - rankingStart;
    const availableTokens =
      (input.tokenBudget ?? 6000) - (input.reserveOutputTokens ?? 1000);
    let usedTokens = 0;
    const includedItems: ContextSnapshotItem[] = [];
    const compressedItems: ContextSnapshotItem[] = [];
    const truncatedItems: ContextSnapshotItem[] = [];

    for (const candidate of includedCandidates) {
      if (usedTokens + candidate.itemIndex.tokenEstimate <= availableTokens) {
        includedItems.push(
          itemFromContextIndex(
            candidate.itemIndex,
            true,
            `indexed_priority_${candidate.priority}`
          )
        );
        usedTokens += candidate.itemIndex.tokenEstimate;
        continue;
      }

      if (candidate.itemIndex.objectType === "message") {
        compressedItems.push(
          itemFromContextIndex(
            candidate.itemIndex,
            true,
            "compressed_by_thread_summary_or_preview"
          )
        );
        usedTokens += Math.min(candidate.itemIndex.tokenEstimate, 80);
        continue;
      }

      truncatedItems.push(
        itemFromContextIndex(candidate.itemIndex, false, "truncated_by_token_budget")
      );
    }

    const excludedItems = [
      ...statusFiltered
        .filter(({ excludeReason }) => Boolean(excludeReason))
        .map(({ itemIndex, excludeReason }) =>
          itemFromContextIndex(itemIndex, false, excludeReason!)
        ),
      ...scopeExcluded.map(({ itemIndex }) =>
        itemFromContextIndex(itemIndex, false, "scope_not_active_for_call")
      )
    ];
    const tokenEstimateBefore = candidates.reduce(
      (total, itemIndex) => total + itemIndex.tokenEstimate,
      0
    );
    const tokenEstimateAfter = estimateTokens(includedItems) +
      estimateTokens(compressedItems);
    const snapshot: ContextSnapshot = {
      id: input.id ?? `context-snapshot-${input.llmCallId}`,
      llmCallId: input.llmCallId,
      projectId: input.projectId,
      callType: input.callType,
      purpose: input.purpose,
      model: input.model,
      sessionId: input.conversationId,
      threadId: input.threadId,
      threadType: input.threadType,
      includedItems,
      excludedItems,
      compressedItems,
      truncatedItems,
      tokenEstimate: tokenEstimateAfter,
      contextBuildStrategy: "indexed",
      contextRulesVersion: CONTEXT_RULES_VERSION,
      cacheHit: false,
      cacheKey,
      candidateCount: candidates.length,
      includedCount: includedItems.length,
      excludedCount: excludedItems.length,
      compressedCount: compressedItems.length,
      truncatedCount: truncatedItems.length,
      tokenBudget: input.tokenBudget ?? 6000,
      tokenEstimateBefore,
      tokenEstimateAfter,
      buildLatencyMs: performance.now() - totalStart,
      retrievalLatencyMs,
      rankingLatencyMs,
      compressionLatencyMs: 0,
      createdAt: now,
      metadata: {
        status_filter_latency_ms: statusLatencyMs,
        active_document_version_id: input.activeDocumentVersionId,
        active_path_id: input.activePathId
      }
    };
    const savedCacheState = ContextBuildCacheService.saveCache({
      state: indexedState,
      cacheKey,
      projectId: input.projectId,
      conversationId: input.conversationId,
      threadType: input.threadType,
      threadId: input.threadId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      activeDocumentVersionId: input.activeDocumentVersionId,
      activeTimelineNodeId: input.activeTimelineNodeId,
      activePathId: input.activePathId,
      inputFingerprint,
      includedItemRefs: includedCandidates
        .filter((candidate) =>
          includedItems.some((item) => item.sourceId === candidate.itemIndex.objectId)
        )
        .map((candidate) => contextIndexRef(candidate.itemIndex)),
      excludedItemRefs: excludedItems
        .map((item) =>
          candidates.find((candidate) => candidate.objectId === item.sourceId)
        )
        .filter(Boolean)
        .map((itemIndex) => contextIndexRef(itemIndex!)),
      compressedItemRefs: compressedItems
        .map((item) =>
          candidates.find((candidate) => candidate.objectId === item.sourceId)
        )
        .filter(Boolean)
        .map((itemIndex) => contextIndexRef(itemIndex!)),
      tokenEstimate: snapshot.tokenEstimate,
      now
    });
    let stateWithSnapshot: RevisionRepositoryState = {
      ...savedCacheState,
      contextSnapshots: {
        ...savedCacheState.contextSnapshots,
        [snapshot.id]: snapshot
      }
    };
    stateWithSnapshot = WorkspaceObservabilityService.recordMetric({
      state: stateWithSnapshot,
      name: "context_candidate_query_latency_ms",
      value: retrievalLatencyMs,
      unit: "ms",
      projectId: input.projectId,
      conversationId: input.conversationId,
      now
    }).state;
    stateWithSnapshot = WorkspaceObservabilityService.recordMetric({
      state: stateWithSnapshot,
      name: "context_status_filter_latency_ms",
      value: statusLatencyMs,
      unit: "ms",
      projectId: input.projectId,
      conversationId: input.conversationId,
      now
    }).state;
    stateWithSnapshot = WorkspaceObservabilityService.recordMetric({
      state: stateWithSnapshot,
      name: "context_ranking_latency_ms",
      value: rankingLatencyMs,
      unit: "ms",
      projectId: input.projectId,
      conversationId: input.conversationId,
      now
    }).state;
    stateWithSnapshot = WorkspaceObservabilityService.recordMetric({
      state: stateWithSnapshot,
      name: "context_total_build_latency_ms",
      value: snapshot.buildLatencyMs ?? 0,
      unit: "ms",
      projectId: input.projectId,
      conversationId: input.conversationId,
      now
    }).state;

    return {
      state: stateWithSnapshot,
      snapshot,
      cacheHit: false
    };
  }

  static getContextReviewSummary(snapshot: ContextSnapshot) {
    return {
      id: snapshot.id,
      includedCount: snapshot.includedCount ?? snapshot.includedItems.length,
      excludedCount: snapshot.excludedCount ?? snapshot.excludedItems.length,
      compressedCount: snapshot.compressedCount ?? snapshot.compressedItems?.length ?? 0,
      truncatedCount: snapshot.truncatedCount ?? snapshot.truncatedItems?.length ?? 0,
      tokenEstimate: snapshot.tokenEstimate,
      cacheHit: snapshot.cacheHit ?? false,
      buildLatencyMs: snapshot.buildLatencyMs ?? 0,
      contextBuildStrategy: snapshot.contextBuildStrategy ?? "legacy",
      contextRulesVersion: snapshot.contextRulesVersion,
      excludedByReason: (snapshot.excludedItems ?? []).reduce<Record<string, number>>(
        (counts, item) => {
          counts[item.reason] = (counts[item.reason] ?? 0) + 1;
          return counts;
        },
        {}
      )
    };
  }

  static getContextSnapshotItemsPage(input: {
    snapshot: ContextSnapshot;
    group: "included" | "excluded" | "compressed" | "truncated";
    limit?: number;
    cursor?: string;
  }) {
    const allItems =
      input.group === "included"
        ? input.snapshot.includedItems
        : input.group === "excluded"
          ? input.snapshot.excludedItems
          : input.group === "compressed"
            ? input.snapshot.compressedItems ?? []
            : input.snapshot.truncatedItems ?? [];
    const startIndex = input.cursor
      ? Math.max(0, allItems.findIndex((item) => item.id === input.cursor) + 1)
      : 0;
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const page = allItems.slice(startIndex, startIndex + limit).map((item) => ({
      ...item,
      text: item.reason.includes("deleted_memory_never_included") ? "" : item.text
    }));

    return {
      items: page,
      nextCursor:
        startIndex + limit < allItems.length
          ? page.at(-1)?.id
          : undefined,
      hasMore: startIndex + limit < allItems.length
    };
  }

  static buildContextSnapshot(input: BuildContextSnapshotInput): ContextSnapshot {
    const includedItems: ContextSnapshotItem[] = [];
    const excludedItems: ContextSnapshotItem[] = [];
    const activeNodeIds = new Set(
      (input.timelineNodes ?? [])
        .filter((node) => node.status === "active")
        .map((node) => node.id)
    );

    if (input.activeDocumentVersion?.status === "active") {
      includedItems.push(
        item({
          id: `ctx-document-version-${input.activeDocumentVersion.id}`,
          type: "active_document_version",
          sourceId: input.activeDocumentVersion.id,
          text: input.activeDocumentVersion.content,
          reason: [
            input.activeDocumentVersion.sourceType === "merge"
              ? "because active_document_version_after_confirmed_merge"
              : "because active_document_version",
            `version_number=${input.activeDocumentVersion.versionNumber ?? "unknown"}`,
            `source_type=${input.activeDocumentVersion.sourceType ?? "unknown"}`
          ].join(" | "),
          included: true
        })
      );
    }

    for (const version of input.documentVersions ?? []) {
      if (version.id === input.activeDocumentVersion?.id) {
        continue;
      }

      excludedItems.push(
        item({
          id: `ctx-document-version-${version.id}`,
          type: "document_version",
          sourceId: version.id,
          text: version.status === "deleted" ? "" : version.content,
          reason:
            version.status === "deleted"
              ? "because deleted_document_version_never_included"
              : version.status === "active"
                ? "because non_selected_active_document_version_not_used"
                : "because inactive_document_version",
          included: false
        })
      );
    }

    for (const draft of input.manualEditDrafts ?? []) {
      excludedItems.push(
        item({
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

    for (const message of (input.recentMessages ?? []).slice(-12)) {
      if (message.status === "deleted") {
        excludedItems.push(
          item({
            id: `ctx-message-${message.id}`,
            type: "main_message",
            sourceId: message.id,
            text: "",
            reason: excludedStateReason(message.status),
            included: false
          })
        );
        continue;
      }

      if (message.status === "discarded") {
        excludedItems.push(
          item({
            id: `ctx-message-${message.id}`,
            type: "main_message",
            sourceId: message.id,
            text: message.content,
            reason: excludedStateReason(message.status),
            included: false
          })
        );
        continue;
      }

      if (message.status === "inactive") {
        excludedItems.push(
          item({
            id: `ctx-message-${message.id}`,
            type: "main_message",
            sourceId: message.id,
            text: message.content,
            reason: excludedStateReason(message.status),
            included: false
          })
        );
        continue;
      }

      if (
        message.status === "superseded" ||
        message.status === "pending" ||
        message.status === "cancelled" ||
        message.status === "failed" ||
        message.status === "conflict"
      ) {
        excludedItems.push(
          item({
            id: `ctx-message-${message.id}`,
            type: "main_message",
            sourceId: message.id,
            text: message.content,
            reason: excludedStateReason(message.status),
            included: false
          })
        );
        continue;
      }

      if (message.includeInContext) {
        includedItems.push(
          item({
            id: `ctx-message-${message.id}`,
            type: "main_message",
            sourceId: message.id,
            text: message.content,
            reason: "Included recent active main conversation message.",
            included: true
          })
        );
      }
    }

    for (const annotation of input.annotations ?? []) {
      const scopeType = annotationScopeType(annotation);
      const scopeId = annotationScopeId(annotation);
      if (annotation.status === "deleted") {
        excludedItems.push(
          noteItem({
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
          noteItem({
            annotation,
            reason: `${excludedStateReason(annotation.status)} | because discarded_note_excluded_by_default`,
            included: false
          })
        );
        continue;
      }

      if (annotation.memoryPolicy === "never_include") {
        excludedItems.push(
          noteItem({
            annotation,
            reason: "because never_include_policy_excluded",
            included: false
          })
        );
        continue;
      }

      const mainScopeMatches =
        input.callType === "main_conversation" &&
        ((scopeType === "project" && scopeId === input.projectId) ||
          (scopeType === "conversation" && scopeId === input.sessionId) ||
          (scopeType === "document" &&
            (scopeId === input.documentId ||
              scopeId === input.activeDocumentVersion?.id ||
              scopeId === input.activeVersionNodeId)));
      const selectedTextFocusMatches =
        Boolean(input.activeSelectionId) &&
        scopeType === "selected_text" &&
        scopeId === input.activeSelectionId;
      const localThreadFocusMatches =
        Boolean(input.activeLocalThreadId) &&
        (scopeType === "local_thread" || scopeType === "nested_local_thread") &&
        scopeId === input.activeLocalThreadId;
      const branchFocusMatches =
        Boolean(input.activeBranchId) &&
        scopeType === "branch" &&
        scopeId === input.activeBranchId;

      if (
        annotation.status === "active" &&
        annotationPolicyAllowsInclude(annotation) &&
        (mainScopeMatches ||
          selectedTextFocusMatches ||
          localThreadFocusMatches ||
          branchFocusMatches)
      ) {
        includedItems.push(
          noteItem({
            annotation,
            reason: mainIncludedNoteReason(scopeType),
            included: true
          })
        );
        continue;
      }

      excludedItems.push(
        noteItem({
          annotation,
          reason: mainExcludedNoteReason(scopeType),
          included: false
        })
      );
    }

    for (const thread of input.localThreads ?? []) {
      if (thread.status === "deleted") {
        excludedItems.push(
          item({
            id: `ctx-local-thread-${thread.id}`,
            type: "local_thread",
            sourceId: thread.id,
            text: "",
            reason: excludedStateReason(thread.status),
            included: false
          })
        );
        continue;
      }

      if (thread.status === "discarded") {
        excludedItems.push(
          item({
            id: `ctx-local-thread-${thread.id}`,
            type: "local_thread",
            sourceId: thread.id,
            text: thread.payload?.summary?.toString() ?? "",
            reason: excludedStateReason(thread.status),
            included: false
          })
        );
        continue;
      }

      if (thread.status !== "merged") {
        excludedItems.push(
          item({
            id: `ctx-local-thread-${thread.id}`,
            type: "local_thread",
            sourceId: thread.id,
            text: thread.payload?.summary?.toString() ?? "",
            reason: "because ordinary_local_thread_not_merged",
            included: false
          })
        );
      }
    }

    for (const merge of input.mergeRecords ?? []) {
      if (merge.status === "deleted") {
        excludedItems.push(
          item({
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

      if (merge.status === "confirmed") {
        const localFocusMatches =
          Boolean(input.activeLocalThreadId) &&
          merge.sourceLocalThreadId === input.activeLocalThreadId;
        const selectionFocusMatches =
          Boolean(input.activeSelectionId) &&
          (merge.sourceSelectionId === input.activeSelectionId ||
            merge.targetSelectionId === input.activeSelectionId);

        if (input.callType !== "main_conversation" && (localFocusMatches || selectionFocusMatches)) {
          includedItems.push(
            item({
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

        continue;
      }

      excludedItems.push(
        item({
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
                  : "because pending_merge_not_confirmed",
          included: false
        })
      );
    }

    for (const branch of input.revisionBranches ?? []) {
      if (branch.status === "deleted") {
        excludedItems.push(
          item({
            id: `ctx-branch-${branch.id}`,
            type: "revision_branch",
            sourceId: branch.id,
            text: "",
            reason: excludedStateReason(branch.status),
            included: false
          })
        );
        continue;
      }

      if (branch.status === "discarded") {
        excludedItems.push(
          item({
            id: `ctx-branch-${branch.id}`,
            type: "revision_branch",
            sourceId: branch.id,
            text: branch.payload?.summary?.toString() ?? "",
            reason: excludedStateReason(branch.status),
            included: false
          })
        );
        continue;
      }

      if (branch.status !== "merged") {
        excludedItems.push(
          item({
            id: `ctx-branch-${branch.id}`,
            type: "revision_branch",
            sourceId: branch.id,
            text: branch.payload?.summary?.toString() ?? "",
            reason: "because unmerged_branch",
            included: false
          })
        );
      }
    }

    const pinnedComparisonIds = new Set(input.pinnedComparisonIds ?? []);
    for (const graph of input.comparisonGraphs ?? []) {
      const activeRun =
        (input.activeComparisonRunId
          ? input.comparisonRuns?.find(
              (run) => run.id === input.activeComparisonRunId
            )
          : undefined) ??
        (graph.activeRunId
          ? input.comparisonRuns?.find((run) => run.id === graph.activeRunId)
          : undefined);
      const isActiveComparison =
        input.activeComparisonId === graph.id ||
        input.comparisonId === graph.id ||
        pinnedComparisonIds.has(graph.id);

      if (graph.status === "deleted" || activeRun?.status === "deleted") {
        excludedItems.push(
          item({
            id: `ctx-comparison-${graph.id}`,
            type: "excluded_comparison",
            sourceId: graph.id,
            text: "",
            reason: comparisonReason("deleted"),
            included: false
          })
        );
        continue;
      }

      if (graph.status === "discarded" || graph.status === "cleared") {
        excludedItems.push(
          item({
            id: `ctx-comparison-${graph.id}`,
            type: "excluded_comparison",
            sourceId: graph.id,
            text: comparisonSnapshotText(graph, activeRun),
            reason: comparisonReason(graph.status),
            included: false
          })
        );
        continue;
      }

      if (isActiveComparison && activeRun?.status === "active") {
        includedItems.push(
          item({
            id: `ctx-comparison-${graph.id}`,
            type: "included_comparison",
            sourceId: graph.id,
            text: comparisonSnapshotText(graph, activeRun),
            reason: "active_comparison_panel_context",
            included: true
          })
        );
        for (const source of graph.sourceSnapshot ?? []) {
          const objectId =
            typeof source.object_id === "string" ? source.object_id : undefined;
          includedItems.push(
            item({
              id: `ctx-comparison-source-${graph.id}-${objectId ?? includedItems.length}`,
              type: "comparison_source_object",
              sourceId: objectId,
              text: typeof source.content === "string" ? source.content : "",
              reason: "active_comparison_panel_context",
              included: true
            })
          );
        }
        includedItems.push(
          item({
            id: `ctx-comparison-graph-data-${graph.id}`,
            type: "comparison_graph_data",
            sourceId: activeRun.id,
            text: JSON.stringify({
              summary: activeRun.summary,
              graph: activeRun.graphData,
              semantic_groups: activeRun.semanticGroups
            }),
            reason: "active_comparison_panel_context",
            included: true
          })
        );
        continue;
      }

      excludedItems.push(
        item({
          id: `ctx-comparison-${graph.id}`,
          type: "excluded_comparison",
          sourceId: graph.id,
          text: comparisonSnapshotText(graph, activeRun),
          reason:
            (input.activeComparisonId || input.comparisonId) &&
            graph.scopeType &&
            graph.scopeId
              ? "unrelated_comparison_scope"
              : comparisonReason(graph.status),
          included: false
        })
      );
    }

    for (const node of input.timelineNodes ?? []) {
      if (node.status === "inactive" || !activeNodeIds.has(node.id)) {
        excludedItems.push(
          item({
            id: `ctx-timeline-node-${node.id}`,
            type: "timeline_node",
            sourceId: node.id,
            text: node.status === "deleted" ? "" : node.label,
            reason:
              node.status === "inactive"
                ? excludedStateReason(node.status)
                : "because timeline_node_not_on_active_path",
            included: false
          })
        );
      }
    }

    return {
      id: input.id ?? `context-snapshot-${input.llmCallId}`,
      llmCallId: input.llmCallId,
      projectId: input.projectId,
      callType: input.callType,
      purpose: input.purpose,
      model: input.model,
      windowId: input.windowId,
      sessionId: input.sessionId,
      documentId: input.documentId,
      activeVersionNodeId: input.activeVersionNodeId,
      threadId: input.threadId,
      threadType: input.threadType,
      comparisonId: input.comparisonId,
      includedItems,
      excludedItems,
      tokenEstimate: estimateTokens(includedItems),
      createdAt: input.createdAt ?? new Date().toISOString(),
      metadata: {
        active_document_version_id: input.activeDocumentVersion?.id,
        active_document_version_number: input.activeDocumentVersion?.versionNumber,
        active_document_version_source_type: input.activeDocumentVersion?.sourceType
      }
    };
  }

  static saveContextSnapshot(
    state: Pick<RevisionRepositoryState, "contextSnapshots">,
    snapshot: ContextSnapshot
  ) {
    return {
      contextSnapshots: {
        ...state.contextSnapshots,
        [snapshot.id]: snapshot
      }
    };
  }

  static getContextSnapshot(
    state: Pick<RevisionRepositoryState, "contextSnapshots" | "llmCallRecords">,
    llmCallId: string
  ) {
    const call = state.llmCallRecords[llmCallId];

    if (!call) {
      return undefined;
    }

    return state.contextSnapshots[call.contextSnapshotId];
  }

  static createStartedLLMCall(params: {
    id: string;
    projectId: string;
    callType: LLMCallRecord["callType"];
    purpose: LLMCallRecord["purpose"];
    model: string;
    prompt: string;
    contextSnapshotId: string;
    windowId?: string;
    sessionId?: string;
    documentId?: string;
    activeVersionNodeId?: string;
    threadId?: string;
    threadType?: LLMCallRecord["threadType"];
    comparisonId?: string;
    createdAt: string;
  }): LLMCallRecord {
    return {
      id: params.id,
      projectId: params.projectId,
      callType: params.callType,
      purpose: params.purpose,
      model: params.model,
      status: "started",
      prompt: params.prompt,
      contextSnapshotId: params.contextSnapshotId,
      windowId: params.windowId,
      sessionId: params.sessionId,
      documentId: params.documentId,
      activeVersionNodeId: params.activeVersionNodeId,
      threadId: params.threadId,
      threadType: params.threadType,
      comparisonId: params.comparisonId,
      createdAt: params.createdAt,
      completedAt: params.createdAt
    };
  }
}
