import type {
  ObjectStatus,
  RevisionRepositoryState
} from "@/types/revision";
import { OBJECT_STATUSES } from "@/types/revision";
import { MigrationTrackingService } from "./MigrationTrackingService";

export type WorkspaceAuditReport = {
  migrationJobId: string;
  scanned: Record<string, number>;
  issueCounts: {
    info: number;
    warning: number;
    error: number;
  };
  issues: Array<{
    entityType: string;
    entityId?: string;
    severity: "info" | "warning" | "error";
    issueCode: string;
    message: string;
  }>;
  existing: {
    documentVersions: number;
    eventLogs: number;
    timelineNodes: number;
  };
};

function isValidStatus(status?: string): status is ObjectStatus {
  return Boolean(status && (OBJECT_STATUSES as readonly string[]).includes(status));
}

export class WorkspaceMigrationAuditService {
  static auditLegacyWorkspaceData(input: {
    state: RevisionRepositoryState;
    migrationJobId?: string;
    projectId?: string;
    now?: string;
  }): {
    state: RevisionRepositoryState;
    report: WorkspaceAuditReport;
  } {
    const now = input.now ?? new Date().toISOString();
    const jobResult = input.migrationJobId
      ? {
          state: input.state,
          job: input.state.migrationJobs[input.migrationJobId]
        }
      : MigrationTrackingService.createJob({
          state: input.state,
          name: "auditLegacyWorkspaceData",
          version: "phase-10",
          status: "running",
          createdBy: "system",
          now,
          suffix: `audit-${input.projectId ?? "all"}`
        });
    let state = jobResult.state;
    const migrationJobId = jobResult.job?.id ?? input.migrationJobId ?? "audit";
    const report: WorkspaceAuditReport = {
      migrationJobId,
      scanned: {
        projects: 0,
        conversations: 0,
        messages: 0,
        localThreads: 0,
        annotations: 0,
        branches: 0,
        merges: 0,
        comparisons: 0
      },
      issueCounts: {
        info: 0,
        warning: 0,
        error: 0
      },
      issues: [],
      existing: {
        documentVersions: Object.keys(state.documentVersions).length,
        eventLogs: Object.keys(state.eventLogs).length,
        timelineNodes: Object.keys(state.timelineNodes).length
      }
    };

    const addIssue = (issue: WorkspaceAuditReport["issues"][number]) => {
      report.issues.push(issue);
      report.issueCounts[issue.severity] += 1;
      state = MigrationTrackingService.createIssue({
        state,
        migrationJobId,
        entityType: issue.entityType,
        entityId: issue.entityId,
        severity: issue.severity,
        issueCode: issue.issueCode,
        message: issue.message,
        now,
        metadata: {
          audit_only: true
        }
      }).state;
    };

    const projects = Object.values(state.projects).filter(
      (project) => !input.projectId || project.id === input.projectId
    );

    for (const project of projects) {
      report.scanned.projects += 1;

      if (!project.id) {
        addIssue({
          entityType: "project",
          severity: "error",
          issueCode: "missing_project_id",
          message: "Project is missing project_id."
        });
      }

      if (!isValidStatus(project.status)) {
        addIssue({
          entityType: "project",
          entityId: project.id,
          severity: "warning",
          issueCode: "invalid_status",
          message: "Project status is missing or invalid."
        });
      }

      const projectConversations = Object.values(state.mainConversations).filter(
        (conversation) => conversation.projectId === project.id
      );

      if (projectConversations.length === 0) {
        addIssue({
          entityType: "project",
          entityId: project.id,
          severity: "warning",
          issueCode: "projects_without_active_conversation",
          message: "Project has no conversation records."
        });
      } else if (
        project.activeConversationId &&
        !state.mainConversations[project.activeConversationId]
      ) {
        addIssue({
          entityType: "project",
          entityId: project.id,
          severity: "warning",
          issueCode: "missing_active_conversation",
          message: "Project active_conversation_id points to a missing conversation."
        });
      }
    }

    const conversations = Object.values(state.mainConversations).filter(
      (conversation) =>
        !input.projectId || conversation.projectId === input.projectId
    );

    for (const conversation of conversations) {
      report.scanned.conversations += 1;

      if (!conversation.projectId) {
        addIssue({
          entityType: "main_conversation",
          entityId: conversation.id,
          severity: "error",
          issueCode: "missing_project_id",
          message: "Conversation is missing project_id."
        });
      }

      if (!isValidStatus(conversation.status)) {
        addIssue({
          entityType: "main_conversation",
          entityId: conversation.id,
          severity: "warning",
          issueCode: "invalid_status",
          message: "Conversation status is missing or invalid."
        });
      }

      const messages = Object.values(state.revisionMessages).filter(
        (message) => message.conversationId === conversation.id
      );

      if (messages.length === 0) {
        addIssue({
          entityType: "main_conversation",
          entityId: conversation.id,
          severity: "warning",
          issueCode: "conversations_without_messages",
          message: "Conversation has no messages."
        });
      }
    }

    for (const message of Object.values(state.revisionMessages)) {
      if (input.projectId && message.projectId !== input.projectId) {
        continue;
      }

      report.scanned.messages += 1;

      if (!message.projectId) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "error",
          issueCode: "missing_project_id",
          message: "Message is missing project_id."
        });
      }

      if (!message.conversationId) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "error",
          issueCode: "missing_conversation_id",
          message: "Message is missing conversation_id."
        });
      }

      if (!message.role) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "error",
          issueCode: "messages_without_role",
          message: "Message has no role."
        });
      }

      if (message.role === "assistant" && !message.content) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "warning",
          issueCode: "assistant_messages_without_content",
          message: "Assistant message has no content."
        });
      }

      if (!message.createdAt) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "warning",
          issueCode: "messages_without_created_at",
          message: "Message is missing created_at."
        });
      }

      if (!isValidStatus(message.status)) {
        addIssue({
          entityType: "message",
          entityId: message.id,
          severity: "warning",
          issueCode: "invalid_status",
          message: "Message status is missing or invalid."
        });
      }
    }

    for (const thread of Object.values(state.localThreads)) {
      if (input.projectId && thread.projectId !== input.projectId) {
        continue;
      }

      report.scanned.localThreads += 1;

      if (!state.textSelections[thread.sourceSelectionId]) {
        addIssue({
          entityType: "local_thread",
          entityId: thread.id,
          severity: "warning",
          issueCode: "orphan_local_window_data",
          message: "LocalThread source selection is missing."
        });
      }
    }

    for (const annotation of Object.values(state.annotations)) {
      if (input.projectId && annotation.projectId !== input.projectId) {
        continue;
      }

      report.scanned.annotations += 1;

      if (annotation.scopeId && !annotation.scopeType) {
        addIssue({
          entityType: "annotation",
          entityId: annotation.id,
          severity: "warning",
          issueCode: "orphan_annotations",
          message: "Annotation has scope_id without scope_type."
        });
      }
    }

    report.scanned.branches = Object.values(state.revisionBranches).filter(
      (branch) => !input.projectId || branch.projectId === input.projectId
    ).length;
    report.scanned.merges = Object.values(state.mergeRecords).filter(
      (merge) => !input.projectId || merge.projectId === input.projectId
    ).length;
    report.scanned.comparisons = Object.values(state.comparisonGraphs).filter(
      (comparison) => !input.projectId || comparison.projectId === input.projectId
    ).length;

    state = MigrationTrackingService.finishJob({
      state,
      migrationJobId,
      status: report.issueCounts.error > 0 ? "partial" : "completed",
      now,
      metadata: {
        audit_report: {
          scanned: report.scanned,
          issueCounts: report.issueCounts,
          existing: report.existing
        }
      }
    });

    return {
      state,
      report
    };
  }
}

export const auditLegacyWorkspaceData =
  WorkspaceMigrationAuditService.auditLegacyWorkspaceData;
