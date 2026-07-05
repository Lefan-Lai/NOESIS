import type {
  FeatureFlagKey,
  FeatureFlagModel,
  RevisionRepositoryState
} from "@/types/revision";
import type { WorkspaceActionId } from "@/types/workspaceActions";

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  revision_workspace_enabled: true,
  event_log_enabled: true,
  timeline_graph_enabled: true,
  context_snapshot_enabled: true,
  document_version_enabled: true,
  local_thread_persistence_enabled: true,
  annotation_memory_enabled: true,
  selective_merge_enabled: true,
  revert_enabled: true,
  comparison_graph_enabled: true,
  action_registry_enabled: true,
  legacy_compatibility_mode: true
};

const HIGH_RISK_ACTIONS = new Set<WorkspaceActionId>([
  "merge.into_document",
  "merge.cancel",
  "timeline.revert_to_node",
  "object.delete",
  "comparison.regenerate",
  "document.confirm_edit"
]);

export class FeatureFlagService {
  static ensureDefaults(
    state: RevisionRepositoryState,
    now = new Date().toISOString()
  ): RevisionRepositoryState {
    const featureFlags = {
      ...state.featureFlags
    };

    for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS) as Array<
      [FeatureFlagKey, boolean]
    >) {
      if (!featureFlags[key]) {
        featureFlags[key] = {
          id: key,
          key,
          enabled,
          scopeType: "global",
          updatedAt: now,
          metadata: {
            default: true
          }
        };
      }
    }

    return {
      ...state,
      featureFlags
    };
  }

  static isEnabled(
    state: Pick<RevisionRepositoryState, "featureFlags">,
    key: FeatureFlagKey
  ) {
    return state.featureFlags[key]?.enabled ?? DEFAULT_FEATURE_FLAGS[key];
  }

  static setFlag(
    state: RevisionRepositoryState,
    key: FeatureFlagKey,
    enabled: boolean,
    metadata: FeatureFlagModel["metadata"] = {},
    now = new Date().toISOString()
  ): RevisionRepositoryState {
    return {
      ...state,
      featureFlags: {
        ...state.featureFlags,
        [key]: {
          id: key,
          key,
          enabled,
          scopeType: "global",
          updatedAt: now,
          metadata
        }
      }
    };
  }

  static shouldBlockHighRiskAction(input: {
    state: Pick<RevisionRepositoryState, "projects" | "featureFlags">;
    actionId: WorkspaceActionId;
    projectId?: string;
  }) {
    if (!HIGH_RISK_ACTIONS.has(input.actionId)) {
      return false;
    }

    if (!FeatureFlagService.isEnabled(input.state, "revision_workspace_enabled")) {
      return true;
    }

    const project = input.projectId
      ? input.state.projects[input.projectId]
      : undefined;

    return Boolean(project && project.revisionWorkspaceReady === false);
  }
}
