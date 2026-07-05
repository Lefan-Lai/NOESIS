import type {
  RevisionRepositoryState,
  WorkspaceMetricRecord
} from "@/types/revision";

export const WORKSPACE_METRIC_NAMES = [
  "migration_projects_total",
  "migration_projects_completed",
  "migration_projects_failed",
  "migration_messages_backfilled",
  "migration_document_versions_created",
  "migration_timeline_nodes_created",
  "migration_context_snapshots_reconstructed",
  "migration_issues_warning",
  "migration_issues_error",
  "workspace_action_success_count",
  "workspace_action_failure_count",
  "context_build_latency_ms",
  "timeline_query_latency_ms",
  "document_version_create_latency_ms",
  "merge_confirm_latency_ms",
  "revert_latency_ms",
  "timeline_overview_latency_ms",
  "timeline_window_latency_ms",
  "object_subgraph_latency_ms",
  "related_objects_latency_ms",
  "context_candidate_query_latency_ms",
  "context_status_filter_latency_ms",
  "context_ranking_latency_ms",
  "context_compression_latency_ms",
  "context_total_build_latency_ms",
  "context_cache_hit_rate",
  "local_thread_open_latency_ms",
  "local_thread_message_page_latency_ms",
  "document_chunk_create_latency_ms",
  "document_chunk_query_latency_ms",
  "comparison_graph_load_latency_ms",
  "comparison_export_latency_ms",
  "slow_query_count",
  "cache_invalidation_count",
  "cache_stale_read_prevented_count"
] as const;

export type WorkspaceMetricName = (typeof WORKSPACE_METRIC_NAMES)[number];

export class WorkspaceObservabilityService {
  static recordMetric(input: {
    state: RevisionRepositoryState;
    name: WorkspaceMetricName;
    value: number;
    unit?: WorkspaceMetricRecord["unit"];
    projectId?: string;
    conversationId?: string;
    now?: string;
    suffix?: string;
    metadata?: Record<string, unknown>;
  }): {
    state: RevisionRepositoryState;
    metric: WorkspaceMetricRecord;
  } {
    const now = input.now ?? new Date().toISOString();
    const suffix =
      input.suffix ?? `${input.name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const metric: WorkspaceMetricRecord = {
      id: `metric-${suffix}`,
      name: input.name,
      value: input.value,
      unit: input.unit ?? (input.name.endsWith("_ms") ? "ms" : "count"),
      projectId: input.projectId,
      conversationId: input.conversationId,
      createdAt: now,
      metadata: input.metadata
    };

    return {
      state: {
        ...input.state,
        workspaceMetrics: {
          ...input.state.workspaceMetrics,
          [metric.id]: metric
        }
      },
      metric
    };
  }

  static increment(input: Omit<Parameters<typeof WorkspaceObservabilityService.recordMetric>[0], "value"> & {
    value?: number;
  }) {
    return WorkspaceObservabilityService.recordMetric({
      ...input,
      value: input.value ?? 1
    });
  }
}
