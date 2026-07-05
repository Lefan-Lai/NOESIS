import type {
  BackfillRecordModel,
  BackfillStatus,
  EventLogRecord,
  FlexiblePayload,
  MigrationBatchModel,
  MigrationIssueModel,
  MigrationIssueSeverity,
  MigrationJobModel,
  MigrationStatus,
  RevisionEventType,
  RevisionObjectType,
  RevisionRepositoryState
} from "@/types/revision";

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 90);
}

function systemEventId(eventType: RevisionEventType, objectId: string) {
  return `event-${safeIdPart(eventType)}-${safeIdPart(objectId)}`;
}

function createSystemEvent(input: {
  state: RevisionRepositoryState;
  eventType: RevisionEventType;
  objectType: RevisionObjectType;
  objectId: string;
  projectId?: string;
  now?: string;
  payload?: FlexiblePayload;
}) {
  const id = systemEventId(input.eventType, input.objectId);

  if (input.state.eventLogs[id]) {
    return input.state;
  }

  const event: EventLogRecord = {
    id,
    projectId: input.projectId ?? "system",
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    actor: "system",
    timestamp: input.now ?? new Date().toISOString(),
    immutable: true,
    payload: input.payload ?? {}
  };

  return {
    ...input.state,
    eventLogs: {
      ...input.state.eventLogs,
      [event.id]: event
    }
  };
}

function migrationStatusEventType(status: MigrationStatus): RevisionEventType {
  if (status === "completed") {
    return "migration.completed";
  }

  if (status === "rolled_back") {
    return "migration.rolled_back";
  }

  if (status === "failed" || status === "partial") {
    return "migration.failed";
  }

  return "migration.started";
}

export class MigrationTrackingService {
  static createSystemEvent = createSystemEvent;

  static createJob(input: {
    state: RevisionRepositoryState;
    name: string;
    version: string;
    status?: MigrationStatus;
    createdBy?: MigrationJobModel["createdBy"];
    now?: string;
    suffix?: string;
    metadata?: Record<string, unknown>;
  }): {
    state: RevisionRepositoryState;
    job: MigrationJobModel;
  } {
    const now = input.now ?? new Date().toISOString();
    const id = `migration-job-${input.suffix ?? `${safeIdPart(input.name)}-${safeIdPart(input.version)}`}`;
    const existing = input.state.migrationJobs[id];

    if (existing) {
      return {
        state: createSystemEvent({
          state: input.state,
          eventType: "migration.started",
          objectType: "migration_job",
          objectId: existing.id,
          now,
          payload: {
            name: existing.name,
            version: existing.version,
            status: existing.status,
            existing: true
          }
        }),
        job: existing
      };
    }

    const job: MigrationJobModel = {
      id,
      migrationJobId: id,
      name: input.name,
      version: input.version,
      status: input.status ?? "running",
      startedAt: now,
      finishedAt: null,
      createdBy: input.createdBy ?? "system",
      metadata: input.metadata
    };

    const stateWithJob = {
      ...input.state,
      migrationJobs: {
        ...input.state.migrationJobs,
        [job.id]: job
      }
    };

    return {
      state: createSystemEvent({
        state: stateWithJob,
        eventType: "migration.started",
        objectType: "migration_job",
        objectId: job.id,
        now,
        payload: {
          name: job.name,
          version: job.version,
          status: job.status
        }
      }),
      job
    };
  }

  static finishJob(input: {
    state: RevisionRepositoryState;
    migrationJobId: string;
    status: Extract<MigrationStatus, "completed" | "failed" | "rolled_back" | "partial">;
    now?: string;
    metadata?: Record<string, unknown>;
  }): RevisionRepositoryState {
    const job = input.state.migrationJobs[input.migrationJobId];

    if (!job) {
      return input.state;
    }

    const now = input.now ?? new Date().toISOString();
    const stateWithJob = {
      ...input.state,
      migrationJobs: {
        ...input.state.migrationJobs,
        [job.id]: {
          ...job,
          status: input.status,
          finishedAt: now,
          metadata: {
            ...(job.metadata ?? {}),
            ...(input.metadata ?? {})
          }
        }
      }
    };

    return createSystemEvent({
      state: stateWithJob,
      eventType: migrationStatusEventType(input.status),
      objectType: "migration_job",
      objectId: job.id,
      now,
      payload: {
        name: job.name,
        version: job.version,
        status: input.status,
        ...(input.metadata ?? {})
      }
    });
  }

  static createBatch(input: {
    state: RevisionRepositoryState;
    migrationJobId: string;
    entityType: string;
    startCursor?: string | null;
    endCursor?: string | null;
    status?: MigrationStatus;
    now?: string;
    suffix?: string;
    metadata?: Record<string, unknown>;
  }): {
    state: RevisionRepositoryState;
    batch: MigrationBatchModel;
  } {
    const now = input.now ?? new Date().toISOString();
    const id = `migration-batch-${input.suffix ?? `${input.migrationJobId}-${safeIdPart(input.entityType)}`}`;
    const existing = input.state.migrationBatches[id];

    if (existing) {
      return {
        state: input.state,
        batch: existing
      };
    }

    const batch: MigrationBatchModel = {
      id,
      migrationBatchId: id,
      migrationJobId: input.migrationJobId,
      entityType: input.entityType,
      startCursor: input.startCursor,
      endCursor: input.endCursor,
      processedCount: 0,
      successCount: 0,
      warningCount: 0,
      errorCount: 0,
      status: input.status ?? "running",
      startedAt: now,
      finishedAt: null,
      metadata: input.metadata
    };

    return {
      state: {
        ...input.state,
        migrationBatches: {
          ...input.state.migrationBatches,
          [batch.id]: batch
        }
      },
      batch
    };
  }

  static completeBatch(input: {
    state: RevisionRepositoryState;
    migrationBatchId: string;
    processedCount: number;
    successCount: number;
    warningCount?: number;
    errorCount?: number;
    status?: MigrationStatus;
    now?: string;
    metadata?: Record<string, unknown>;
  }): RevisionRepositoryState {
    const batch = input.state.migrationBatches[input.migrationBatchId];

    if (!batch) {
      return input.state;
    }

    return {
      ...input.state,
      migrationBatches: {
        ...input.state.migrationBatches,
        [batch.id]: {
          ...batch,
          processedCount: input.processedCount,
          successCount: input.successCount,
          warningCount: input.warningCount ?? batch.warningCount,
          errorCount: input.errorCount ?? batch.errorCount,
          status: input.status ?? "completed",
          finishedAt: input.now ?? new Date().toISOString(),
          metadata: {
            ...(batch.metadata ?? {}),
            ...(input.metadata ?? {})
          }
        }
      }
    };
  }

  static createIssue(input: {
    state: RevisionRepositoryState;
    migrationJobId: string;
    migrationBatchId?: string;
    entityType: string;
    entityId?: string;
    severity: MigrationIssueSeverity;
    issueCode: string;
    message: string;
    now?: string;
    metadata?: Record<string, unknown>;
  }): {
    state: RevisionRepositoryState;
    issue: MigrationIssueModel;
  } {
    const now = input.now ?? new Date().toISOString();
    const id = [
      "migration-issue",
      input.migrationJobId,
      safeIdPart(input.entityType),
      safeIdPart(input.entityId ?? "global"),
      safeIdPart(input.issueCode)
    ].join("-");
    const existing = input.state.migrationIssues[id];

    if (existing) {
      return {
        state: input.state,
        issue: existing
      };
    }

    const issue: MigrationIssueModel = {
      id,
      migrationIssueId: id,
      migrationJobId: input.migrationJobId,
      migrationBatchId: input.migrationBatchId,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity,
      issueCode: input.issueCode,
      message: input.message,
      resolutionStatus:
        input.severity === "error" ? "needs_review" : "open",
      createdAt: now,
      metadata: input.metadata
    };

    const stateWithIssue = {
      ...input.state,
      migrationIssues: {
        ...input.state.migrationIssues,
        [issue.id]: issue
      }
    };

    return {
      state: createSystemEvent({
        state: stateWithIssue,
        eventType: "integrity.issue.detected",
        objectType: "migration_issue",
        objectId: issue.id,
        now,
        payload: {
          migration_job_id: input.migrationJobId,
          migration_batch_id: input.migrationBatchId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          severity: input.severity,
          issue_code: input.issueCode,
          message: input.message,
          ...(input.metadata ?? {})
        }
      }),
      issue
    };
  }

  static findBackfillRecord(
    state: Pick<RevisionRepositoryState, "backfillRecords">,
    sourceEntityType: string,
    sourceEntityId: string,
    backfillType: string
  ) {
    return Object.values(state.backfillRecords).find(
      (record) =>
        record.sourceEntityType === sourceEntityType &&
        record.sourceEntityId === sourceEntityId &&
        record.backfillType === backfillType &&
        record.status !== "failed"
    );
  }

  static createBackfillRecord(input: {
    state: RevisionRepositoryState;
    migrationJobId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetEntityType: RevisionObjectType;
    targetEntityId: string;
    backfillType: string;
    status?: BackfillStatus;
    now?: string;
    metadata?: Record<string, unknown>;
  }): {
    state: RevisionRepositoryState;
    backfillRecord: BackfillRecordModel;
  } {
    const now = input.now ?? new Date().toISOString();
    const id = [
      "backfill",
      safeIdPart(input.sourceEntityType),
      safeIdPart(input.sourceEntityId),
      safeIdPart(input.backfillType)
    ].join("-");
    const existing = input.state.backfillRecords[id];

    if (existing) {
      return {
        state: input.state,
        backfillRecord: existing
      };
    }

    const backfillRecord: BackfillRecordModel = {
      id,
      backfillRecordId: id,
      migrationJobId: input.migrationJobId,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      backfillType: input.backfillType,
      status: input.status ?? "created",
      createdAt: now,
      metadata: input.metadata
    };

    return {
      state: {
        ...input.state,
        backfillRecords: {
          ...input.state.backfillRecords,
          [backfillRecord.id]: backfillRecord
        }
      },
      backfillRecord
    };
  }
}
