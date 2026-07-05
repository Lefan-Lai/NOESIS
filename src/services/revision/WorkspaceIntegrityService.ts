import type {
  MigrationIssueModel,
  RevisionRepositoryState
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";

export type IntegrityValidationResult = {
  ok: boolean;
  issues: Array<
    Pick<
      MigrationIssueModel,
      "entityType" | "entityId" | "severity" | "issueCode" | "message"
    >
  >;
};

function addIssue(
  issues: IntegrityValidationResult["issues"],
  issue: IntegrityValidationResult["issues"][number]
) {
  issues.push(issue);
}

export class WorkspaceIntegrityService {
  static validateProjectWithEvents(
    state: RevisionRepositoryState,
    projectId: string,
    options: {
      migrationJobId?: string;
      now?: string;
    } = {}
  ): IntegrityValidationResult & { state: RevisionRepositoryState } {
    const validation = WorkspaceIntegrityService.validateProject(state, projectId);
    const now = options.now ?? new Date().toISOString();
    let nextState = MigrationTrackingService.createSystemEvent({
      state,
      eventType: "integrity.validation.completed",
      objectType: "project",
      objectId: projectId,
      projectId,
      now,
      payload: {
        migration_job_id: options.migrationJobId,
        ok: validation.ok,
        issue_count: validation.issues.length,
        warning_count: validation.issues.filter(
          (issue) => issue.severity === "warning"
        ).length,
        error_count: validation.issues.filter((issue) => issue.severity === "error")
          .length
      }
    });

    for (const issue of validation.issues) {
      nextState = MigrationTrackingService.createSystemEvent({
        state: nextState,
        eventType: "integrity.issue.detected",
        objectType: "migration_issue",
        objectId: [
          "integrity",
          projectId,
          issue.entityType,
          issue.entityId ?? "global",
          issue.issueCode
        ].join("-"),
        projectId,
        now,
        payload: {
          migration_job_id: options.migrationJobId,
          entity_type: issue.entityType,
          entity_id: issue.entityId,
          severity: issue.severity,
          issue_code: issue.issueCode,
          message: issue.message
        }
      });
    }

    return {
      ...validation,
      state: nextState
    };
  }

  static validateProject(
    state: RevisionRepositoryState,
    projectId: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];
    const project = state.projects[projectId];

    if (!project) {
      addIssue(issues, {
        entityType: "project",
        entityId: projectId,
        severity: "error",
        issueCode: "project_missing",
        message: "Project does not exist."
      });

      return {
        ok: false,
        issues
      };
    }

    if (
      project.activeConversationId &&
      !state.mainConversations[project.activeConversationId]
    ) {
      addIssue(issues, {
        entityType: "project",
        entityId: project.id,
        severity: "error",
        issueCode: "active_conversation_missing",
        message: "Project active conversation does not exist."
      });
    }

    for (const conversation of Object.values(state.mainConversations).filter(
      (item) => item.projectId === project.id
    )) {
      issues.push(
        ...WorkspaceIntegrityService.validateConversation(
          state,
          conversation.id
        ).issues
      );
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }

  static validateConversation(
    state: RevisionRepositoryState,
    conversationId: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];
    const conversation = state.mainConversations[conversationId];

    if (!conversation) {
      return {
        ok: false,
        issues: [
          {
            entityType: "main_conversation",
            entityId: conversationId,
            severity: "error",
            issueCode: "conversation_missing",
            message: "Conversation does not exist."
          }
        ]
      };
    }

    const assistantMessages = Object.values(state.revisionMessages).filter(
      (message) =>
        message.conversationId === conversationId &&
        message.role === "assistant" &&
        message.status !== "deleted"
    );

    if (assistantMessages.length > 0 && !conversation.activeDocumentVersionId) {
      addIssue(issues, {
        entityType: "main_conversation",
        entityId: conversation.id,
        severity: "error",
        issueCode: "active_document_version_missing",
        message: "Conversation has assistant answers but no active document version."
      });
    }

    issues.push(
      ...WorkspaceIntegrityService.validateTimeline(
        state,
        conversation.projectId,
        conversation.id
      ).issues,
      ...WorkspaceIntegrityService.validateDocumentVersions(
        state,
        conversation.projectId,
        conversation.id
      ).issues,
      ...WorkspaceIntegrityService.validateMemoryRules(
        state,
        conversation.projectId,
        conversation.id
      ).issues,
      ...WorkspaceIntegrityService.validateNoDeletedContentInContext(
        state,
        conversation.projectId,
        conversation.id
      ).issues
    );

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }

  static validateTimeline(
    state: RevisionRepositoryState,
    projectId: string,
    conversationId?: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];
    const conversation = conversationId
      ? state.mainConversations[conversationId]
      : undefined;
    const activePathId =
      conversation?.activeTimelinePathId ??
      state.projects[projectId]?.activeTimelinePathId;
    const activeNodeId =
      conversation?.activeTimelineNodeId ??
      state.projects[projectId]?.activeTimelineNodeId;

    if (conversationId && !activePathId) {
      addIssue(issues, {
        entityType: "main_conversation",
        entityId: conversationId,
        severity: "error",
        issueCode: "active_timeline_path_missing",
        message: "Conversation has no active timeline path."
      });
    }

    if (conversationId && !activeNodeId) {
      addIssue(issues, {
        entityType: "main_conversation",
        entityId: conversationId,
        severity: "error",
        issueCode: "active_timeline_node_missing",
        message: "Conversation has no active timeline node."
      });
    }

    if (activePathId && !state.timelinePaths[activePathId]) {
      addIssue(issues, {
        entityType: "timeline_path",
        entityId: activePathId,
        severity: "error",
        issueCode: "active_path_missing",
        message: "Active timeline path record is missing."
      });
    }

    if (activeNodeId && !state.timelineNodes[activeNodeId]) {
      addIssue(issues, {
        entityType: "timeline_node",
        entityId: activeNodeId,
        severity: "error",
        issueCode: "active_node_missing",
        message: "Active timeline node record is missing."
      });
    }

    for (const node of Object.values(state.timelineNodes).filter(
      (item) =>
        item.projectId === projectId &&
        (!conversationId || item.conversationId === conversationId)
    )) {
      if (node.parentNodeId && !state.timelineNodes[node.parentNodeId]) {
        addIssue(issues, {
          entityType: "timeline_node",
          entityId: node.id,
          severity: "error",
          issueCode: "timeline_parent_missing",
          message: "Timeline node parent does not exist."
        });
      }
    }

    for (const edge of Object.values(state.timelineEdges).filter(
      (item) => item.projectId === projectId
    )) {
      if (!state.timelineNodes[edge.sourceNodeId]) {
        addIssue(issues, {
          entityType: "timeline_edge",
          entityId: edge.id,
          severity: "error",
          issueCode: "timeline_edge_source_missing",
          message: "Timeline edge source node is missing."
        });
      }

      if (!state.timelineNodes[edge.targetNodeId]) {
        addIssue(issues, {
          entityType: "timeline_edge",
          entityId: edge.id,
          severity: "error",
          issueCode: "timeline_edge_target_missing",
          message: "Timeline edge target node is missing."
        });
      }
    }

    if (
      activeNodeId &&
      activePathId &&
      state.timelineNodes[activeNodeId]?.activePathId &&
      state.timelineNodes[activeNodeId]?.activePathId !== activePathId
    ) {
      addIssue(issues, {
        entityType: "timeline_node",
        entityId: activeNodeId,
        severity: "error",
        issueCode: "active_node_not_on_active_path",
        message: "Active timeline node does not belong to the active path."
      });
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }

  static validateDocumentVersions(
    state: RevisionRepositoryState,
    projectId: string,
    conversationId?: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];
    const versions = Object.values(state.documentVersions).filter(
      (version) =>
        version.projectId === projectId &&
        (!conversationId || version.conversationId === conversationId)
    );
    const active = versions.filter((version) => version.status === "active");

    if (active.length > 1) {
      addIssue(issues, {
        entityType: "document_version",
        entityId: conversationId,
        severity: "error",
        issueCode: "multiple_active_document_versions",
        message: "More than one active document version exists for this conversation."
      });
    }

    for (const version of versions) {
      if ((version.contentHash ?? "") !== hashContent(version.content)) {
        addIssue(issues, {
          entityType: "document_version",
          entityId: version.id,
          severity: "warning",
          issueCode: "content_hash_mismatch",
          message: "DocumentVersion content_hash does not match content."
        });
      }
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }

  static validateMemoryRules(
    state: RevisionRepositoryState,
    projectId: string,
    conversationId?: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];

    for (const message of Object.values(state.revisionMessages).filter(
      (item) =>
        item.projectId === projectId &&
        (!conversationId || item.conversationId === conversationId)
    )) {
      if (
        ["deleted", "discarded", "inactive"].includes(message.status) &&
        message.includeInContext
      ) {
        addIssue(issues, {
          entityType: "message",
          entityId: message.id,
          severity: "error",
          issueCode: "excluded_state_included_in_context",
          message: "Deleted, discarded, or inactive message is marked includeInContext."
        });
      }
    }

    for (const annotation of Object.values(state.annotations).filter(
      (item) =>
        item.projectId === projectId &&
        (!conversationId || item.conversationId === conversationId)
    )) {
      if (
        annotation.status === "deleted" &&
        annotation.memoryPolicy !== "never_include"
      ) {
        addIssue(issues, {
          entityType: "annotation",
          entityId: annotation.id,
          severity: "error",
          issueCode: "deleted_annotation_can_enter_context",
          message: "Deleted annotation does not use never_include policy."
        });
      }
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }

  static validateNoDeletedContentInContext(
    state: RevisionRepositoryState,
    projectId: string,
    conversationId?: string
  ): IntegrityValidationResult {
    const issues: IntegrityValidationResult["issues"] = [];
    const deletedSources = new Set([
      ...Object.values(state.revisionMessages)
        .filter((message) => message.status === "deleted")
        .map((message) => message.id),
      ...Object.values(state.annotations)
        .filter((annotation) => annotation.status === "deleted")
        .map((annotation) => annotation.id)
    ]);

    for (const snapshot of Object.values(state.contextSnapshots).filter(
      (item) =>
        item.projectId === projectId &&
        (!conversationId || item.sessionId === conversationId)
    )) {
      for (const item of snapshot.includedItems) {
        if (item.sourceId && deletedSources.has(item.sourceId)) {
          addIssue(issues, {
            entityType: "context_snapshot",
            entityId: snapshot.id,
            severity: "error",
            issueCode: "deleted_object_included_in_context",
            message: "ContextSnapshot includes a deleted object."
          });
        }
      }
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues
    };
  }
}
