import type {
  ContextBuildCacheModel,
  RevisionEventType,
  RevisionObjectType,
  RevisionRepositoryState
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";

export const CONTEXT_RULES_VERSION = "phase-11-v1";

const INVALIDATING_EVENTS: RevisionEventType[] = [
  "document.version.created",
  "document.manual_edited",
  "merge.confirmed",
  "annotation.created",
  "annotation.updated",
  "annotation.scope_changed",
  "annotation.discarded",
  "annotation.deleted",
  "annotation.restored",
  "local_message.user.created",
  "local_message.assistant.created",
  "nested_local_message.user.created",
  "nested_local_message.assistant.created",
  "branch.created",
  "branch.updated",
  "branch.discarded",
  "branch.deleted",
  "comparison.regenerated",
  "object.deleted",
  "object.discarded",
  "object.restored",
  "timeline.reverted",
  "timeline.active_path_changed"
];

function stableFingerprint(value: unknown) {
  return hashContent(JSON.stringify(value, Object.keys(value as object).sort()));
}

function cacheId(params: {
  projectId: string;
  conversationId?: string;
  threadType?: string;
  threadId?: string;
  scopeType?: string;
  scopeId?: string;
  activeDocumentVersionId?: string;
  activeTimelineNodeId?: string;
  activePathId?: string;
  contextRulesVersion: string;
  inputFingerprint: string;
}) {
  return [
    "context-cache",
    params.projectId,
    params.conversationId ?? "none",
    params.threadType ?? "main",
    params.threadId ?? "none",
    params.scopeType ?? "none",
    params.scopeId ?? "none",
    params.activeDocumentVersionId ?? "none",
    params.activeTimelineNodeId ?? "none",
    params.activePathId ?? "none",
    params.contextRulesVersion,
    params.inputFingerprint
  ]
    .map((item) => item.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80))
    .join("-");
}

export class ContextBuildCacheService {
  static inputFingerprint(input: Record<string, unknown>) {
    return stableFingerprint(input);
  }

  static buildCacheKey(params: Omit<Parameters<typeof cacheId>[0], "contextRulesVersion"> & {
    contextRulesVersion?: string;
  }) {
    return cacheId({
      ...params,
      contextRulesVersion: params.contextRulesVersion ?? CONTEXT_RULES_VERSION
    });
  }

  static getCache(
    state: Pick<RevisionRepositoryState, "contextBuildCaches">,
    cacheKey: string,
    now = new Date().toISOString()
  ) {
    const cache = state.contextBuildCaches[cacheKey];

    if (!cache || cache.status !== "active") {
      return undefined;
    }

    if (cache.invalidatedAt) {
      return undefined;
    }

    if (cache.expiresAt && new Date(cache.expiresAt).getTime() <= new Date(now).getTime()) {
      return undefined;
    }

    return cache;
  }

  static saveCache(input: {
    state: RevisionRepositoryState;
    cacheKey: string;
    projectId: string;
    conversationId?: string;
    threadType?: ContextBuildCacheModel["threadType"];
    threadId?: string;
    scopeType?: string;
    scopeId?: string;
    activeDocumentVersionId?: string;
    activeTimelineNodeId?: string;
    activePathId?: string;
    inputFingerprint: string;
    includedItemRefs: ContextBuildCacheModel["includedItemRefs"];
    excludedItemRefs: ContextBuildCacheModel["excludedItemRefs"];
    compressedItemRefs?: ContextBuildCacheModel["compressedItemRefs"];
    tokenEstimate: number;
    now?: string;
    ttlMs?: number;
    metadata?: Record<string, unknown>;
  }) {
    const now = input.now ?? new Date().toISOString();
    const cache: ContextBuildCacheModel = {
      id: input.cacheKey,
      contextCacheId: input.cacheKey,
      projectId: input.projectId,
      conversationId: input.conversationId,
      threadType: input.threadType,
      threadId: input.threadId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      activeDocumentVersionId: input.activeDocumentVersionId,
      activeTimelineNodeId: input.activeTimelineNodeId,
      activePathId: input.activePathId,
      contextRulesVersion: CONTEXT_RULES_VERSION,
      inputFingerprint: input.inputFingerprint,
      includedItemRefs: input.includedItemRefs,
      excludedItemRefs: input.excludedItemRefs,
      compressedItemRefs: input.compressedItemRefs ?? [],
      tokenEstimate: input.tokenEstimate,
      status: "active",
      createdAt: now,
      expiresAt: input.ttlMs
        ? new Date(new Date(now).getTime() + input.ttlMs).toISOString()
        : undefined,
      invalidatedAt: null,
      metadata: input.metadata
    };

    return {
      state: MigrationTrackingService.createSystemEvent({
        state: {
          ...input.state,
          contextBuildCaches: {
            ...input.state.contextBuildCaches,
            [cache.id]: cache
          }
        },
        eventType: "context.cache.created",
        objectType: "context_build_cache",
        objectId: cache.id,
        projectId: input.projectId,
        now,
        payload: {
          conversation_id: input.conversationId,
          thread_type: input.threadType,
          thread_id: input.threadId,
          scope_type: input.scopeType,
          scope_id: input.scopeId,
          active_document_version_id: input.activeDocumentVersionId,
          active_timeline_node_id: input.activeTimelineNodeId,
          active_path_id: input.activePathId,
          included_count: input.includedItemRefs.length,
          excluded_count: input.excludedItemRefs.length,
          compressed_count: input.compressedItemRefs?.length ?? 0,
          token_estimate: input.tokenEstimate,
          context_rules_version: CONTEXT_RULES_VERSION
        }
      })
    }.state;
  }

  static recordCacheHit(input: {
    state: RevisionRepositoryState;
    cacheId: string;
    projectId?: string;
    conversationId?: string;
    now?: string;
    metadata?: Record<string, unknown>;
  }) {
    const now = input.now ?? new Date().toISOString();

    return MigrationTrackingService.createSystemEvent({
      state: input.state,
      eventType: "context.cache.hit",
      objectType: "context_build_cache",
      objectId: input.cacheId,
      projectId: input.projectId,
      now,
      payload: {
        conversation_id: input.conversationId,
        ...(input.metadata ?? {})
      }
    });
  }

  static invalidateCaches(input: {
    state: RevisionRepositoryState;
    reason: string;
    projectId?: string;
    conversationId?: string;
    objectType?: RevisionObjectType;
    objectId?: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    let count = 0;
    const contextBuildCaches = Object.fromEntries(
      Object.entries(input.state.contextBuildCaches).map(([id, cache]) => {
        const projectMatches = !input.projectId || cache.projectId === input.projectId;
        const conversationMatches =
          !input.conversationId || cache.conversationId === input.conversationId;
        const refsObject =
          !input.objectType ||
          !input.objectId ||
          [
            ...cache.includedItemRefs,
            ...cache.excludedItemRefs,
            ...cache.compressedItemRefs
          ].some(
            (ref) =>
              ref.object_type === input.objectType &&
              ref.object_id === input.objectId
          );

        if (
          cache.status === "active" &&
          projectMatches &&
          conversationMatches &&
          refsObject
        ) {
          count += 1;
          return [
            id,
            {
              ...cache,
              status: "stale" as const,
              invalidatedAt: now,
              metadata: {
                ...(cache.metadata ?? {}),
                invalidated_reason: input.reason
              }
            }
          ];
        }

        return [id, cache];
      })
    );
    let state: RevisionRepositoryState = {
      ...input.state,
      contextBuildCaches
    };

    if (count > 0) {
      state = WorkspaceObservabilityService.recordMetric({
        state,
        name: "cache_invalidation_count",
        value: count,
        projectId: input.projectId,
        conversationId: input.conversationId,
        now,
        metadata: {
          reason: input.reason,
          object_type: input.objectType,
          object_id: input.objectId
        }
      }).state;
      state = MigrationTrackingService.createSystemEvent({
        state,
        eventType: "context.cache.invalidated",
        objectType: "context_build_cache",
        objectId: `context-cache-invalidation-${hashContent(
          [
            input.projectId ?? "all-projects",
            input.conversationId ?? "all-conversations",
            input.objectType ?? "any-object",
            input.objectId ?? "any-id",
            input.reason,
            now
          ].join("|")
        )}`,
        projectId: input.projectId,
        now,
        payload: {
          reason: input.reason,
          invalidated_cache_count: count,
          conversation_id: input.conversationId,
          object_type: input.objectType,
          object_id: input.objectId
        }
      });
    }

    return state;
  }

  static invalidateForEvent(input: {
    state: RevisionRepositoryState;
    eventType: RevisionEventType;
    projectId?: string;
    conversationId?: string;
    objectType?: RevisionObjectType;
    objectId?: string;
    now?: string;
  }) {
    if (!INVALIDATING_EVENTS.includes(input.eventType)) {
      return input.state;
    }

    return ContextBuildCacheService.invalidateCaches({
      ...input,
      reason: input.eventType
    });
  }
}
