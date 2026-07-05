import type { ComparisonRunModel, RevisionRepositoryState } from "@/types/revision";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";

function graphNodes(run: ComparisonRunModel) {
  const graph = run.graphData as {
    nodes?: unknown[];
  };
  return Array.isArray(graph.nodes) ? graph.nodes : [];
}

function graphEdges(run: ComparisonRunModel) {
  const graph = run.graphData as {
    edges?: unknown[];
  };
  return Array.isArray(graph.edges) ? graph.edges : [];
}

export class ComparisonGraphQueryService {
  static recordGraphClusteredEvent(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    runId: string;
    nodeCount: number;
    edgeCount: number;
    now?: string;
  }) {
    const comparison = input.state.comparisonGraphs[input.comparisonId];

    return MigrationTrackingService.createSystemEvent({
      state: input.state,
      eventType: "comparison.graph.clustered",
      objectType: "comparison_graph",
      objectId: input.comparisonId,
      projectId: comparison?.projectId,
      now: input.now,
      payload: {
        conversation_id: comparison?.conversationId,
        comparison_run_id: input.runId,
        graph_node_count: input.nodeCount,
        graph_edge_count: input.edgeCount,
        default_view: "semantic_groups"
      }
    });
  }

  static recordGraphWindowLoadedEvent(input: {
    state: RevisionRepositoryState;
    runId: string;
    groupId?: string;
    cursor: number;
    limit: number;
    returnedNodeCount: number;
    now?: string;
  }) {
    const run = input.state.comparisonRuns[input.runId];

    return MigrationTrackingService.createSystemEvent({
      state: input.state,
      eventType: "comparison.graph.window_loaded",
      objectType: "comparison_run",
      objectId: `${input.runId}-${input.groupId ?? "all"}-${input.cursor}-${input.limit}`,
      projectId: run?.projectId,
      now: input.now,
      payload: {
        conversation_id: run?.conversationId,
        comparison_run_id: input.runId,
        group_id: input.groupId,
        cursor: input.cursor,
        limit: input.limit,
        returned_node_count: input.returnedNodeCount
      }
    });
  }

  static getGraphSummary(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
  }) {
    const start = performance.now();
    const comparison = input.state.comparisonGraphs[input.comparisonId];
    const run = comparison?.activeRunId
      ? input.state.comparisonRuns[comparison.activeRunId]
      : undefined;

    if (!comparison || !run) {
      throw new Error("Comparison graph not found");
    }

    const nodes = graphNodes(run);
    const edges = graphEdges(run);
    const useClusteredView = nodes.length > 200 || edges.length > 500;
    WorkspaceObservabilityService.recordMetric({
      state: input.state,
      name: "comparison_graph_load_latency_ms",
      value: performance.now() - start,
      unit: "ms",
      projectId: comparison.projectId,
      conversationId: comparison.conversationId
    });

    return {
      comparisonId: comparison.id,
      activeRunId: run.id,
      title: comparison.title,
      summary: run.summary,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      semanticGroups: run.semanticGroups,
      useClusteredView,
      defaultView: useClusteredView ? "semantic_groups" : "graph_window",
      status: comparison.status
    };
  }

  static getGraphWindow(input: {
    state: RevisionRepositoryState;
    runId: string;
    groupId?: string;
    cursor?: number;
    limit?: number;
  }) {
    const run = input.state.comparisonRuns[input.runId];

    if (!run || run.status === "deleted") {
      throw new Error("Comparison run not found");
    }

    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const cursor = Math.max(0, input.cursor ?? 0);
    const nodes = graphNodes(run);
    const edges = graphEdges(run);
    const filteredNodes = input.groupId
      ? nodes.filter((node) => {
          if (!node || typeof node !== "object") return false;
          const group = (node as Record<string, unknown>).group_id ??
            (node as Record<string, unknown>).groupId;
          return group === input.groupId;
        })
      : nodes;
    const pageNodes = filteredNodes.slice(cursor, cursor + limit);
    const nodeIds = new Set(
      pageNodes
        .map((node) =>
          node && typeof node === "object"
            ? String((node as Record<string, unknown>).id)
            : undefined
        )
        .filter(Boolean)
    );
    const pageEdges = edges.filter((edge) => {
      if (!edge || typeof edge !== "object") return false;
      const source = String((edge as Record<string, unknown>).source);
      const target = String((edge as Record<string, unknown>).target);
      return nodeIds.has(source) && nodeIds.has(target);
    });

    return {
      runId: run.id,
      nodes: pageNodes,
      edges: pageEdges,
      nextCursor:
        cursor + limit < filteredNodes.length ? cursor + limit : undefined,
      hasMore: cursor + limit < filteredNodes.length,
      totalNodes: filteredNodes.length,
      totalEdges: edges.length
    };
  }

  static getNodeSourceRefs(input: {
    state: RevisionRepositoryState;
    runId: string;
    nodeId: string;
  }) {
    const run = input.state.comparisonRuns[input.runId];

    if (!run || run.status === "deleted") {
      throw new Error("Comparison run not found");
    }

    const node = graphNodes(run).find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        String((candidate as Record<string, unknown>).id) === input.nodeId
    ) as Record<string, unknown> | undefined;
    const directRefs =
      node && Array.isArray(node.source_refs)
        ? node.source_refs
        : node && Array.isArray(node.sourceRefs)
          ? node.sourceRefs
          : [];

    return {
      runId: run.id,
      nodeId: input.nodeId,
      refs: directRefs.length > 0 ? directRefs : run.inputSourceSnapshot,
      refCount: directRefs.length > 0
        ? directRefs.length
        : Array.isArray(run.inputSourceSnapshot)
          ? run.inputSourceSnapshot.length
          : 0
    };
  }

  static exportGraphFromBackend(input: {
    state: RevisionRepositoryState;
    runId: string;
  }) {
    const run = input.state.comparisonRuns[input.runId];

    if (!run || run.status === "deleted") {
      throw new Error("Comparison run not found");
    }

    WorkspaceObservabilityService.recordMetric({
      state: input.state,
      name: "comparison_export_latency_ms",
      value: 0,
      unit: "ms",
      projectId: run.projectId,
      conversationId: run.conversationId,
      metadata: {
        backend_export: true,
        run_id: run.id
      }
    });

    return {
      runId: run.id,
      graphData: run.graphData,
      summary: run.summary,
      semanticGroups: run.semanticGroups
    };
  }
}
