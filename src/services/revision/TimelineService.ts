import type {
  DocumentVersionModel,
  RevisionRepositoryState,
  TimelinePathModel,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TimelineNodeProjectionModel,
  TimelineGraph
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";
import { WorkspaceProjectionService } from "./WorkspaceProjectionService";

type TimelineNodeInput = RevisionTimelineNode;
type TimelineEdgeInput = RevisionTimelineEdge;
type ProjectionCapableState = Pick<RevisionRepositoryState, "timelineNodes"> &
  Partial<
    Pick<
      RevisionRepositoryState,
      | "timelineEdges"
      | "timelineNodeProjections"
      | "timelineGraphSnapshots"
      | "objectRelationIndex"
      | "contextItemIndex"
      | "contextSnapshots"
    >
  >;

function projectionForNode(
  state: RevisionRepositoryState | ProjectionCapableState,
  node: RevisionTimelineNode
): TimelineNodeProjectionModel {
  const projection = state.timelineNodeProjections?.[`projection-${node.id}`];

  if (projection) {
    return projection;
  }

  return WorkspaceProjectionService.projectionFromNode(
    {
      projects: {},
      mainConversations: {},
      revisionMessages: {},
      documentVersions: {},
      manualEditDrafts: {},
      textSelections: {},
      localThreads: {},
      localSelections: {},
      annotations: {},
      revisionBranches: {},
      mergeRecords: {},
      comparisonGraphs: {},
      comparisonRuns: {},
      comparisonExports: {},
      objectStateTransitions: {},
      timelinePaths: {},
      revertRecords: {},
      eventLogs: {},
      timelineNodes: state.timelineNodes,
      timelineEdges: state.timelineEdges ?? {},
      llmCallRecords: {},
      contextSnapshots: state.contextSnapshots ?? {},
      actionIdempotencyRecords: {},
      migrationJobs: {},
      migrationBatches: {},
      migrationIssues: {},
      backfillRecords: {},
      featureFlags: {},
      workspaceIndexes: {},
      workspaceMetrics: {},
      timelineNodeProjections: state.timelineNodeProjections ?? {},
      timelineGraphSnapshots: state.timelineGraphSnapshots ?? {},
      objectRelationIndex: state.objectRelationIndex ?? {},
      contextItemIndex: state.contextItemIndex ?? {},
      threadSummaries: {},
      documentChunks: {},
      contextBuildCaches: {}
    },
    node
  );
}

function projectionTime(projection: TimelineNodeProjectionModel) {
  return new Date(projection.createdAt).getTime();
}

function projectNodeProjections(
  state: RevisionRepositoryState,
  projectId: string,
  conversationId?: string
) {
  const projections = Object.values(state.timelineNodeProjections).filter(
    (projection) =>
      projection.projectId === projectId &&
      (!conversationId || projection.conversationId === conversationId)
  );

  if (projections.length > 0) {
    return projections;
  }

  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.projectId === projectId &&
        (!conversationId || node.conversationId === conversationId)
    )
    .map((node) => projectionForNode(state, node));
}

export class TimelineService {
  static createTimelineNode(
    state: ProjectionCapableState,
    input: TimelineNodeInput
  ): {
    timelineNode: RevisionTimelineNode;
    timelineNodes: RevisionRepositoryState["timelineNodes"];
    timelineNodeProjections?: RevisionRepositoryState["timelineNodeProjections"];
    timelineGraphSnapshots?: RevisionRepositoryState["timelineGraphSnapshots"];
  } {
    const existing = state.timelineNodes[input.id];

    if (existing) {
      return {
        timelineNode: existing,
        timelineNodes: state.timelineNodes,
        timelineNodeProjections: state.timelineNodeProjections,
        timelineGraphSnapshots: state.timelineGraphSnapshots
      };
    }

    const timelineNodes = {
      ...state.timelineNodes,
      [input.id]: input
    };
    const hasProjectionState = Boolean(state.timelineNodeProjections);
    const projectionState = hasProjectionState
      ? WorkspaceProjectionService.rebuildTimelineNodeProjections({
          state: {
            ...(state as RevisionRepositoryState),
            timelineNodes,
            timelineEdges: state.timelineEdges ?? {},
            timelineNodeProjections: state.timelineNodeProjections ?? {},
            timelineGraphSnapshots: state.timelineGraphSnapshots ?? {},
            objectRelationIndex: state.objectRelationIndex ?? {},
            contextItemIndex: state.contextItemIndex ?? {},
            contextSnapshots: state.contextSnapshots ?? {}
          },
          projectId: input.projectId,
          conversationId: input.conversationId,
          now: input.timestamp
        })
      : undefined;
    const staleState =
      projectionState && state.timelineGraphSnapshots
        ? WorkspaceProjectionService.markTimelineGraphSnapshotsStale({
            state: projectionState,
            projectId: input.projectId,
            conversationId: input.conversationId,
            reason: "timeline_node_created",
            now: input.timestamp
          })
        : projectionState;

    return {
      timelineNode: input,
      timelineNodes,
      timelineNodeProjections: staleState?.timelineNodeProjections,
      timelineGraphSnapshots: staleState?.timelineGraphSnapshots
    };
  }

  static createTimelineEdge(
    state: Pick<RevisionRepositoryState, "timelineEdges">,
    input: TimelineEdgeInput
  ): {
    timelineEdge: RevisionTimelineEdge;
    timelineEdges: RevisionRepositoryState["timelineEdges"];
  } {
    const existing = state.timelineEdges[input.id];

    if (existing) {
      return {
        timelineEdge: existing,
        timelineEdges: state.timelineEdges
      };
    }

    return {
      timelineEdge: input,
      timelineEdges: {
        ...state.timelineEdges,
        [input.id]: input
      }
    };
  }

  static getProjectTimelineGraph(
    state: Pick<RevisionRepositoryState, "timelineNodes" | "timelineEdges">,
    projectId: string
  ): TimelineGraph {
    const nodes = Object.values(state.timelineNodes)
      .filter((node) => node.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = Object.values(state.timelineEdges)
      .filter(
        (edge) =>
          edge.projectId === projectId &&
          nodeIds.has(edge.sourceNodeId) &&
          nodeIds.has(edge.targetNodeId)
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    return {
      projectId,
      nodes,
      edges
    };
  }

  static getActivePath(
    state: Pick<
      RevisionRepositoryState,
      "projects" | "mainConversations" | "timelinePaths"
    >,
    projectId: string,
    conversationId?: string
  ) {
    const conversationPathId = conversationId
      ? state.mainConversations[conversationId]?.activeTimelinePathId
      : undefined;
    const projectPathId = state.projects[projectId]?.activeTimelinePathId;
    const pathId = conversationPathId ?? projectPathId;

    if (pathId) {
      return state.timelinePaths[pathId];
    }

    return Object.values(state.timelinePaths)
      .filter(
        (path) =>
          path.projectId === projectId &&
          (!conversationId || path.conversationId === conversationId) &&
          path.status === "active"
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
  }

  static getActiveTimelineNode(
    state: Pick<
      RevisionRepositoryState,
      "projects" | "mainConversations" | "timelineNodes"
    >,
    projectId: string,
    conversationId?: string
  ) {
    const conversationActiveNodeId = conversationId
      ? state.mainConversations[conversationId]?.activeTimelineNodeId
      : undefined;
    const projectActiveNodeId = state.projects[projectId]?.activeTimelineNodeId;
    const activeNodeId = conversationActiveNodeId ?? projectActiveNodeId;

    if (activeNodeId) {
      return state.timelineNodes[activeNodeId];
    }

    return TimelineService.getLatestTimelineNodeForConversation(
      state,
      projectId,
      conversationId ?? ""
    );
  }

  static getAncestors(
    state: Pick<RevisionRepositoryState, "timelineNodes" | "timelineEdges">,
    nodeId: string
  ) {
    const ancestors: RevisionTimelineNode[] = [];
    const visited = new Set<string>();
    let current: RevisionTimelineNode | undefined = state.timelineNodes[nodeId];

    while (current && !visited.has(current.id)) {
      ancestors.push(current);
      visited.add(current.id);
      const parentId: string | undefined =
        current.parentNodeId ??
        Object.values(state.timelineEdges).find(
          (edge) => edge.targetNodeId === current!.id && edge.status !== "deleted"
        )?.sourceNodeId;
      current = parentId ? state.timelineNodes[parentId] : undefined;
    }

    return ancestors;
  }

  static getDescendants(
    state: Pick<RevisionRepositoryState, "timelineNodes" | "timelineEdges">,
    nodeId: string
  ) {
    const descendants: RevisionTimelineNode[] = [];
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const child of Object.values(state.timelineNodes)) {
        if (child.parentNodeId === currentId && !visited.has(child.id)) {
          visited.add(child.id);
          descendants.push(child);
          queue.push(child.id);
        }
      }

      for (const edge of Object.values(state.timelineEdges)) {
        if (
          edge.sourceNodeId === currentId &&
          edge.status !== "deleted" &&
          !visited.has(edge.targetNodeId)
        ) {
          const child = state.timelineNodes[edge.targetNodeId];
          if (child) {
            visited.add(child.id);
            descendants.push(child);
            queue.push(child.id);
          }
        }
      }
    }

    return descendants;
  }

  static getNearestDocumentVersionForNode(
    state: Pick<
      RevisionRepositoryState,
      "timelineNodes" | "timelineEdges" | "documentVersions"
    >,
    nodeId: string
  ): DocumentVersionModel | undefined {
    const ancestors = TimelineService.getAncestors(state, nodeId);

    for (const node of ancestors) {
      const documentVersionId =
        (node.payload?.document_version_after_id as string | undefined) ??
        (node.payload?.result_document_version_id as string | undefined) ??
        (node.targetObjectType === "document_version"
          ? node.targetObjectId
          : undefined);

      if (documentVersionId) {
        const version = state.documentVersions[documentVersionId];
        if (version && version.status !== "deleted") {
          return version;
        }
      }
    }

    return undefined;
  }

  static getNodesAfterTargetOnCurrentActivePath(
    state: Pick<
      RevisionRepositoryState,
      "projects" | "mainConversations" | "timelineNodes" | "timelineEdges"
    >,
    projectId: string,
    conversationId: string | undefined,
    targetNodeId: string
  ) {
    const activeNode = TimelineService.getActiveTimelineNode(
      state,
      projectId,
      conversationId
    );

    if (!activeNode || activeNode.id === targetNodeId) {
      return [];
    }

    const pathFromActive = TimelineService.getAncestors(state, activeNode.id);
    const targetIndex = pathFromActive.findIndex((node) => node.id === targetNodeId);

    if (targetIndex === -1) {
      return [];
    }

    return pathFromActive.slice(0, targetIndex);
  }

  static getActivePathNodes(
    state: Pick<
      RevisionRepositoryState,
      | "projects"
      | "mainConversations"
      | "timelinePaths"
      | "timelineNodes"
      | "timelineEdges"
    >,
    projectId: string,
    conversationId?: string
  ) {
    const activePath = TimelineService.getActivePath(
      state,
      projectId,
      conversationId
    );
    const headNodeId =
      activePath?.headNodeId ??
      TimelineService.getActiveTimelineNode(state, projectId, conversationId)?.id;

    if (!headNodeId) {
      return [];
    }

    return TimelineService.getAncestors(state, headNodeId)
      .reverse()
      .filter((node) => node.status !== "deleted" && node.status !== "discarded");
  }

  static markNodesInactive(
    state: Pick<RevisionRepositoryState, "timelineNodes">,
    nodeIds: string[]
  ) {
    const timelineNodes = { ...state.timelineNodes };

    for (const nodeId of nodeIds) {
      const node = timelineNodes[nodeId];
      if (!node || node.status === "deleted" || node.status === "discarded") {
        continue;
      }

      timelineNodes[nodeId] = {
        ...node,
        status: "inactive",
        memoryScope: node.memoryScope,
        memoryEffect: "excluded_inactive",
        payload: {
          ...node.payload,
          inactive_reason: "active_path_reverted"
        }
      };
    }

    return { timelineNodes };
  }

  static createContinuationPathFromNode(input: {
    state: Pick<RevisionRepositoryState, "timelinePaths">;
    projectId: string;
    conversationId?: string;
    nodeId: string;
    rootNodeId?: string;
    createdByEventId?: string;
    now: string;
    suffix: string;
    metadata?: Record<string, unknown>;
  }): {
    timelinePath: TimelinePathModel;
    timelinePaths: RevisionRepositoryState["timelinePaths"];
  } {
    const path: TimelinePathModel = {
      id: `timeline-path-${input.suffix}`,
      pathId: `timeline-path-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      rootNodeId: input.rootNodeId ?? input.nodeId,
      baseNodeId: input.nodeId,
      headNodeId: input.nodeId,
      createdFromNodeId: input.nodeId,
      createdByEventId: input.createdByEventId,
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
      metadata: input.metadata
    };

    return {
      timelinePath: path,
      timelinePaths: {
        ...input.state.timelinePaths,
        [path.id]: path
      }
    };
  }

  static setActiveNode(
    state: Pick<RevisionRepositoryState, "projects" | "mainConversations">,
    projectId: string,
    conversationId: string | undefined,
    nodeId: string,
    now = new Date().toISOString()
  ) {
    const project = state.projects[projectId];
    const conversation = conversationId
      ? state.mainConversations[conversationId]
      : undefined;

    return {
      projects: project
        ? {
            ...state.projects,
            [projectId]: {
              ...project,
              activeTimelineNodeId: nodeId,
              updatedAt: now
            }
          }
        : state.projects,
      mainConversations:
        conversation && conversationId
          ? {
              ...state.mainConversations,
              [conversationId]: {
                ...conversation,
                activeTimelineNodeId: nodeId,
                updatedAt: now
              }
            }
          : state.mainConversations
    };
  }

  static setActivePath(
    state: Pick<
      RevisionRepositoryState,
      "projects" | "mainConversations" | "timelinePaths"
    >,
    projectId: string,
    conversationId: string | undefined,
    pathId: string,
    now = new Date().toISOString()
  ) {
    const project = state.projects[projectId];
    const conversation = conversationId
      ? state.mainConversations[conversationId]
      : undefined;
    const timelinePaths = Object.fromEntries(
      Object.entries(state.timelinePaths).map(([id, path]) => [
        id,
        path.projectId === projectId &&
        (!conversationId || path.conversationId === conversationId)
          ? {
              ...path,
              status: id === pathId ? "active" : path.status === "deleted" ? "deleted" : "inactive",
              updatedAt: now
            }
          : path
      ])
    ) as RevisionRepositoryState["timelinePaths"];

    return {
      timelinePaths,
      projects: project
        ? {
            ...state.projects,
            [projectId]: {
              ...project,
              activeTimelinePathId: pathId,
              updatedAt: now
            }
          }
        : state.projects,
      mainConversations:
        conversation && conversationId
          ? {
              ...state.mainConversations,
              [conversationId]: {
                ...conversation,
                activeTimelinePathId: pathId,
                updatedAt: now
              }
            }
          : state.mainConversations
    };
  }

  static getTimelineForObject(
    state: Pick<RevisionRepositoryState, "timelineNodes" | "timelineEdges">,
    objectType: RevisionTimelineNode["targetObjectType"],
    objectId: string
  ) {
    const nodes = Object.values(state.timelineNodes)
      .filter(
        (node) =>
          node.targetObjectType === objectType && node.targetObjectId === objectId
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = Object.values(state.timelineEdges).filter(
      (edge) => nodeIds.has(edge.sourceNodeId) || nodeIds.has(edge.targetNodeId)
    );

    return {
      nodes,
      edges
    };
  }

  static getLatestTimelineNodeForConversation(
    state: Pick<RevisionRepositoryState, "timelineNodes">,
    projectId: string,
    conversationId: string
  ) {
    return Object.values(state.timelineNodes)
      .filter(
        (node) =>
          node.projectId === projectId &&
          (!conversationId || node.conversationId === conversationId) &&
          node.status !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
  }

  static getActivePathOverview(
    state: RevisionRepositoryState,
    projectId: string,
    conversationId?: string
  ) {
    const start = performance.now();
    const activePath = TimelineService.getActivePath(
      state,
      projectId,
      conversationId
    );
    const projections = projectNodeProjections(state, projectId, conversationId)
      .filter(
        (projection) =>
          !activePath?.id ||
          projection.activePathId === activePath.id ||
          projection.status === "active"
      )
      .sort((a, b) => projectionTime(a) - projectionTime(b));
    const overviewNodes = projections.slice(Math.max(0, projections.length - 10));
    const result = {
      projectId,
      conversationId,
      activePath,
      rootNodeId: activePath?.rootNodeId,
      headNodeId: activePath?.headNodeId,
      nodeCount: projections.length,
      returnedNodeCount: overviewNodes.length,
      fullNodeListTruncated: projections.length > overviewNodes.length,
      nodes: overviewNodes.map((projection) => ({
        projectionId: projection.id,
        nodeId: projection.nodeId,
        title: projection.title,
        eventType: projection.eventType,
        targetObjectType: projection.targetObjectType,
        targetObjectId: projection.targetObjectId,
        status: projection.status,
        hasBranches: projection.hasBranches,
        hasMerges: projection.hasMerges,
        hasAnnotations: projection.hasAnnotations,
        hasComparisons: projection.hasComparisons,
        createdAt: projection.createdAt
      }))
    };
    WorkspaceObservabilityService.recordMetric({
      state,
      name: "timeline_overview_latency_ms",
      value: performance.now() - start,
      unit: "ms",
      projectId,
      conversationId
    });

    return result;
  }

  static createActivePathOverviewSnapshot(input: {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const overview = TimelineService.getActivePathOverview(
      input.state,
      input.projectId,
      input.conversationId
    );
    const snapshotId = `timeline-snapshot-active-overview-${hashContent(
      [
        input.projectId,
        input.conversationId ?? "project",
        overview.activePath?.id ?? "no-path",
        overview.headNodeId ?? "no-head",
        overview.nodeCount,
        overview.returnedNodeCount
      ].join("|")
    )}`;
    const existing = input.state.timelineGraphSnapshots[snapshotId];

    if (existing && existing.status === "active") {
      return {
        state: input.state,
        snapshot: existing,
        overview,
        created: false
      };
    }

    const snapshot = {
      id: snapshotId,
      snapshotId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      snapshotType: "active_path_overview" as const,
      activePathId: overview.activePath?.id,
      rootNodeId: overview.rootNodeId,
      headNodeId: overview.headNodeId,
      nodeCount: overview.nodeCount,
      edgeCount: 0,
      collapsedGroupCount: Math.max(0, overview.nodeCount - overview.returnedNodeCount),
      graphSummary: {
        active_path_id: overview.activePath?.id,
        node_count: overview.nodeCount,
        returned_node_count: overview.returnedNodeCount,
        full_node_list_truncated: overview.fullNodeListTruncated
      },
      graphData: {
        nodes: overview.nodes
      },
      sourceTimelineUpdatedAt: now,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      metadata: {
        request_type: "project_open_overview",
        window_policy: "initial_overview_only"
      }
    };
    const stateWithSnapshot: RevisionRepositoryState = {
      ...input.state,
      timelineGraphSnapshots: {
        ...input.state.timelineGraphSnapshots,
        [snapshot.id]: snapshot
      }
    };

    return {
      state: MigrationTrackingService.createSystemEvent({
        state: stateWithSnapshot,
        eventType: "timeline.snapshot.created",
        objectType: "timeline_graph_snapshot",
        objectId: snapshot.id,
        projectId: input.projectId,
        now,
        payload: {
          conversation_id: input.conversationId,
          snapshot_type: snapshot.snapshotType,
          active_path_id: snapshot.activePathId,
          head_node_id: snapshot.headNodeId,
          node_count: snapshot.nodeCount,
          returned_node_count: overview.returnedNodeCount,
          collapsed_group_count: snapshot.collapsedGroupCount
        }
      }),
      snapshot,
      overview,
      created: true
    };
  }

  static getTimelineWindow(input: {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    anchorNodeId?: string;
    direction?: "before" | "after" | "around";
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const direction = input.direction ?? "around";
    const projections = projectNodeProjections(
      input.state,
      input.projectId,
      input.conversationId
    ).sort((a, b) => projectionTime(a) - projectionTime(b));
    const anchorIndex = input.anchorNodeId
      ? projections.findIndex((projection) => projection.nodeId === input.anchorNodeId)
      : projections.length - 1;
    const safeAnchorIndex = anchorIndex < 0 ? projections.length - 1 : anchorIndex;
    let start = 0;
    let end = projections.length;

    if (direction === "before") {
      end = Math.max(0, safeAnchorIndex);
      start = Math.max(0, end - limit);
    } else if (direction === "after") {
      start = Math.min(projections.length, safeAnchorIndex + 1);
      end = Math.min(projections.length, start + limit);
    } else {
      const before = Math.floor(limit / 2);
      start = Math.max(0, safeAnchorIndex - before);
      end = Math.min(projections.length, start + limit);
      start = Math.max(0, end - limit);
    }

    const nodes = projections.slice(start, end);
    const nodeIds = new Set(nodes.map((node) => node.nodeId));
    const edges = Object.values(input.state.timelineEdges).filter(
      (edge) =>
        edge.projectId === input.projectId &&
        edge.status !== "deleted" &&
        nodeIds.has(edge.sourceNodeId) &&
        nodeIds.has(edge.targetNodeId)
    );

    return {
      nodes,
      edges: edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        edgeType: edge.edgeType,
        label: edge.label,
        status: edge.status,
        timestamp: edge.timestamp
      })),
      hasMoreBefore: start > 0,
      hasMoreAfter: end < projections.length
    };
  }

  static getObjectSubgraph(
    state: RevisionRepositoryState,
    objectType: RevisionTimelineNode["targetObjectType"],
    objectId: string,
    options: {
      depth?: number;
      limit?: number;
    } = {}
  ) {
    const limit = options.limit ?? 100;
    const depth = options.depth ?? 2;
    const seedNodes = Object.values(state.timelineNodes).filter(
      (node) =>
        node.targetObjectType === objectType &&
        node.targetObjectId === objectId &&
        node.status !== "deleted"
    );
    const selected = new Map<string, RevisionTimelineNode>();
    const queue = seedNodes.map((node) => ({ node, depth: 0 }));

    while (queue.length > 0 && selected.size < limit) {
      const current = queue.shift()!;
      if (selected.has(current.node.id)) continue;
      selected.set(current.node.id, current.node);
      if (current.depth >= depth) continue;

      for (const edge of Object.values(state.timelineEdges)) {
        if (edge.status === "deleted") continue;
        if (edge.sourceNodeId === current.node.id) {
          const child = state.timelineNodes[edge.targetNodeId];
          if (child) queue.push({ node: child, depth: current.depth + 1 });
        }
        if (edge.targetNodeId === current.node.id) {
          const parent = state.timelineNodes[edge.sourceNodeId];
          if (parent) queue.push({ node: parent, depth: current.depth + 1 });
        }
      }
    }

    const nodeIds = new Set(selected.keys());
    return {
      nodes: [...selected.values()].map((node) => projectionForNode(state, node)),
      edges: Object.values(state.timelineEdges).filter(
        (edge) =>
          nodeIds.has(edge.sourceNodeId) &&
          nodeIds.has(edge.targetNodeId) &&
          edge.status !== "deleted"
      )
    };
  }

  static getBranchSubgraph(
    state: RevisionRepositoryState,
    branchRootNodeId: string,
    options: {
      limit?: number;
    } = {}
  ) {
    const descendants = TimelineService.getDescendants(state, branchRootNodeId)
      .slice(0, options.limit ?? 100);
    const root = state.timelineNodes[branchRootNodeId];
    const nodes = root ? [root, ...descendants] : descendants;
    const nodeIds = new Set(nodes.map((node) => node.id));

    return {
      nodes: nodes.map((node) => projectionForNode(state, node)),
      edges: Object.values(state.timelineEdges).filter(
        (edge) =>
          nodeIds.has(edge.sourceNodeId) &&
          nodeIds.has(edge.targetNodeId) &&
          edge.status !== "deleted"
      )
    };
  }

  static getMergeBackEdges(
    state: Pick<RevisionRepositoryState, "timelineEdges">,
    projectId: string,
    conversationId?: string
  ) {
    return Object.values(state.timelineEdges).filter(
      (edge) =>
        edge.projectId === projectId &&
        edge.status !== "deleted" &&
        edge.edgeType === "merge_back" &&
        (!conversationId ||
          String(edge.payload?.conversation_id ?? conversationId) === conversationId)
    );
  }
}
