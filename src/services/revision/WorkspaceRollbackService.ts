import type {
  BackfillRecordModel,
  RevisionRepositoryState
} from "@/types/revision";
import { FeatureFlagService } from "./FeatureFlagService";
import { MigrationTrackingService } from "./MigrationTrackingService";

export type RollbackWorkspaceMigrationOptions = {
  dryRun?: boolean;
  apply?: boolean;
  migrationJobId?: string;
  projectId?: string;
  deleteBackfilledRecords?: boolean;
  now?: string;
};

export type RollbackWorkspaceMigrationResult = {
  state: RevisionRepositoryState;
  dryRun: boolean;
  disabledRevisionWorkspace: boolean;
  enabledLegacyCompatibility: boolean;
  removableBackfilledRecords: BackfillRecordModel[];
  removedTargetIds: string[];
};

function targetHasNewDependencies(
  state: RevisionRepositoryState,
  record: BackfillRecordModel
) {
  const targetId = record.targetEntityId;

  return (
    Object.values(state.backfillRecords).some(
      (candidate) =>
        candidate.sourceEntityId === targetId &&
        candidate.migrationJobId !== record.migrationJobId
    ) ||
    Object.values(state.timelineEdges).some(
      (edge) =>
        (edge.sourceNodeId === targetId || edge.targetNodeId === targetId) &&
        !edge.payload?.backfilled
    )
  );
}

function removeTargetRecord(
  state: RevisionRepositoryState,
  record: BackfillRecordModel
): RevisionRepositoryState {
  const id = record.targetEntityId;

  switch (record.targetEntityType) {
    case "document_version": {
      const { [id]: _removed, ...documentVersions } = state.documentVersions;
      return { ...state, documentVersions };
    }
    case "event_log": {
      const { [id]: _removed, ...eventLogs } = state.eventLogs;
      return { ...state, eventLogs };
    }
    case "timeline_node": {
      const { [id]: _removed, ...timelineNodes } = state.timelineNodes;
      return { ...state, timelineNodes };
    }
    case "timeline_edge": {
      const { [id]: _removed, ...timelineEdges } = state.timelineEdges;
      return { ...state, timelineEdges };
    }
    case "llm_call": {
      const { [id]: _removed, ...llmCallRecords } = state.llmCallRecords;
      return { ...state, llmCallRecords };
    }
    case "context_snapshot": {
      const { [id]: _removed, ...contextSnapshots } = state.contextSnapshots;
      return { ...state, contextSnapshots };
    }
    default:
      return state;
  }
}

export class WorkspaceRollbackService {
  static rollbackWorkspaceMigration(
    state: RevisionRepositoryState,
    options: RollbackWorkspaceMigrationOptions = {}
  ): RollbackWorkspaceMigrationResult {
    const dryRun = options.dryRun ?? !options.apply;
    const now = options.now ?? new Date().toISOString();
    let nextState = FeatureFlagService.setFlag(
      FeatureFlagService.setFlag(
        state,
        "revision_workspace_enabled",
        false,
        {
          rollback: true,
          migration_job_id: options.migrationJobId
        },
        now
      ),
      "legacy_compatibility_mode",
      true,
      {
        rollback: true,
        migration_job_id: options.migrationJobId
      },
      now
    );
    const removableBackfilledRecords = Object.values(nextState.backfillRecords).filter(
      (record) =>
        (!options.migrationJobId ||
          record.migrationJobId === options.migrationJobId) &&
        (!options.projectId ||
          nextState.projects[options.projectId] ||
          record.metadata?.project_id === options.projectId) &&
        record.status !== "failed" &&
        !targetHasNewDependencies(nextState, record)
    );
    const removedTargetIds: string[] = [];

    if (options.deleteBackfilledRecords && !dryRun) {
      for (const record of removableBackfilledRecords) {
        nextState = removeTargetRecord(nextState, record);
        removedTargetIds.push(record.targetEntityId);
      }
    }

    if (options.migrationJobId && !dryRun) {
      nextState = MigrationTrackingService.finishJob({
        state: nextState,
        migrationJobId: options.migrationJobId,
        status: "rolled_back",
        now,
        metadata: {
          rollback: true,
          removed_target_ids: removedTargetIds
        }
      });
    }

    return {
      state: dryRun ? state : nextState,
      dryRun,
      disabledRevisionWorkspace: true,
      enabledLegacyCompatibility: true,
      removableBackfilledRecords,
      removedTargetIds
    };
  }
}

export const rollbackWorkspaceMigration =
  WorkspaceRollbackService.rollbackWorkspaceMigration;
