import type {
  RelatedLocalSelectionObjects,
  RelatedAnnotationObjects,
  RelatedSelectionObjects,
  RevisionRepositoryState
} from "@/types/revision";
import { EventService } from "./EventService";
import { TimelineService } from "./TimelineService";
import { ContextSnapshotService } from "./ContextSnapshotService";
import { createEmptyRevisionState } from "./emptyRevisionState";
import { LocalSelectionService } from "./LocalSelectionService";
import { AnnotationService } from "./AnnotationService";
import { MergeService } from "./MergeService";
import { ObjectStateService } from "./ObjectStateService";
import { RevertService } from "./RevertService";
import { ComparisonService } from "./ComparisonService";
import { WorkspaceProjectionService } from "./WorkspaceProjectionService";
import { LocalThreadQueryService } from "./LocalThreadQueryService";
import { ComparisonGraphQueryService } from "./ComparisonGraphQueryService";

const globalRevisionState = globalThis as typeof globalThis & {
  __answerAtlasRevisionRepositoryState?: RevisionRepositoryState;
};

function getRepositoryState() {
  if (!globalRevisionState.__answerAtlasRevisionRepositoryState) {
    globalRevisionState.__answerAtlasRevisionRepositoryState =
      createEmptyRevisionState();
  }

  return globalRevisionState.__answerAtlasRevisionRepositoryState;
}

function setRepositoryState(nextState: RevisionRepositoryState) {
  globalRevisionState.__answerAtlasRevisionRepositoryState = nextState;

  return nextState;
}

function mergeRecords<T>(current: Record<string, T> = {}, incoming?: Record<string, T>) {
  return incoming
    ? {
        ...current,
        ...incoming
      }
    : current;
}

export const revisionRepository = {
  getState() {
    return getRepositoryState();
  },

  replaceState(nextState: RevisionRepositoryState) {
    return setRepositoryState(nextState);
  },

  mergeState(partial: Partial<RevisionRepositoryState>) {
    const repositoryState = getRepositoryState();
    const nextState = {
      projects: mergeRecords(repositoryState.projects, partial.projects),
      mainConversations: mergeRecords(
        repositoryState.mainConversations,
        partial.mainConversations
      ),
      revisionMessages: mergeRecords(
        repositoryState.revisionMessages,
        partial.revisionMessages
      ),
      documentVersions: mergeRecords(
        repositoryState.documentVersions,
        partial.documentVersions
      ),
      manualEditDrafts: mergeRecords(
        repositoryState.manualEditDrafts,
        partial.manualEditDrafts
      ),
      textSelections: mergeRecords(
        repositoryState.textSelections,
        partial.textSelections
      ),
      localThreads: mergeRecords(repositoryState.localThreads, partial.localThreads),
      localSelections: mergeRecords(
        repositoryState.localSelections,
        partial.localSelections
      ),
      annotations: mergeRecords(repositoryState.annotations, partial.annotations),
      revisionBranches: mergeRecords(
        repositoryState.revisionBranches,
        partial.revisionBranches
      ),
      mergeRecords: mergeRecords(repositoryState.mergeRecords, partial.mergeRecords),
      comparisonGraphs: mergeRecords(
        repositoryState.comparisonGraphs,
        partial.comparisonGraphs
      ),
      comparisonRuns: mergeRecords(
        repositoryState.comparisonRuns,
        partial.comparisonRuns
      ),
      comparisonExports: mergeRecords(
        repositoryState.comparisonExports,
        partial.comparisonExports
      ),
      objectStateTransitions: mergeRecords(
        repositoryState.objectStateTransitions,
        partial.objectStateTransitions
      ),
      timelinePaths: mergeRecords(
        repositoryState.timelinePaths,
        partial.timelinePaths
      ),
      revertRecords: mergeRecords(
        repositoryState.revertRecords,
        partial.revertRecords
      ),
      eventLogs: mergeRecords(repositoryState.eventLogs, partial.eventLogs),
      timelineNodes: mergeRecords(
        repositoryState.timelineNodes,
        partial.timelineNodes
      ),
      timelineEdges: mergeRecords(
        repositoryState.timelineEdges,
        partial.timelineEdges
      ),
      llmCallRecords: mergeRecords(
        repositoryState.llmCallRecords,
        partial.llmCallRecords
      ),
      contextSnapshots: mergeRecords(
        repositoryState.contextSnapshots,
        partial.contextSnapshots
      ),
      actionIdempotencyRecords: mergeRecords(
        repositoryState.actionIdempotencyRecords,
        partial.actionIdempotencyRecords
      ),
      migrationJobs: mergeRecords(
        repositoryState.migrationJobs,
        partial.migrationJobs
      ),
      migrationBatches: mergeRecords(
        repositoryState.migrationBatches,
        partial.migrationBatches
      ),
      migrationIssues: mergeRecords(
        repositoryState.migrationIssues,
        partial.migrationIssues
      ),
      backfillRecords: mergeRecords(
        repositoryState.backfillRecords,
        partial.backfillRecords
      ),
      featureFlags: mergeRecords(repositoryState.featureFlags, partial.featureFlags),
      workspaceIndexes: mergeRecords(
        repositoryState.workspaceIndexes,
        partial.workspaceIndexes
      ),
      workspaceMetrics: mergeRecords(
        repositoryState.workspaceMetrics,
        partial.workspaceMetrics
      ),
      timelineNodeProjections: mergeRecords(
        repositoryState.timelineNodeProjections,
        partial.timelineNodeProjections
      ),
      timelineGraphSnapshots: mergeRecords(
        repositoryState.timelineGraphSnapshots,
        partial.timelineGraphSnapshots
      ),
      objectRelationIndex: mergeRecords(
        repositoryState.objectRelationIndex,
        partial.objectRelationIndex
      ),
      contextItemIndex: mergeRecords(
        repositoryState.contextItemIndex,
        partial.contextItemIndex
      ),
      threadSummaries: mergeRecords(
        repositoryState.threadSummaries,
        partial.threadSummaries
      ),
      documentChunks: mergeRecords(
        repositoryState.documentChunks,
        partial.documentChunks
      ),
      contextBuildCaches: mergeRecords(
        repositoryState.contextBuildCaches,
        partial.contextBuildCaches
      )
    };

    return setRepositoryState(nextState);
  },

  getProjectTimelineGraph(projectId: string) {
    return TimelineService.getProjectTimelineGraph(
      getRepositoryState(),
      projectId
    );
  },

  getTimelineWindow(input: {
    projectId: string;
    conversationId?: string;
    anchorNodeId?: string;
    direction?: "before" | "after" | "around";
    limit?: number;
  }) {
    const stateWithProjections = WorkspaceProjectionService.rebuildTimelineNodeProjections({
      state: getRepositoryState(),
      projectId: input.projectId,
      conversationId: input.conversationId
    });
    setRepositoryState(stateWithProjections);

    return TimelineService.getTimelineWindow({
      state: stateWithProjections,
      ...input
    });
  },

  openProjectWorkspace(input: {
    projectId: string;
    conversationId?: string;
    timelineLimit?: number;
  }) {
    const state = getRepositoryState();
    const project = state.projects[input.projectId];
    const conversationId = input.conversationId ?? project?.activeConversationId;
    const conversation = conversationId
      ? state.mainConversations[conversationId]
      : undefined;
    const now = new Date().toISOString();
    const projectedState = WorkspaceProjectionService.rebuildTimelineNodeProjections({
      state,
      projectId: input.projectId,
      conversationId,
      now
    });
    const snapshotResult = TimelineService.createActivePathOverviewSnapshot({
      state: projectedState,
      projectId: input.projectId,
      conversationId,
      now
    });
    setRepositoryState(snapshotResult.state);
    const activeDocumentVersionId =
      conversation?.activeDocumentVersionId ??
      project?.activeDocumentVersionId ??
      Object.values(snapshotResult.state.documentVersions)
        .filter(
          (version) =>
            version.projectId === input.projectId &&
            (!conversationId || version.conversationId === conversationId) &&
            version.status === "active"
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0]?.id;
    const activeDocumentVersion = activeDocumentVersionId
      ? snapshotResult.state.documentVersions[activeDocumentVersionId]
      : undefined;

    return {
      project: project
        ? {
            id: project.id,
            name: project.name,
            status: project.status,
            activeConversationId: project.activeConversationId,
            activeTimelinePathId: project.activeTimelinePathId,
            activeTimelineNodeId: project.activeTimelineNodeId,
            activeDocumentVersionId: project.activeDocumentVersionId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
          }
        : undefined,
      conversation: conversation
        ? {
            id: conversation.id,
            projectId: conversation.projectId,
            title: conversation.title,
            status: conversation.status,
            activeTimelinePathId: conversation.activeTimelinePathId,
            activeTimelineNodeId: conversation.activeTimelineNodeId,
            activeDocumentVersionId: conversation.activeDocumentVersionId,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt
          }
        : undefined,
      currentDocumentVersion: activeDocumentVersion
        ? {
            id: activeDocumentVersion.id,
            versionNumber: activeDocumentVersion.versionNumber,
            parentDocumentVersionId: activeDocumentVersion.parentDocumentVersionId,
            sourceType: activeDocumentVersion.sourceType,
            sourceId: activeDocumentVersion.sourceId,
            status: activeDocumentVersion.status,
            contentHash: activeDocumentVersion.contentHash,
            createdAt: activeDocumentVersion.createdAt
          }
        : undefined,
      activePathOverview: snapshotResult.overview,
      activePathOverviewSnapshot: snapshotResult.snapshot,
      initialTimelineWindow: TimelineService.getTimelineWindow({
        state: snapshotResult.state,
        projectId: input.projectId,
        conversationId,
        anchorNodeId: snapshotResult.overview.headNodeId,
        direction: "around",
        limit: input.timelineLimit ?? 50
      })
    };
  },

  getActivePath(projectId: string, conversationId?: string) {
    return TimelineService.getActivePath(
      getRepositoryState(),
      projectId,
      conversationId
    );
  },

  getActivePathNodes(projectId: string, conversationId?: string) {
    return TimelineService.getActivePathNodes(
      getRepositoryState(),
      projectId,
      conversationId
    );
  },

  getEventsForObject(objectType: string, objectId: string) {
    return EventService.getEventsForObject(
      getRepositoryState(),
      objectType as never,
      objectId
    );
  },

  getEventsForProject(projectId: string) {
    return EventService.getEventsForProject(getRepositoryState(), projectId);
  },

  getContextSnapshotForLLMCall(llmCallId: string) {
    return ContextSnapshotService.getContextSnapshot(
      getRepositoryState(),
      llmCallId
    );
  },

  discardObject(input: {
    objectType: Parameters<typeof ObjectStateService.discardObject>[0]["objectType"];
    objectId: string;
    reason: string;
    actorType?: "user" | "assistant" | "system";
    actorId?: string;
  }) {
    const result = ObjectStateService.discardObject({
      state: getRepositoryState(),
      objectType: input.objectType,
      objectId: input.objectId,
      reason: input.reason,
      actorType: input.actorType,
      actorId: input.actorId,
      now: new Date().toISOString(),
      suffix: `${input.objectType}-${input.objectId}-${Date.now().toString(36)}`
    });
    setRepositoryState(result.state);
    return result;
  },

  deleteObject(input: {
    objectType: Parameters<typeof ObjectStateService.deleteObject>[0]["objectType"];
    objectId: string;
    reason: string;
    confirmed: boolean;
    actorType?: "user" | "assistant" | "system";
    actorId?: string;
  }) {
    const result = ObjectStateService.deleteObject({
      state: getRepositoryState(),
      objectType: input.objectType,
      objectId: input.objectId,
      reason: input.reason,
      confirmed: input.confirmed,
      actorType: input.actorType,
      actorId: input.actorId,
      now: new Date().toISOString(),
      suffix: `${input.objectType}-${input.objectId}-${Date.now().toString(36)}`
    });
    setRepositoryState(result.state);
    return result;
  },

  restoreObject(input: {
    objectType: Parameters<typeof ObjectStateService.restoreObject>[0]["objectType"];
    objectId: string;
    reason: string;
    actorType?: "user" | "assistant" | "system";
    actorId?: string;
  }) {
    const result = ObjectStateService.restoreObject({
      state: getRepositoryState(),
      objectType: input.objectType,
      objectId: input.objectId,
      reason: input.reason,
      actorType: input.actorType,
      actorId: input.actorId,
      now: new Date().toISOString(),
      suffix: `${input.objectType}-${input.objectId}-${Date.now().toString(36)}`
    });
    setRepositoryState(result.state);
    return result;
  },

  previewRevert(input: {
    projectId: string;
    conversationId?: string;
    targetNodeId: string;
  }) {
    const result = RevertService.recordRevertPreview({
      state: getRepositoryState(),
      projectId: input.projectId,
      conversationId: input.conversationId,
      targetNodeId: input.targetNodeId,
      now: new Date().toISOString(),
      suffix: `${input.targetNodeId}-${Date.now().toString(36)}`
    });
    setRepositoryState(result.state);
    return result.preview;
  },

  confirmRevert(input: {
    projectId: string;
    conversationId?: string;
    targetNodeId: string;
  }) {
    const result = RevertService.confirmRevert({
      state: getRepositoryState(),
      projectId: input.projectId,
      conversationId: input.conversationId,
      targetNodeId: input.targetNodeId,
      now: new Date().toISOString(),
      suffix: `${input.targetNodeId}-${Date.now().toString(36)}`
    });
    setRepositoryState(result.state);
    return result;
  },

  getLLMCallRecord(llmCallId: string) {
    return getRepositoryState().llmCallRecords[llmCallId];
  },

  getRelatedObjectsForSelection(selectionId: string): RelatedSelectionObjects {
    let repositoryState = getRepositoryState();
    if (Object.keys(repositoryState.objectRelationIndex).length === 0) {
      repositoryState = WorkspaceProjectionService.rebuildObjectRelationIndex({
        state: repositoryState
      });
      setRepositoryState(repositoryState);
    }
    const indexedRelations = WorkspaceProjectionService.getRelationsForObject(
      repositoryState,
      "text_selection",
      selectionId
    );
    const relatedIdsFor = (type: Parameters<typeof WorkspaceProjectionService.getRelationsForObject>[1]) =>
      new Set(
        indexedRelations
          .map((relation) => {
            if (
              relation.sourceObjectType === "text_selection" &&
              relation.sourceObjectId === selectionId &&
              relation.relatedObjectType === type
            ) {
              return relation.relatedObjectId;
            }

            if (
              relation.relatedObjectType === "text_selection" &&
              relation.relatedObjectId === selectionId &&
              relation.sourceObjectType === type
            ) {
              return relation.sourceObjectId;
            }

            return undefined;
          })
          .filter(Boolean) as string[]
      );
    const localThreadIds = relatedIdsFor("local_thread");
    const annotationIds = relatedIdsFor("annotation");
    const branchIds = relatedIdsFor("revision_branch");
    const mergeIds = relatedIdsFor("merge_record");
    const comparisonIds = relatedIdsFor("comparison_graph");
    const localThreads = [...localThreadIds]
      .map((id) => repositoryState.localThreads[id])
      .filter(Boolean);
    const localSelections = Object.values(repositoryState.localSelections).filter(
      (selection) => selection.parentSelectionId === selectionId
    );
    const annotations = [...annotationIds]
      .map((id) => repositoryState.annotations[id])
      .filter(Boolean);
    const revisionBranches = [...branchIds]
      .map((id) => repositoryState.revisionBranches[id])
      .filter(Boolean);
    const mergeRecords = [...mergeIds]
      .map((id) => repositoryState.mergeRecords[id])
      .filter(Boolean);
    const comparisonGraphs = [...comparisonIds]
      .map((id) => repositoryState.comparisonGraphs[id])
      .filter(Boolean);
    const events = Object.values(repositoryState.eventLogs).filter(
      (event) => event.objectId === selectionId
    );

    return {
      selectionId,
      localThreads,
      localSelections,
      annotations,
      revisionBranches,
      mergeRecords,
      comparisonGraphs,
      events
    };
  },

  openLocalThread(threadId: string, limit?: number) {
    const result = LocalThreadQueryService.openLocalThread({
      state: getRepositoryState(),
      threadId,
      limit
    });
    setRepositoryState(result.state);
    return result;
  },

  getContextSnapshotSummary(snapshotId: string) {
    const snapshot = getRepositoryState().contextSnapshots[snapshotId];
    return snapshot
      ? ContextSnapshotService.getContextReviewSummary(snapshot)
      : undefined;
  },

  getContextSnapshotItems(input: {
    snapshotId: string;
    group: "included" | "excluded" | "compressed" | "truncated";
    limit?: number;
    cursor?: string;
  }) {
    const snapshot = getRepositoryState().contextSnapshots[input.snapshotId];
    return snapshot
      ? ContextSnapshotService.getContextSnapshotItemsPage({
          snapshot,
          group: input.group,
          limit: input.limit,
          cursor: input.cursor
        })
      : undefined;
  },

  getRelatedObjectsForLocalSelection(
    localSelectionId: string
  ): RelatedLocalSelectionObjects {
    return LocalSelectionService.getRelatedObjectsForLocalSelection(
      getRepositoryState(),
      localSelectionId
    );
  },

  getRelatedAnnotations(input: {
    scopeType?: RelatedAnnotationObjects["scopeType"];
    scopeId?: string;
    sourceType?: RelatedAnnotationObjects["sourceType"];
    sourceId?: string;
  }): RelatedAnnotationObjects {
    return {
      ...input,
      annotations: AnnotationService.getRelatedAnnotations({
        state: getRepositoryState(),
        ...input
      })
    };
  },

  getMergeRecord(mergeId: string) {
    return MergeService.getMergeRecord(getRepositoryState(), mergeId);
  },

  getMergeRecordsForSelection(selectionId: string) {
    return MergeService.getMergeRecordsForSelection(
      getRepositoryState(),
      selectionId
    );
  },

  getMergeRecordsForLocalThread(localThreadId: string) {
    return MergeService.getMergeRecordsForLocalThread(
      getRepositoryState(),
      localThreadId
    );
  },

  getMergeRecordsForBranch(branchId: string) {
    return MergeService.getMergeRecordsForBranch(getRepositoryState(), branchId);
  },

  createComparison(input: Omit<Parameters<typeof ComparisonService.createComparison>[0], "state">) {
    const result = ComparisonService.createComparison({
      ...input,
      state: getRepositoryState()
    });
    setRepositoryState(result.state);
    return result;
  },

  regenerateComparison(
    comparisonId: string,
    options: Omit<
      Parameters<typeof ComparisonService.regenerateComparison>[0],
      "state" | "comparisonId"
    >
  ) {
    const result = ComparisonService.regenerateComparison({
      ...options,
      state: getRepositoryState(),
      comparisonId
    });
    setRepositoryState(result.state);
    return result;
  },

  clearComparison(
    comparisonId: string,
    options: Omit<
      Parameters<typeof ComparisonService.clearComparison>[0],
      "state" | "comparisonId"
    >
  ) {
    const result = ComparisonService.clearComparison({
      ...options,
      state: getRepositoryState(),
      comparisonId
    });
    setRepositoryState(result.state);
    return result;
  },

  exportComparison(input: Omit<Parameters<typeof ComparisonService.exportComparison>[0], "state">) {
    const result = ComparisonService.exportComparison({
      ...input,
      state: getRepositoryState()
    });
    setRepositoryState(result.state);
    return result;
  },

  keepComparisonSummaryAsNote(
    input: Omit<
      Parameters<typeof ComparisonService.keepSummaryAsNote>[0],
      "state"
    >
  ) {
    const result = ComparisonService.keepSummaryAsNote({
      ...input,
      state: getRepositoryState()
    });
    setRepositoryState(result.state);
    return result;
  },

  getComparison(comparisonId: string) {
    return ComparisonService.getComparison(getRepositoryState(), comparisonId);
  },

  getComparisonRun(runId: string) {
    return ComparisonService.getComparisonRun(getRepositoryState(), runId);
  },

  getComparisonGraphSummary(comparisonId: string) {
    const state = getRepositoryState();
    const summary = ComparisonGraphQueryService.getGraphSummary({
      state,
      comparisonId
    });

    if (summary.useClusteredView) {
      setRepositoryState(
        ComparisonGraphQueryService.recordGraphClusteredEvent({
          state,
          comparisonId,
          runId: summary.activeRunId,
          nodeCount: summary.nodeCount,
          edgeCount: summary.edgeCount,
          now: new Date().toISOString()
        })
      );
    }

    return summary;
  },

  getComparisonGraphWindow(input: {
    runId: string;
    groupId?: string;
    cursor?: number;
    limit?: number;
  }) {
    const state = getRepositoryState();
    const result = ComparisonGraphQueryService.getGraphWindow({
      state,
      ...input
    });
    setRepositoryState(
      ComparisonGraphQueryService.recordGraphWindowLoadedEvent({
        state,
        runId: input.runId,
        groupId: input.groupId,
        cursor: input.cursor ?? 0,
        limit: input.limit ?? 50,
        returnedNodeCount: result.nodes.length,
        now: new Date().toISOString()
      })
    );

    return result;
  },

  getComparisonNodeSourceRefs(input: {
    runId: string;
    nodeId: string;
  }) {
    return ComparisonGraphQueryService.getNodeSourceRefs({
      state: getRepositoryState(),
      ...input
    });
  },

  getComparisonsForObject(objectType: string, objectId: string) {
    return ComparisonService.getComparisonsForObject(
      getRepositoryState(),
      objectType as never,
      objectId
    );
  },

  getComparisonsByScope(scopeType: string, scopeId: string) {
    return ComparisonService.getComparisonsByScope(
      getRepositoryState(),
      scopeType,
      scopeId
    );
  }
};
