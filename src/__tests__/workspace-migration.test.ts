import { describe, expect, it } from "vitest";
import { ActionGuardService } from "@/services/revision/ActionGuardService";
import { FeatureFlagService } from "@/services/revision/FeatureFlagService";
import { WorkspaceBackfillService } from "@/services/revision/WorkspaceBackfillService";
import { WorkspaceIndexService } from "@/services/revision/WorkspaceIndexes";
import { WorkspaceIntegrityService } from "@/services/revision/WorkspaceIntegrityService";
import { WorkspaceMigrationAuditService } from "@/services/revision/WorkspaceMigrationAuditService";
import { WorkspaceRepairService } from "@/services/revision/WorkspaceRepairService";
import { WorkspaceRollbackService } from "@/services/revision/WorkspaceRollbackService";
import { createEmptyRevisionState } from "@/services/revision/emptyRevisionState";
import { hashContent } from "@/services/revision/DiffService";
import type {
  AnnotationModel,
  DocumentVersionModel,
  LocalThreadModel,
  MessageModel,
  RevisionRepositoryState
} from "@/types/revision";

function legacyState(): RevisionRepositoryState {
  const base = createEmptyRevisionState();
  const createdAt = "2026-07-05T01:00:00.000Z";

  return {
    ...base,
    projects: {
      project1: {
        id: "project1",
        name: "Legacy Project",
        status: "active",
        createdAt,
        updatedAt: createdAt,
        revisionWorkspaceReady: false
      }
    },
    mainConversations: {
      conv1: {
        id: "conv1",
        projectId: "project1",
        title: "Legacy Conversation",
        status: "active",
        createdAt,
        updatedAt: createdAt
      }
    },
    revisionMessages: {
      user1: {
        id: "user1",
        projectId: "project1",
        conversationId: "conv1",
        role: "user",
        content: "Write about revision workspaces.",
        status: "active",
        memoryScope: "conversation",
        includeInContext: true,
        createdAt: "2026-07-05T01:01:00.000Z"
      },
      assistant1: {
        id: "assistant1",
        projectId: "project1",
        conversationId: "conv1",
        role: "assistant",
        content: "A revision workspace records answers and changes.",
        status: "active",
        memoryScope: "conversation",
        includeInContext: true,
        createdAt: "2026-07-05T01:02:00.000Z"
      } as MessageModel,
      user2: {
        id: "user2",
        projectId: "project1",
        conversationId: "conv1",
        role: "user",
        content: "Make it clearer.",
        status: "active",
        memoryScope: "conversation",
        includeInContext: true,
        createdAt: "2026-07-05T01:03:00.000Z"
      },
      assistant2: {
        id: "assistant2",
        projectId: "project1",
        conversationId: "conv1",
        role: "assistant",
        content: "A revision workspace keeps answers, edits, notes, and timeline evidence.",
        status: "active",
        memoryScope: "conversation",
        includeInContext: true,
        createdAt: "2026-07-05T01:04:00.000Z"
      } as MessageModel
    }
  };
}

describe("Phase 10 workspace migration foundation", () => {
  it("audit detects missing fields and does not mutate workspace records", () => {
    const state = legacyState();
    const brokenMessage = {
      ...state.revisionMessages.assistant1,
      createdAt: "",
      content: ""
    } as MessageModel;
    const audited = WorkspaceMigrationAuditService.auditLegacyWorkspaceData({
      state: {
        ...state,
        revisionMessages: {
          ...state.revisionMessages,
          assistant1: brokenMessage
        }
      },
      now: "2026-07-05T02:00:00.000Z"
    });

    expect(audited.report.issueCounts.warning).toBeGreaterThan(0);
    expect(
      audited.report.issues.map((issue) => issue.issueCode)
    ).toEqual(
      expect.arrayContaining([
        "assistant_messages_without_content",
        "messages_without_created_at"
      ])
    );
    expect(audited.state.revisionMessages.assistant1).toEqual(brokenMessage);
    expect(Object.values(audited.state.migrationIssues).length).toBeGreaterThan(0);
  });

  it("backfill is idempotent and reconstructs document, timeline, LLM, and context records", () => {
    const first = WorkspaceBackfillService.backfillProject({
      state: legacyState(),
      projectId: "project1",
      now: "2026-07-05T02:10:00.000Z"
    });
    const ready = WorkspaceBackfillService.markProjectRevisionWorkspaceReady({
      state: first.state,
      projectId: "project1",
      migrationJobId: first.migrationJobId,
      now: "2026-07-05T02:10:01.000Z"
    }).state;
    const second = WorkspaceBackfillService.backfillProject({
      state: ready,
      projectId: "project1",
      migrationJobId: first.migrationJobId,
      now: "2026-07-05T02:10:02.000Z"
    });

    expect(Object.keys(second.state.documentVersions)).toHaveLength(2);
    expect(Object.keys(second.state.documentVersions)).toEqual(
      Object.keys(ready.documentVersions)
    );
    expect(
      Object.values(second.state.documentVersions).filter(
        (version) => version.status === "active"
      )
    ).toHaveLength(1);
    expect(second.state.mainConversations.conv1.activeDocumentVersionId)
      .toBe("document-version-backfill-assistant2");
    const eventTypes = Object.values(second.state.eventLogs).map(
      (event) => event.eventType
    );
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "migration.started",
        "project.created",
        "conversation.created",
        "message.user.created",
        "message.assistant.created",
        "document.version.created",
        "backfill.document_version.created",
        "backfill.timeline_node.created",
        "backfill.context_snapshot.reconstructed",
        "backfill.active_path.created"
      ])
    );
    expect(Object.values(second.state.timelineNodes).length).toBeGreaterThan(0);
    expect(Object.values(second.state.timelineEdges).length).toBeGreaterThan(0);
    const hasEdge = (sourceNodeId: string, targetNodeId: string) =>
      Object.values(second.state.timelineEdges).some(
        (edge) =>
          edge.sourceNodeId === sourceNodeId &&
          edge.targetNodeId === targetNodeId &&
          edge.edgeType === "sequence"
      );
    expect(
      hasEdge(
        "timeline-message-backfill-assistant1",
        "timeline-document-version-backfill-document-version-backfill-assistant1"
      )
    ).toBe(true);
    expect(
      hasEdge(
        "timeline-document-version-backfill-document-version-backfill-assistant1",
        "timeline-message-backfill-user2"
      )
    ).toBe(true);
    expect(
      hasEdge(
        "timeline-message-backfill-assistant2",
        "timeline-document-version-backfill-document-version-backfill-assistant2"
      )
    ).toBe(true);
    expect(second.state.mainConversations.conv1.activeTimelinePathId)
      .toBeTruthy();
    expect(second.state.mainConversations.conv1.activeTimelineNodeId)
      .toBeTruthy();
    expect(Object.values(second.state.llmCallRecords)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outputMessageId: "assistant1",
          model: "unknown_legacy_model",
          inputMessageId: "user1"
        })
      ])
    );
    expect(Object.values(second.state.contextSnapshots)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "reconstructed",
          metadata: expect.objectContaining({
            reconstruction_quality: "partial",
            warning:
              "Original runtime context was not stored in legacy system."
          })
        })
      ])
    );
    expect(WorkspaceIndexService.hasRequiredIndexes(second.state)).toBe(true);
    expect(second.state.projects.project1.revisionWorkspaceReady).toBe(true);
  });

  it("preserves deleted and discarded memory exclusion during backfill", () => {
    const state = legacyState();
    const withExcludedMemory: RevisionRepositoryState = {
      ...state,
      revisionMessages: {
        ...state.revisionMessages,
        deletedUser: {
          id: "deletedUser",
          projectId: "project1",
          conversationId: "conv1",
          role: "user",
          content: "This deleted prompt must never enter context.",
          status: "deleted",
          memoryScope: "conversation",
          includeInContext: true,
          createdAt: "2026-07-05T01:00:30.000Z"
        },
        discardedUser: {
          id: "discardedUser",
          projectId: "project1",
          conversationId: "conv1",
          role: "user",
          content: "This discarded prompt should stay out by default.",
          status: "discarded",
          memoryScope: "conversation",
          includeInContext: true,
          createdAt: "2026-07-05T01:00:45.000Z"
        }
      },
      annotations: {
        deletedNote: {
          id: "deletedNote",
          projectId: "project1",
          conversationId: "conv1",
          content: "Deleted note body",
          scope: "annotation",
          scopeObjectId: "conv1",
          scopeType: "conversation",
          scopeId: "conv1",
          sourceType: "manual_note",
          status: "deleted",
          includeInContext: true,
          createdAt: "2026-07-05T01:00:50.000Z",
          updatedAt: "2026-07-05T01:00:50.000Z"
        },
        discardedNote: {
          id: "discardedNote",
          projectId: "project1",
          conversationId: "conv1",
          content: "Discarded note body",
          scope: "annotation",
          scopeObjectId: "conv1",
          scopeType: "conversation",
          scopeId: "conv1",
          sourceType: "manual_note",
          status: "discarded",
          includeInContext: true,
          createdAt: "2026-07-05T01:00:55.000Z",
          updatedAt: "2026-07-05T01:00:55.000Z"
        }
      }
    };
    const result = WorkspaceBackfillService.backfillProject({
      state: withExcludedMemory,
      projectId: "project1",
      now: "2026-07-05T02:15:00.000Z"
    }).state;
    const deletedContextItem = Object.values(result.contextSnapshots)
      .flatMap((snapshot) => snapshot.includedItems)
      .find((item) => item.sourceId === "deletedUser");
    const discardedContextItem = Object.values(result.contextSnapshots)
      .flatMap((snapshot) => snapshot.includedItems)
      .find((item) => item.sourceId === "discardedUser");

    expect(result.revisionMessages.deletedUser.includeInContext).toBe(false);
    expect(result.revisionMessages.discardedUser.includeInContext).toBe(false);
    expect(result.annotations.deletedNote.memoryPolicy).toBe("never_include");
    expect(result.annotations.deletedNote.includeInContext).toBe(false);
    expect(result.annotations.discardedNote.memoryPolicy).toBe("excluded_by_default");
    expect(result.annotations.discardedNote.includeInContext).toBe(false);
    expect(deletedContextItem).toEqual(
      expect.objectContaining({
        included: false,
        text: "",
        reason: "legacy_deleted_message_excluded"
      })
    );
    expect(discardedContextItem).toEqual(
      expect.objectContaining({
        included: false,
        text: "",
        reason: "legacy_discarded_message_excluded"
      })
    );
  });

  it("legacy local thread anchor ambiguity becomes needs_review and notes with uncertain scope become manual_only", () => {
    const activeVersion: DocumentVersionModel = {
      id: "doc-v1",
      projectId: "project1",
      conversationId: "conv1",
      documentId: "doc1",
      versionNumber: 1,
      contentHash: hashContent("repeat repeat"),
      sourceType: "initial_answer",
      sourceId: "assistant1",
      status: "active",
      content: "repeat repeat",
      createdAt: "2026-07-05T01:05:00.000Z"
    };
    const localThread: LocalThreadModel = {
      id: "local-thread-legacy",
      projectId: "project1",
      conversationId: "conv1",
      sourceSelectionId: "selection-legacy",
      sourceDocumentVersionId: activeVersion.id,
      threadType: "local",
      status: "active",
      memoryScope: "local_thread",
      createdAt: "2026-07-05T01:06:00.000Z",
      updatedAt: "2026-07-05T01:06:00.000Z",
      payload: {
        selected_text: "repeat"
      }
    };
    const annotation: AnnotationModel = {
      id: "note-legacy",
      projectId: "project1",
      conversationId: "conv1",
      content: "Remember this note.",
      scope: "annotation",
      scopeObjectId: "unknown",
      status: "active",
      includeInContext: false,
      createdAt: "2026-07-05T01:07:00.000Z",
      updatedAt: "2026-07-05T01:07:00.000Z"
    };
    const state = {
      ...legacyState(),
      documentVersions: {
        [activeVersion.id]: activeVersion
      },
      localThreads: {
        [localThread.id]: localThread
      },
      annotations: {
        [annotation.id]: annotation
      }
    };
    const result = WorkspaceBackfillService.backfillConversation({
      state,
      conversationId: "conv1",
      now: "2026-07-05T02:20:00.000Z"
    });

    expect(result.state.textSelections["selection-legacy"].anchorStatus)
      .toBe("needs_review");
    expect(result.state.annotations["note-legacy"].memoryPolicy)
      .toBe("manual_only");
    expect(Object.values(result.state.migrationIssues).map((issue) => issue.issueCode))
      .toEqual(
        expect.arrayContaining([
          "ambiguous_selection_anchor",
          "uncertain_annotation_scope"
        ])
      );
  });

  it("integrity validator catches multiple active versions and repair dry-run does not mutate", () => {
    const backfilled = WorkspaceBackfillService.backfillProject({
      state: legacyState(),
      projectId: "project1",
      now: "2026-07-05T02:30:00.000Z"
    }).state;
    const version = backfilled.documentVersions["document-version-backfill-assistant1"];
    const broken = {
      ...backfilled,
      documentVersions: {
        ...backfilled.documentVersions,
        [version.id]: {
          ...version,
          status: "active" as const,
          contentHash: "bad-hash"
        }
      }
    };
    const validation = WorkspaceIntegrityService.validateDocumentVersions(
      broken,
      "project1",
      "conv1"
    );
    const dryRun = WorkspaceRepairService.repairWorkspaceIntegrity(broken, {
      dryRun: true,
      projectId: "project1",
      conversationId: "conv1",
      now: "2026-07-05T02:31:00.000Z"
    });
    const applied = WorkspaceRepairService.repairWorkspaceIntegrity(broken, {
      apply: true,
      projectId: "project1",
      conversationId: "conv1",
      now: "2026-07-05T02:31:00.000Z"
    });

    expect(validation.issues.map((issue) => issue.issueCode)).toEqual(
      expect.arrayContaining([
        "multiple_active_document_versions",
        "content_hash_mismatch"
      ])
    );
    const validationWithEvents = WorkspaceIntegrityService.validateProjectWithEvents(
      broken,
      "project1",
      {
        migrationJobId: Object.keys(backfilled.migrationJobs)[0],
        now: "2026-07-05T02:30:30.000Z"
      }
    );
    expect(Object.values(validationWithEvents.state.eventLogs).map((event) => event.eventType))
      .toEqual(
        expect.arrayContaining([
          "integrity.validation.completed",
          "integrity.issue.detected"
        ])
      );
    expect(dryRun.state.documentVersions[version.id].contentHash).toBe("bad-hash");
    expect(applied.state.documentVersions[version.id].contentHash)
      .toBe(hashContent(version.content));
    expect(Object.values(applied.state.eventLogs).map((event) => event.eventType))
      .toEqual(expect.arrayContaining(["integrity.repair.applied"]));
  });

  it("feature flags block high-risk actions before backfill is ready and rollback keeps legacy data", () => {
    const state = WorkspaceBackfillService.backfillProject({
      state: legacyState(),
      projectId: "project1",
      now: "2026-07-05T02:40:00.000Z"
    }).state;
    const blocked = ActionGuardService.canRunAction(
      "object.delete",
      {
        objectType: "message",
        objectId: "assistant2",
        projectId: "project1",
        conversationId: "conv1",
        status: "active"
      },
      { id: "tester", permissions: "*" },
      state
    );
    const rollback = WorkspaceRollbackService.rollbackWorkspaceMigration(state, {
      apply: true,
      migrationJobId: Object.keys(state.migrationJobs)[0],
      projectId: "project1",
      now: "2026-07-05T02:41:00.000Z"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("revision_workspace_backfill_required");
    expect(
      FeatureFlagService.isEnabled(
        rollback.state,
        "revision_workspace_enabled"
      )
    ).toBe(false);
    expect(
      FeatureFlagService.isEnabled(
        rollback.state,
        "legacy_compatibility_mode"
      )
    ).toBe(true);
    expect(Object.values(rollback.state.eventLogs).map((event) => event.eventType))
      .toEqual(expect.arrayContaining(["migration.rolled_back"]));
    expect(rollback.state.revisionMessages.user1.content)
      .toBe("Write about revision workspaces.");
  });
});
