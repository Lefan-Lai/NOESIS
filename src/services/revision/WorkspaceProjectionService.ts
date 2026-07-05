import type {
  AnnotationModel,
  ContextItemIndexModel,
  FlexiblePayload,
  MemoryEffect,
  MemoryScope,
  ObjectRelationIndexModel,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineNode,
  TimelineNodeProjectionModel
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";

function nowIso() {
  return new Date().toISOString();
}

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

function preview(text: string, length = 240) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, length - 3)}...`;
}

function objectTimelineNode(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  objectId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === objectType &&
        node.targetObjectId === objectId &&
        node.status !== "deleted"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function relationId(
  sourceType: RevisionObjectType,
  sourceId: string,
  relatedType: RevisionObjectType,
  relatedId: string,
  relationType: string
) {
  return [
    "relation",
    safeIdPart(sourceType),
    safeIdPart(sourceId),
    safeIdPart(relationType),
    safeIdPart(relatedType),
    safeIdPart(relatedId)
  ].join("-");
}

function addRelation(
  relations: Record<string, ObjectRelationIndexModel>,
  input: Omit<ObjectRelationIndexModel, "id" | "relationId" | "createdAt" | "status"> & {
    status?: ObjectRelationIndexModel["status"];
    createdAt?: string;
  }
) {
  const id = relationId(
    input.sourceObjectType,
    input.sourceObjectId,
    input.relatedObjectType,
    input.relatedObjectId,
    input.relationType
  );

  relations[id] = {
    id,
    relationId: id,
    projectId: input.projectId,
    conversationId: input.conversationId,
    sourceObjectType: input.sourceObjectType,
    sourceObjectId: input.sourceObjectId,
    relatedObjectType: input.relatedObjectType,
    relatedObjectId: input.relatedObjectId,
    relationType: input.relationType,
    timelineNodeId: input.timelineNodeId,
    createdAt: input.createdAt ?? nowIso(),
    status: input.status ?? "active",
    metadata: input.metadata
  };
}

function annotationScope(annotation: AnnotationModel) {
  return {
    scopeType: annotation.scopeType ?? annotation.scope,
    scopeId: annotation.scopeId ?? annotation.scopeObjectId
  };
}

function usableStatus(status: string) {
  return ![
    "deleted",
    "discarded",
    "inactive",
    "superseded",
    "pending",
    "cancelled",
    "failed",
    "conflict"
  ].includes(status);
}

function contextItemId(objectType: RevisionObjectType, objectId: string) {
  return `context-index-${safeIdPart(objectType)}-${safeIdPart(objectId)}`;
}

function contextIndexItem(input: {
  projectId: string;
  conversationId?: string;
  objectType: RevisionObjectType;
  objectId: string;
  text: string;
  status: ContextItemIndexModel["status"];
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  memoryPolicy?: ContextItemIndexModel["memoryPolicy"];
  scopeType?: ContextItemIndexModel["scopeType"];
  scopeId?: string;
  activePathId?: string;
  documentVersionId?: string;
  threadId?: string;
  selectionId?: string;
  localThreadId?: string;
  branchId?: string;
  comparisonId?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: FlexiblePayload;
}): ContextItemIndexModel {
  const deleted = input.status === "deleted";

  return {
    id: contextItemId(input.objectType, input.objectId),
    contextItemId: contextItemId(input.objectType, input.objectId),
    projectId: input.projectId,
    conversationId: input.conversationId,
    objectType: input.objectType,
    objectId: input.objectId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    memoryScope: input.memoryScope,
    memoryEffect: input.memoryEffect,
    memoryPolicy: deleted ? "never_include" : input.memoryPolicy,
    status: input.status,
    activePathId: input.activePathId,
    documentVersionId: input.documentVersionId,
    threadId: input.threadId,
    selectionId: input.selectionId,
    localThreadId: input.localThreadId,
    branchId: input.branchId,
    comparisonId: input.comparisonId,
    contentHash: deleted ? undefined : hashContent(input.text),
    contentPreview: deleted ? "" : preview(input.text),
    tokenEstimate: deleted ? 0 : tokenEstimate(input.text),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    invalidatedAt: usableStatus(input.status) ? null : input.updatedAt ?? input.createdAt,
    metadata: {
      ...(input.metadata ?? {}),
      usable: usableStatus(input.status)
    }
  };
}

export class WorkspaceProjectionService {
  static projectionFromNode(
    state: RevisionRepositoryState,
    node: RevisionTimelineNode,
    updatedAt = nowIso()
  ): TimelineNodeProjectionModel {
    const outgoing = Object.values(state.timelineEdges).filter(
      (edge) => edge.sourceNodeId === node.id && edge.status !== "deleted"
    );
    const incoming = Object.values(state.timelineEdges).filter(
      (edge) => edge.targetNodeId === node.id && edge.status !== "deleted"
    );
    const related = Object.values(state.objectRelationIndex ?? {}).filter(
      (relation) =>
        relation.status !== "deleted" &&
        ((relation.sourceObjectType === node.targetObjectType &&
          relation.sourceObjectId === node.targetObjectId) ||
          (relation.relatedObjectType === node.targetObjectType &&
            relation.relatedObjectId === node.targetObjectId))
    );

    return {
      id: `projection-${node.id}`,
      projectionId: `projection-${node.id}`,
      projectId: node.projectId,
      conversationId: node.conversationId,
      nodeId: node.id,
      eventType: node.eventType,
      targetObjectType: node.targetObjectType,
      targetObjectId: node.targetObjectId,
      title: node.label,
      summary: node.payload?.summary?.toString() ?? node.label,
      status: node.status,
      activePathId: node.activePathId,
      parentNodeId: node.parentNodeId,
      hasChildren: outgoing.length > 0,
      hasBranches: outgoing.some((edge) =>
        ["branch", "nested_branch", "continuation"].includes(edge.edgeType)
      ),
      hasMerges:
        outgoing.some((edge) => edge.edgeType === "merge_back" || edge.edgeType === "merge") ||
        incoming.some((edge) => edge.edgeType === "merge_back" || edge.edgeType === "merge") ||
        related.some((relation) => relation.relatedObjectType === "merge_record"),
      hasAnnotations: related.some((relation) => relation.relatedObjectType === "annotation"),
      hasComparisons: related.some(
        (relation) =>
          relation.relatedObjectType === "comparison_graph" ||
          relation.relatedObjectType === "comparison_run"
      ),
      hasContextSnapshot:
        node.affectedContextRefs?.length ? true :
        Object.values(state.contextSnapshots).some(
          (snapshot) =>
            snapshot.includedItems.some((item) => item.sourceId === node.targetObjectId) ||
            snapshot.excludedItems.some((item) => item.sourceId === node.targetObjectId)
        ),
      createdAt: node.timestamp,
      updatedAt,
      metadata: {
        memory_scope: node.memoryScope,
        memory_effect: node.memoryEffect,
        actor: node.actor
      }
    };
  }

  static rebuildTimelineNodeProjections(input: {
    state: RevisionRepositoryState;
    projectId?: string;
    conversationId?: string;
    now?: string;
  }) {
    const updatedAt = input.now ?? nowIso();
    const timelineNodeProjections = {
      ...input.state.timelineNodeProjections
    };
    const relevantEdges = Object.values(input.state.timelineEdges).filter(
      (edge) => edge.status !== "deleted"
    );
    const outgoingByNode = new Map<string, typeof relevantEdges>();
    const incomingByNode = new Map<string, typeof relevantEdges>();

    for (const edge of relevantEdges) {
      outgoingByNode.set(edge.sourceNodeId, [
        ...(outgoingByNode.get(edge.sourceNodeId) ?? []),
        edge
      ]);
      incomingByNode.set(edge.targetNodeId, [
        ...(incomingByNode.get(edge.targetNodeId) ?? []),
        edge
      ]);
    }

    const relationsByObject = new Map<string, ObjectRelationIndexModel[]>();
    for (const relation of Object.values(input.state.objectRelationIndex ?? {})) {
      if (relation.status === "deleted") {
        continue;
      }
      const sourceKey = `${relation.sourceObjectType}:${relation.sourceObjectId}`;
      const relatedKey = `${relation.relatedObjectType}:${relation.relatedObjectId}`;
      relationsByObject.set(sourceKey, [
        ...(relationsByObject.get(sourceKey) ?? []),
        relation
      ]);
      relationsByObject.set(relatedKey, [
        ...(relationsByObject.get(relatedKey) ?? []),
        relation
      ]);
    }

    for (const node of Object.values(input.state.timelineNodes)) {
      if (
        input.projectId &&
        node.projectId !== input.projectId
      ) {
        continue;
      }

      if (input.conversationId && node.conversationId !== input.conversationId) {
        continue;
      }

      const outgoing = outgoingByNode.get(node.id) ?? [];
      const incoming = incomingByNode.get(node.id) ?? [];
      const related = relationsByObject.get(`${node.targetObjectType}:${node.targetObjectId}`) ?? [];
      const projection: TimelineNodeProjectionModel = {
        id: `projection-${node.id}`,
        projectionId: `projection-${node.id}`,
        projectId: node.projectId,
        conversationId: node.conversationId,
        nodeId: node.id,
        eventType: node.eventType,
        targetObjectType: node.targetObjectType,
        targetObjectId: node.targetObjectId,
        title: node.label,
        summary: node.payload?.summary?.toString() ?? node.label,
        status: node.status,
        activePathId: node.activePathId,
        parentNodeId: node.parentNodeId,
        hasChildren: outgoing.length > 0,
        hasBranches: outgoing.some((edge) =>
          ["branch", "nested_branch", "continuation"].includes(edge.edgeType)
        ),
        hasMerges:
          outgoing.some((edge) => edge.edgeType === "merge_back" || edge.edgeType === "merge") ||
          incoming.some((edge) => edge.edgeType === "merge_back" || edge.edgeType === "merge") ||
          related.some((relation) => relation.relatedObjectType === "merge_record"),
        hasAnnotations: related.some((relation) => relation.relatedObjectType === "annotation"),
        hasComparisons: related.some(
          (relation) =>
            relation.relatedObjectType === "comparison_graph" ||
            relation.relatedObjectType === "comparison_run"
        ),
        hasContextSnapshot: Boolean(node.affectedContextRefs?.length),
        createdAt: node.timestamp,
        updatedAt,
        metadata: {
          memory_scope: node.memoryScope,
          memory_effect: node.memoryEffect,
          actor: node.actor
        }
      };
      timelineNodeProjections[projection.id] = projection;
    }

    return {
      ...input.state,
      timelineNodeProjections
    };
  }

  static markTimelineGraphSnapshotsStale(input: {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    reason: string;
    now?: string;
  }) {
    const now = input.now ?? nowIso();
    const invalidatedSnapshotIds: string[] = [];
    const timelineGraphSnapshots = Object.fromEntries(
      Object.entries(input.state.timelineGraphSnapshots).map(([id, snapshot]) => [
        id,
        snapshot.projectId === input.projectId &&
        (!input.conversationId || snapshot.conversationId === input.conversationId)
          ? (() => {
              if (snapshot.status !== "stale") {
                invalidatedSnapshotIds.push(snapshot.id);
              }

              return {
                ...snapshot,
                status: "stale" as const,
                updatedAt: now,
                metadata: {
                  ...(snapshot.metadata ?? {}),
                  stale_reason: input.reason
                }
              };
            })()
          : snapshot
      ])
    );

    const staleState: RevisionRepositoryState = {
      ...input.state,
      timelineGraphSnapshots
    };

    return invalidatedSnapshotIds.reduce(
      (state, snapshotId) =>
        MigrationTrackingService.createSystemEvent({
          state,
          eventType: "timeline.snapshot.invalidated",
          objectType: "timeline_graph_snapshot",
          objectId: snapshotId,
          projectId: input.projectId,
          now,
          payload: {
            conversation_id: input.conversationId,
            reason: input.reason
          }
        }),
      staleState
    );
  }

  static rebuildObjectRelationIndex(input: {
    state: RevisionRepositoryState;
    projectId?: string;
    conversationId?: string;
    now?: string;
  }) {
    const createdAt = input.now ?? nowIso();
    const relations: Record<string, ObjectRelationIndexModel> = {};
    const includeProject = (projectId: string, conversationId?: string) =>
      (!input.projectId || projectId === input.projectId) &&
      (!input.conversationId || conversationId === input.conversationId);

    for (const thread of Object.values(input.state.localThreads)) {
      if (!includeProject(thread.projectId, thread.conversationId)) continue;
      addRelation(relations, {
        projectId: thread.projectId,
        conversationId: thread.conversationId,
        sourceObjectType: "text_selection",
        sourceObjectId: thread.sourceSelectionId,
        relatedObjectType: "local_thread",
        relatedObjectId: thread.id,
        relationType: thread.threadType === "nested_local" ? "nested_local_thread" : "local_thread",
        timelineNodeId: objectTimelineNode(input.state, "local_thread", thread.id)?.id,
        createdAt,
        status: thread.status,
        metadata: { source: "local_thread.sourceSelectionId" }
      });

      if (thread.parentThreadId) {
        addRelation(relations, {
          projectId: thread.projectId,
          conversationId: thread.conversationId,
          sourceObjectType: "local_thread",
          sourceObjectId: thread.parentThreadId,
          relatedObjectType: "local_thread",
          relatedObjectId: thread.id,
          relationType: "nested_local_thread",
          timelineNodeId: objectTimelineNode(input.state, "local_thread", thread.id)?.id,
          createdAt,
          status: thread.status
        });
      }
    }

    for (const message of Object.values(input.state.revisionMessages)) {
      if (!includeProject(message.projectId, message.conversationId)) continue;
      if (message.threadId && message.threadType !== "main") {
        addRelation(relations, {
          projectId: message.projectId,
          conversationId: message.conversationId,
          sourceObjectType: "local_thread",
          sourceObjectId: message.threadId,
          relatedObjectType: "message",
          relatedObjectId: message.id,
          relationType: "thread_message",
          timelineNodeId: objectTimelineNode(input.state, "message", message.id)?.id,
          createdAt,
          status: message.status
        });
      }
    }

    for (const annotation of Object.values(input.state.annotations)) {
      if (!includeProject(annotation.projectId, annotation.conversationId)) continue;
      const scope = annotationScope(annotation);
      const sourceType: RevisionObjectType =
        scope.scopeType === "selected_text"
          ? "text_selection"
          : scope.scopeType === "local_thread" || scope.scopeType === "nested_local_thread"
            ? "local_thread"
            : scope.scopeType === "branch"
              ? "revision_branch"
              : scope.scopeType === "comparison"
                ? "comparison_graph"
                : "project";
      addRelation(relations, {
        projectId: annotation.projectId,
        conversationId: annotation.conversationId,
        sourceObjectType: sourceType,
        sourceObjectId: scope.scopeId ?? annotation.scopeObjectId,
        relatedObjectType: "annotation",
        relatedObjectId: annotation.id,
        relationType: "annotation",
        timelineNodeId: objectTimelineNode(input.state, "annotation", annotation.id)?.id,
        createdAt,
        status: annotation.status
      });

      if (annotation.sourceSelectionId) {
        addRelation(relations, {
          projectId: annotation.projectId,
          conversationId: annotation.conversationId,
          sourceObjectType: "text_selection",
          sourceObjectId: annotation.sourceSelectionId,
          relatedObjectType: "annotation",
          relatedObjectId: annotation.id,
          relationType: "annotation_from_selection",
          createdAt,
          status: annotation.status
        });
      }
    }

    for (const branch of Object.values(input.state.revisionBranches)) {
      if (!includeProject(branch.projectId)) continue;
      if (branch.parentSelectionId || branch.sourceObjectType === "text_selection") {
        addRelation(relations, {
          projectId: branch.projectId,
          sourceObjectType: "text_selection",
          sourceObjectId: branch.parentSelectionId ?? branch.sourceObjectId,
          relatedObjectType: "revision_branch",
          relatedObjectId: branch.id,
          relationType: "branch",
          timelineNodeId: objectTimelineNode(input.state, "revision_branch", branch.id)?.id,
          createdAt,
          status: branch.status
        });
      }
    }

    for (const merge of Object.values(input.state.mergeRecords)) {
      if (!includeProject(merge.projectId, merge.conversationId)) continue;
      if (merge.sourceSelectionId || merge.targetSelectionId || merge.sourceObjectType === "text_selection") {
        addRelation(relations, {
          projectId: merge.projectId,
          conversationId: merge.conversationId,
          sourceObjectType: "text_selection",
          sourceObjectId: merge.sourceSelectionId ?? merge.targetSelectionId ?? merge.sourceObjectId,
          relatedObjectType: "merge_record",
          relatedObjectId: merge.id,
          relationType: "merge_record",
          timelineNodeId: objectTimelineNode(input.state, "merge_record", merge.id)?.id,
          createdAt,
          status: merge.status
        });
      }
      if (merge.sourceLocalThreadId) {
        addRelation(relations, {
          projectId: merge.projectId,
          conversationId: merge.conversationId,
          sourceObjectType: "local_thread",
          sourceObjectId: merge.sourceLocalThreadId,
          relatedObjectType: "merge_record",
          relatedObjectId: merge.id,
          relationType: "merge_record",
          createdAt,
          status: merge.status
        });
      }
      if (merge.sourceBranchId) {
        addRelation(relations, {
          projectId: merge.projectId,
          conversationId: merge.conversationId,
          sourceObjectType: "revision_branch",
          sourceObjectId: merge.sourceBranchId,
          relatedObjectType: "merge_record",
          relatedObjectId: merge.id,
          relationType: "merge_record",
          createdAt,
          status: merge.status
        });
      }
    }

    for (const comparison of Object.values(input.state.comparisonGraphs)) {
      if (!includeProject(comparison.projectId, comparison.conversationId)) continue;
      (comparison.sourceObjectTypes ?? []).forEach((sourceType, index) => {
        const sourceId = comparison.sourceObjectIds[index];
        if (!sourceId) return;
        addRelation(relations, {
          projectId: comparison.projectId,
          conversationId: comparison.conversationId,
          sourceObjectType: sourceType,
          sourceObjectId: sourceId,
          relatedObjectType: "comparison_graph",
          relatedObjectId: comparison.id,
          relationType: "comparison_graph",
          timelineNodeId: objectTimelineNode(input.state, "comparison_graph", comparison.id)?.id,
          createdAt,
          status: comparison.status
        });
      });
    }

    for (const run of Object.values(input.state.comparisonRuns)) {
      if (!includeProject(run.projectId, run.conversationId)) continue;
      addRelation(relations, {
        projectId: run.projectId,
        conversationId: run.conversationId,
        sourceObjectType: "comparison_graph",
        sourceObjectId: run.comparisonId,
        relatedObjectType: "comparison_run",
        relatedObjectId: run.id,
        relationType: "comparison_run",
        timelineNodeId: objectTimelineNode(input.state, "comparison_run", run.id)?.id,
        createdAt,
        status: run.status
      });
    }

    for (const exported of Object.values(input.state.comparisonExports)) {
      if (!includeProject(exported.projectId, exported.conversationId)) continue;
      addRelation(relations, {
        projectId: exported.projectId,
        conversationId: exported.conversationId,
        sourceObjectType: "comparison_run",
        sourceObjectId: exported.comparisonRunId,
        relatedObjectType: "comparison_export",
        relatedObjectId: exported.id,
        relationType: "comparison_export",
        timelineNodeId: objectTimelineNode(input.state, "comparison_export", exported.id)?.id,
        createdAt,
        status: exported.status
      });
    }

    return {
      ...input.state,
      objectRelationIndex: {
        ...input.state.objectRelationIndex,
        ...relations
      }
    };
  }

  static getRelationsForObject(
    state: Pick<RevisionRepositoryState, "objectRelationIndex">,
    objectType: RevisionObjectType,
    objectId: string
  ) {
    return Object.values(state.objectRelationIndex).filter(
      (relation) =>
        relation.status !== "deleted" &&
        ((relation.sourceObjectType === objectType && relation.sourceObjectId === objectId) ||
          (relation.relatedObjectType === objectType && relation.relatedObjectId === objectId))
    );
  }

  static relatedObjectCounts(
    state: Pick<RevisionRepositoryState, "objectRelationIndex">,
    objectType: RevisionObjectType,
    objectId: string
  ) {
    return WorkspaceProjectionService.getRelationsForObject(
      state,
      objectType,
      objectId
    ).reduce<Record<string, number>>((counts, relation) => {
      const type =
        relation.sourceObjectType === objectType &&
        relation.sourceObjectId === objectId
          ? relation.relatedObjectType
          : relation.sourceObjectType;
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
  }

  static rebuildContextItemIndex(input: {
    state: RevisionRepositoryState;
    projectId?: string;
    conversationId?: string;
    now?: string;
  }) {
    const now = input.now ?? nowIso();
    const index: Record<string, ContextItemIndexModel> = {};
    const includeProject = (projectId: string, conversationId?: string) =>
      (!input.projectId || projectId === input.projectId) &&
      (!input.conversationId || conversationId === input.conversationId);

    for (const version of Object.values(input.state.documentVersions)) {
      if (!includeProject(version.projectId, version.conversationId)) continue;
      index[contextItemId("document_version", version.id)] = contextIndexItem({
        projectId: version.projectId,
        conversationId: version.conversationId,
        objectType: "document_version",
        objectId: version.id,
        text: version.content,
        status: version.status,
        memoryScope: "document",
        memoryEffect: version.status === "active" ? "included" : "excluded_inactive",
        memoryPolicy: version.status === "active" ? "active_document_version" : "manual_only",
        scopeType: "document_version",
        scopeId: version.id,
        documentVersionId: version.id,
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        metadata: { source_type: version.sourceType }
      });
    }

    for (const chunk of Object.values(input.state.documentChunks)) {
      if (!includeProject(chunk.projectId, chunk.conversationId)) continue;
      index[contextItemId("document_chunk", chunk.id)] = contextIndexItem({
        projectId: chunk.projectId,
        conversationId: chunk.conversationId,
        objectType: "document_chunk",
        objectId: chunk.id,
        text: chunk.content,
        status: chunk.status,
        memoryScope: "document",
        memoryEffect: chunk.status === "active" ? "included" : "excluded_inactive",
        memoryPolicy: "active_document_version",
        scopeType: "document_version",
        scopeId: chunk.documentVersionId,
        documentVersionId: chunk.documentVersionId,
        createdAt: chunk.createdAt,
        updatedAt: chunk.updatedAt,
        metadata: { chunk_index: chunk.chunkIndex }
      });
    }

    for (const message of Object.values(input.state.revisionMessages)) {
      if (!includeProject(message.projectId, message.conversationId)) continue;
      index[contextItemId("message", message.id)] = contextIndexItem({
        projectId: message.projectId,
        conversationId: message.conversationId,
        objectType: "message",
        objectId: message.id,
        text: message.content,
        status: message.status,
        memoryScope: message.memoryScope,
        memoryEffect: message.includeInContext ? "included" : "none",
        memoryPolicy: message.includeInContext ? "auto_by_scope" : "manual_only",
        scopeType: "thread",
        scopeId: message.threadId ?? message.conversationId,
        threadId: message.threadId ?? message.conversationId,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
        metadata: { role: message.role, thread_type: message.threadType ?? "main" }
      });
    }

    for (const summary of Object.values(input.state.threadSummaries)) {
      if (!includeProject(summary.projectId, summary.conversationId)) continue;
      index[contextItemId("thread_summary", summary.id)] = contextIndexItem({
        projectId: summary.projectId,
        conversationId: summary.conversationId,
        objectType: "thread_summary",
        objectId: summary.id,
        text: summary.summaryText,
        status: summary.status === "stale" ? "inactive" : summary.status,
        memoryScope:
          summary.threadType === "local" || summary.threadType === "nested_local"
            ? "local_thread"
            : "conversation",
        memoryEffect: "included",
        memoryPolicy: "auto_by_scope",
        scopeType: "thread",
        scopeId: summary.threadId,
        threadId: summary.threadId,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        metadata: { covered_message_ids: summary.coveredMessageIds }
      });
    }

    for (const annotation of Object.values(input.state.annotations)) {
      if (!includeProject(annotation.projectId, annotation.conversationId)) continue;
      const scope = annotationScope(annotation);
      index[contextItemId("annotation", annotation.id)] = contextIndexItem({
        projectId: annotation.projectId,
        conversationId: annotation.conversationId,
        objectType: "annotation",
        objectId: annotation.id,
        text: annotation.content,
        status: annotation.status,
        memoryScope: annotation.scope,
        memoryEffect: annotation.includeInContext ? "included" : "none",
        memoryPolicy: annotation.memoryPolicy,
        scopeType: scope.scopeType as ContextItemIndexModel["scopeType"],
        scopeId: scope.scopeId,
        selectionId: annotation.sourceSelectionId,
        localThreadId: annotation.sourceLocalThreadId,
        branchId: annotation.sourceBranchId,
        documentVersionId: annotation.sourceDocumentVersionId,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt
      });
    }

    for (const branch of Object.values(input.state.revisionBranches)) {
      if (!includeProject(branch.projectId)) continue;
      index[contextItemId("revision_branch", branch.id)] = contextIndexItem({
        projectId: branch.projectId,
        objectType: "revision_branch",
        objectId: branch.id,
        text: branch.draftContent ?? branch.content ?? "",
        status: branch.status,
        memoryScope: branch.memoryScope,
        memoryEffect: branch.memoryEffect ?? "none",
        memoryPolicy: branch.status === "merged" ? "auto_by_scope" : "manual_only",
        scopeType: "branch",
        scopeId: branch.id,
        branchId: branch.id,
        selectionId: branch.parentSelectionId,
        localThreadId: branch.sourceLocalThreadId,
        documentVersionId: branch.baseDocumentVersionId,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      });
    }

    for (const merge of Object.values(input.state.mergeRecords)) {
      if (!includeProject(merge.projectId, merge.conversationId)) continue;
      index[contextItemId("merge_record", merge.id)] = contextIndexItem({
        projectId: merge.projectId,
        conversationId: merge.conversationId,
        objectType: "merge_record",
        objectId: merge.id,
        text: JSON.stringify({
          source_text: merge.status === "deleted" ? "" : merge.sourceText,
          diff_summary: merge.diffSummary,
          result_document_version_id: merge.resultDocumentVersionId
        }),
        status: merge.status as ContextItemIndexModel["status"],
        memoryScope: "document",
        memoryEffect: merge.status === "confirmed" ? "updates_document_memory" : "none",
        memoryPolicy: merge.status === "confirmed" ? "auto_by_scope" : "manual_only",
        scopeType: "document_version",
        scopeId: merge.resultDocumentVersionId ?? merge.targetDocumentVersionId,
        documentVersionId: merge.resultDocumentVersionId ?? merge.targetDocumentVersionId,
        selectionId: merge.sourceSelectionId ?? merge.targetSelectionId,
        localThreadId: merge.sourceLocalThreadId,
        branchId: merge.sourceBranchId,
        createdAt: merge.createdAt,
        updatedAt: merge.updatedAt ?? merge.createdAt
      });
    }

    for (const run of Object.values(input.state.comparisonRuns)) {
      if (!includeProject(run.projectId, run.conversationId)) continue;
      index[contextItemId("comparison_run", run.id)] = contextIndexItem({
        projectId: run.projectId,
        conversationId: run.conversationId,
        objectType: "comparison_run",
        objectId: run.id,
        text: [run.summary, run.differenceSummary, run.conflictSummary]
          .filter(Boolean)
          .join("\n"),
        status: run.status as ContextItemIndexModel["status"],
        memoryScope: "comparison",
        memoryEffect: "none",
        memoryPolicy: "manual_only",
        scopeType: "comparison",
        scopeId: run.comparisonId,
        comparisonId: run.comparisonId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt
      });
    }

    for (const selection of Object.values(input.state.textSelections)) {
      if (!includeProject(selection.projectId, selection.conversationId)) continue;
      index[contextItemId("text_selection", selection.id)] = contextIndexItem({
        projectId: selection.projectId,
        conversationId: selection.conversationId,
        objectType: "text_selection",
        objectId: selection.id,
        text: selection.selectedText,
        status: selection.status,
        memoryScope: "selected_text",
        memoryEffect: "local_only",
        memoryPolicy: "manual_only",
        scopeType: "selected_text",
        scopeId: selection.id,
        selectionId: selection.id,
        documentVersionId: selection.sourceDocumentVersionId,
        createdAt: selection.createdAt,
        updatedAt: selection.createdAt
      });
    }

    for (const selection of Object.values(input.state.localSelections)) {
      if (!includeProject(selection.projectId, selection.conversationId)) continue;
      index[contextItemId("local_selection", selection.id)] = contextIndexItem({
        projectId: selection.projectId,
        conversationId: selection.conversationId,
        objectType: "local_selection",
        objectId: selection.id,
        text: selection.selectedText,
        status: selection.status,
        memoryScope: "nested_local_thread",
        memoryEffect: "local_only",
        memoryPolicy: "manual_only",
        scopeType: "local_thread",
        scopeId: selection.sourceLocalThreadId,
        selectionId: selection.parentSelectionId,
        localThreadId: selection.sourceLocalThreadId,
        documentVersionId: selection.sourceDocumentVersionId,
        createdAt: selection.createdAt,
        updatedAt: selection.createdAt
      });
    }

    return {
      ...input.state,
      contextItemIndex: {
        ...input.state.contextItemIndex,
        ...index
      }
    };
  }
}
