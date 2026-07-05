import { describe, expect, it } from "vitest";
import { ActionGuardService } from "@/services/revision/ActionGuardService";
import { ButtonStateResolver } from "@/services/revision/ButtonStateResolver";
import { ComparisonService } from "@/services/revision/ComparisonService";
import { DocumentVersionService } from "@/services/revision/DocumentVersionService";
import { LocalSelectionService } from "@/services/revision/LocalSelectionService";
import { LocalThreadMessageService } from "@/services/revision/LocalThreadMessageService";
import { LocalThreadService } from "@/services/revision/LocalThreadService";
import { TextSelectionService } from "@/services/revision/TextSelectionService";
import { WorkspaceActionRegistry } from "@/services/revision/WorkspaceActionRegistry";
import { executeWorkspaceAction } from "@/services/revision/WorkspaceActionExecutor";
import { createEmptyRevisionState } from "@/services/revision/emptyRevisionState";
import type {
  DocumentVersionModel,
  RevisionRepositoryState
} from "@/types/revision";
import type { ExecuteWorkspaceActionResult } from "@/types/workspaceActions";

const user = {
  id: "tester",
  role: "owner" as const,
  permissions: "*" as const
};

function asState(result: ExecuteWorkspaceActionResult) {
  return (result as { state?: unknown }).state as RevisionRepositoryState;
}

function activeDocumentVersion(): DocumentVersionModel {
  return {
    id: "doc-version-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    documentId: "doc-1",
    parentVersionId: null,
    versionNumber: 1,
    contentHash: "hash-doc-v1",
    status: "active",
    content: "The original selected sentence should be improved.",
    title: "Document",
    createdAt: "2026-07-05T00:00:00.000Z"
  };
}

function stateWithActiveDocument() {
  const doc = activeDocumentVersion();

  return {
    ...createEmptyRevisionState(),
    projects: {
      "project-1": {
        id: "project-1",
        name: "Project",
        status: "active" as const,
        activeDocumentVersionId: doc.id,
        createdAt: doc.createdAt,
        updatedAt: doc.createdAt
      }
    },
    mainConversations: {
      "conversation-1": {
        id: "conversation-1",
        projectId: "project-1",
        title: "Main",
        status: "active" as const,
        activeDocumentVersionId: doc.id,
        createdAt: doc.createdAt,
        updatedAt: doc.createdAt
      }
    },
    documentVersions: {
      [doc.id]: doc
    }
  };
}

function localSelectionFixture() {
  const selection = TextSelectionService.createOrGetSelection({
    state: stateWithActiveDocument(),
    projectId: "project-1",
    conversationId: "conversation-1",
    sourceType: "document_version",
    sourceId: "doc-version-1",
    sourceDocumentVersionId: "doc-version-1",
    selectedText: "original selected sentence",
    startOffset: 4,
    endOffset: 30,
    textHash: "hash-selected",
    now: "2026-07-05T00:01:00.000Z",
    suffix: "phase9-selection"
  });
  const thread = LocalThreadService.getOrCreateLocalThreadForSelection({
    state: selection.state,
    projectId: "project-1",
    selectionId: selection.selection.id,
    conversationId: "conversation-1",
    now: "2026-07-05T00:01:01.000Z",
    suffix: "phase9-local-thread"
  });
  const started = LocalThreadMessageService.createStartedLocalSend({
    state: thread.state,
    projectId: "project-1",
    localThreadId: thread.localThread.id,
    question: "Revise it",
    model: "gpt-5.5",
    activeDocumentVersion: activeDocumentVersion(),
    now: "2026-07-05T00:01:02.000Z",
    suffix: "phase9-local-message"
  });
  const completed = LocalThreadMessageService.completeLocalSend({
    state: started.state,
    projectId: "project-1",
    localThreadId: thread.localThread.id,
    question: "Revise it",
    answer: "A refined fragment for the selected sentence.",
    model: "gpt-5.5",
    provider: "mock",
    llmCallId: started.llmCallRecord.id,
    contextSnapshotId: started.contextSnapshot.id,
    userMessageId: started.userMessage.id,
    userTimelineNodeId: started.timelineNodes[0].id,
    now: "2026-07-05T00:01:03.000Z",
    suffix: "phase9-local-message"
  });
  const localSelection = LocalSelectionService.createOrGetLocalSelection({
    state: completed.state,
    projectId: "project-1",
    conversationId: "conversation-1",
    sourceLocalThreadId: thread.localThread.id,
    sourceMessageId: completed.assistantMessage.id,
    sourceAnswerId: completed.assistantMessage.id,
    parentSelectionId: selection.selection.id,
    sourceDocumentVersionId: "doc-version-1",
    selectedText: "refined fragment",
    startOffset: 2,
    endOffset: 18,
    now: "2026-07-05T00:01:04.000Z",
    suffix: "phase9-local-selection"
  });

  return {
    state: localSelection.state,
    selection: selection.selection,
    localThread: thread.localThread,
    localAssistantMessage: completed.assistantMessage,
    localSelection: localSelection.localSelection
  };
}

describe("Phase 9 workspace action layer", () => {
  it("registers final actions and timeline mappings", () => {
    const action = WorkspaceActionRegistry.getAction("merge.into_document");
    const mapping = WorkspaceActionRegistry.getTimelineMapping("merge.into_document");

    expect(WorkspaceActionRegistry.listActions().map((item) => item.actionId))
      .toEqual(
        expect.arrayContaining([
          "message.send",
          "annotation.keep_as_note",
          "merge.into_document",
          "comparison.regenerate",
          "timeline.revert_to_node",
          "document.confirm_edit"
        ])
      );
    expect(action).toMatchObject({
      requiresConfirmation: true,
      requiresDiffReview: true,
      serviceHandler: "merge.into_document"
    });
    expect(mapping).toMatchObject({
      memoryScope: "document",
      memoryEffect: "updates_document_memory",
      defaultEdgeType: "merge_back",
      displayPolicy: "visible"
    });
  });

  it("send main uses executeWorkspaceAction and creates persistent records", () => {
    const result = executeWorkspaceAction(
      stateWithActiveDocument(),
      "message.send",
      {
        target: {
          objectType: "main_conversation",
          objectId: "conversation-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        prompt: "写一段测试",
        answer: "测试回答",
        model: "gpt-5.5",
        idempotencyKey: "phase9-send-main",
        now: "2026-07-05T00:02:00.000Z",
        suffix: "phase9-send-main"
      },
      user
    );
    const state = asState(result);

    expect(result.status).toBe("success");
    expect(Object.values(state.revisionMessages)).toHaveLength(2);
    expect(Object.values(state.llmCallRecords)[0]).toMatchObject({
      model: "gpt-5.5",
      status: "completed"
    });
    expect(Object.values(state.contextSnapshots)).toHaveLength(1);
    expect(Object.values(state.eventLogs).map((event) => event.eventType))
      .toEqual(
        expect.arrayContaining([
          "message.user.created",
          "context_snapshot.created",
          "llm.call.started",
          "llm.call.completed",
          "message.assistant.created"
        ])
      );
    expect(Object.values(state.timelineNodes)).toHaveLength(2);
    expect(Object.values(state.actionIdempotencyRecords)[0]).toMatchObject({
      actionId: "message.send",
      status: "completed"
    });
  });

  it("regenerate message supersedes the old answer and keeps both timeline nodes", () => {
    const sent = executeWorkspaceAction(
      stateWithActiveDocument(),
      "message.send",
      {
        target: {
          objectType: "main_conversation",
          objectId: "conversation-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        prompt: "Draft an answer",
        answer: "Original answer.",
        now: "2026-07-05T00:02:30.000Z",
        suffix: "phase9-regenerate-source"
      },
      user
    );
    const sentState = asState(sent);
    const sourceAnswer = Object.values(sentState.revisionMessages).find(
      (message) => message.role === "assistant"
    )!;
    const regenerated = executeWorkspaceAction(
      sentState,
      "message.regenerate",
      {
        target: {
          objectType: "message",
          objectId: sourceAnswer.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        answer: "Regenerated answer.",
        now: "2026-07-05T00:02:31.000Z",
        suffix: "phase9-regenerate-answer"
      },
      user
    );
    const state = asState(regenerated);
    const regeneratedAnswer = Object.values(state.revisionMessages).find(
      (message) => message.payload?.regeneratedFromMessageId === sourceAnswer.id
    )!;

    expect(regenerated.status).toBe("success");
    expect(state.revisionMessages[sourceAnswer.id].status).toBe("superseded");
    expect(regeneratedAnswer.status).toBe("active");
    expect(Object.values(state.eventLogs).map((event) => event.eventType))
      .toEqual(
        expect.arrayContaining([
          "context_snapshot.created",
          "llm.call.started",
          "llm.call.completed",
          "message.regenerated"
        ])
      );
    expect(Object.values(state.timelineEdges)).toEqual(
      expect.arrayContaining([expect.objectContaining({ edgeType: "supersede" })])
    );
    expect(
      Object.values(state.llmCallRecords).find(
        (call) => call.outputMessageId === regeneratedAnswer.id
      )?.model
    ).toBe("gpt-5.5");
  });

  it("send local stays local scoped", () => {
    const fixture = localSelectionFixture();
    const result = executeWorkspaceAction(
      fixture.state,
      "message.send",
      {
        target: {
          objectType: "local_thread",
          objectId: fixture.localThread.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        prompt: "继续局部修改",
        answer: "局部回答",
        model: "gpt-5.5",
        now: "2026-07-05T00:03:00.000Z",
        suffix: "phase9-local-send"
      },
      user
    );
    const state = asState(result);
    const assistant = Object.values(state.revisionMessages).find(
      (message) => message.content === "局部回答"
    );

    expect(result.status).toBe("success");
    expect(assistant).toMatchObject({
      threadType: "local",
      memoryScope: "local_thread"
    });
  });

  it("revise opens local and nested local threads through one action", () => {
    const fixture = localSelectionFixture();
    const localResult = executeWorkspaceAction(
      fixture.state,
      "revise.open",
      {
        target: {
          objectType: "text_selection",
          objectId: fixture.selection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:04:00.000Z",
        suffix: "phase9-open-local"
      },
      user
    );
    const nestedResult = executeWorkspaceAction(
      asState(localResult),
      "revise.open",
      {
        target: {
          objectType: "local_selection",
          objectId: fixture.localSelection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:04:01.000Z",
        suffix: "phase9-open-nested"
      },
      user
    );

    expect(localResult.status).toBe("success");
    expect(nestedResult.status).toBe("success");
    expect(
      Object.values(asState(nestedResult).localThreads).some(
        (thread) => thread.threadType === "nested_local"
      )
    ).toBe(true);
  });

  it("branch and annotation actions do not update document memory", () => {
    const fixture = localSelectionFixture();
    const branchResult = executeWorkspaceAction(
      fixture.state,
      "branch.create",
      {
        target: {
          objectType: "local_selection",
          objectId: fixture.localSelection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:05:00.000Z",
        suffix: "phase9-branch"
      },
      user
    );
    const noteResult = executeWorkspaceAction(
      asState(branchResult),
      "annotation.keep_as_note",
      {
        target: {
          objectType: "local_selection",
          objectId: fixture.localSelection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:05:01.000Z",
        suffix: "phase9-keep-note"
      },
      user
    );
    const state = asState(noteResult);

    expect(Object.values(state.revisionBranches)[0]).toMatchObject({
      memoryEffect: "branch_only",
      status: "active"
    });
    expect(Object.values(state.annotations)[0]).toMatchObject({
      sourceType: "selected_fragment",
      includeInContext: true
    });
    expect(Object.values(state.documentVersions)).toHaveLength(1);
  });

  it("merge requires confirmation and diff before creating a document version", () => {
    const fixture = localSelectionFixture();
    const confirmation = executeWorkspaceAction(
      fixture.state,
      "merge.into_document",
      {
        target: {
          objectType: "local_selection",
          objectId: fixture.localSelection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        }
      },
      user
    );

    expect(confirmation.status).toBe("confirmation_required");

    const diffRequired = executeWorkspaceAction(
      fixture.state,
      "merge.into_document",
      {
        target: {
          objectType: "local_selection",
          objectId: fixture.localSelection.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        confirmed: true,
        now: "2026-07-05T00:06:00.000Z",
        suffix: "phase9-merge-proposal"
      },
      user
    );
    const proposalState = asState(diffRequired);
    const mergeRecord = Object.values(proposalState.mergeRecords)[0];

    expect(diffRequired.status).toBe("diff_required");
    expect(mergeRecord.status).toBe("diff_ready");
    expect(Object.values(proposalState.documentVersions)).toHaveLength(1);

    const confirmed = executeWorkspaceAction(
      proposalState,
      "merge.into_document",
      {
        target: {
          objectType: "merge_record",
          objectId: mergeRecord.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "diff_ready"
        },
        confirmed: true,
        diffAccepted: true,
        now: "2026-07-05T00:06:01.000Z",
        suffix: "phase9-merge-confirm"
      },
      user
    );

    expect(confirmed.status).toBe("success");
    expect(Object.values(asState(confirmed).documentVersions)).toHaveLength(2);
    expect(Object.values(asState(confirmed).eventLogs).map((event) => event.eventType))
      .toContain("merge.confirmed");
  });

  it("discard delete restore and button states enforce memory safety", () => {
    const note = executeWorkspaceAction(
      stateWithActiveDocument(),
      "annotation.add_context_note",
      {
        target: {
          objectType: "document_version",
          objectId: "doc-version-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        content: "Remember this locally.",
        now: "2026-07-05T00:07:00.000Z",
        suffix: "phase9-note"
      },
      user
    );
    const annotation = Object.values(asState(note).annotations)[0];
    const discard = executeWorkspaceAction(
      asState(note),
      "object.discard",
      {
        target: {
          objectType: "annotation",
          objectId: annotation.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        confirmed: true,
        now: "2026-07-05T00:07:01.000Z",
        suffix: "phase9-discard-note"
      },
      user
    );
    const discarded = asState(discard).annotations[annotation.id];
    const disabled = ButtonStateResolver.getButtonState(
      "annotation.keep_as_note",
      {
        objectType: "annotation",
        objectId: annotation.id,
        projectId: "project-1",
        status: discarded.status
      },
      user,
      asState(discard)
    );
    const restore = executeWorkspaceAction(
      asState(discard),
      "object.restore",
      {
        target: {
          objectType: "annotation",
          objectId: annotation.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "discarded"
        },
        now: "2026-07-05T00:07:02.000Z",
        suffix: "phase9-restore-note"
      },
      user
    );
    const deleted = executeWorkspaceAction(
      asState(restore),
      "object.delete",
      {
        target: {
          objectType: "annotation",
          objectId: annotation.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        confirmed: true,
        now: "2026-07-05T00:07:03.000Z",
        suffix: "phase9-delete-note"
      },
      user
    );

    expect(discarded).toMatchObject({
      status: "discarded",
      memoryPolicy: "excluded_by_default"
    });
    expect(disabled.enabled).toBe(false);
    expect(asState(restore).annotations[annotation.id].status).toBe("active");
    expect(asState(deleted).annotations[annotation.id]).toMatchObject({
      status: "deleted",
      memoryPolicy: "never_include"
    });
  });

  it("comparison actions regenerate clear export and preserve history", () => {
    const first = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "Original answer.",
      now: "2026-07-05T00:08:00.000Z",
      suffix: "phase9-doc-a"
    });
    const second = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: first.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-2",
      content: "Revised answer with details.",
      now: "2026-07-05T00:08:01.000Z",
      suffix: "phase9-doc-b"
    });
    const created = ComparisonService.createComparison({
      state: second.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sources: [
        { objectType: "document_version", objectId: first.documentVersion.id },
        { objectType: "document_version", objectId: second.documentVersion.id }
      ],
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-05T00:08:02.000Z",
      suffix: "phase9-comparison"
    });
    const regenerated = executeWorkspaceAction(
      created.state,
      "comparison.regenerate",
      {
        target: {
          objectType: "comparison_graph",
          objectId: created.comparison.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:08:03.000Z",
        suffix: "phase9-comparison-regenerate"
      },
      user
    );
    const exported = executeWorkspaceAction(
      asState(regenerated),
      "map.export",
      {
        target: {
          objectType: "comparison_graph",
          objectId: created.comparison.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        exportType: "markdown",
        now: "2026-07-05T00:08:04.000Z",
        suffix: "phase9-comparison-export"
      },
      user
    );
    const cleared = executeWorkspaceAction(
      asState(exported),
      "comparison.clear",
      {
        target: {
          objectType: "comparison_graph",
          objectId: created.comparison.id,
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        now: "2026-07-05T00:08:05.000Z",
        suffix: "phase9-comparison-clear"
      },
      user
    );
    const state = asState(cleared);

    expect(Object.values(state.comparisonRuns)).toHaveLength(2);
    expect(state.comparisonRuns[created.run.id].status).toBe("superseded");
    expect(Object.values(state.comparisonExports)).toHaveLength(1);
    expect(state.comparisonGraphs[created.comparison.id].status).toBe("cleared");
  });

  it("context preview/review and window actions are read-only", () => {
    const state = stateWithActiveDocument();
    const preview = executeWorkspaceAction(
      state,
      "context.preview",
      {
        target: {
          objectType: "main_conversation",
          objectId: "conversation-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        }
      },
      user
    );
    const minimized = executeWorkspaceAction(
      state,
      "window.minimize",
      {
        target: {
          objectType: "window",
          objectId: "window-1",
          status: "active"
        }
      },
      user
    );

    expect(preview.status).toBe("success");
    expect(minimized.status).toBe("success");
    expect(asState(preview).eventLogs).toEqual(state.eventLogs);
    expect(asState(minimized).timelineNodes).toEqual(state.timelineNodes);
  });

  it("context review redacts deleted memory even when the reason is annotated", () => {
    const state = {
      ...stateWithActiveDocument(),
      contextSnapshots: {
        "context-deleted": {
          id: "context-deleted",
          llmCallId: "llm-deleted",
          projectId: "project-1",
          callType: "main_conversation" as const,
          purpose: "general_followup" as const,
          model: "gpt-5.5",
          includedItems: [
            {
              id: "bad-included-deleted",
              type: "annotation",
              sourceId: "deleted-note",
              text: "This should never be included.",
              reason: "because deleted_memory_never_included",
              included: true
            }
          ],
          excludedItems: [
            {
              id: "excluded-deleted",
              type: "annotation",
              sourceId: "deleted-note",
              text: "Deleted note body",
              reason:
                "because unrelated_selected_text_scope | because deleted_memory_never_included",
              included: false
            }
          ],
          tokenEstimate: 1,
          createdAt: "2026-07-05T00:08:20.000Z"
        }
      }
    };
    const reviewed = executeWorkspaceAction(
      state,
      "context.review",
      {
        target: {
          objectType: "context_snapshot",
          objectId: "context-deleted",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        }
      },
      user
    );
    if (reviewed.status !== "success") {
      throw new Error("Expected context.review to succeed");
    }
    const snapshot = reviewed.result as {
      includedItems: Array<{ id: string }>;
      excludedItems: Array<{ id: string; text: string }>;
    };

    expect(snapshot.includedItems.find((item) => item.id === "bad-included-deleted"))
      .toBeUndefined();
    expect(snapshot.excludedItems[0].text).toBe("");
  });

  it("idempotency prevents duplicate confirm actions", () => {
    const first = executeWorkspaceAction(
      stateWithActiveDocument(),
      "message.send",
      {
        target: {
          objectType: "main_conversation",
          objectId: "conversation-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        prompt: "A",
        answer: "B",
        idempotencyKey: "phase9-idempotent",
        now: "2026-07-05T00:09:00.000Z",
        suffix: "phase9-idempotent"
      },
      user
    );
    const duplicate = executeWorkspaceAction(
      asState(first),
      "message.send",
      {
        target: {
          objectType: "main_conversation",
          objectId: "conversation-1",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "active"
        },
        prompt: "A",
        answer: "B",
        idempotencyKey: "phase9-idempotent",
        now: "2026-07-05T00:09:01.000Z",
        suffix: "phase9-idempotent-again"
      },
      user
    );

    expect(first.status).toBe("success");
    expect(duplicate.status).toBe("success");
    expect(Object.values(asState(duplicate).revisionMessages)).toHaveLength(2);
  });

  it("rollback returns original state when a service handler fails", () => {
    const state = stateWithActiveDocument();
    const result = executeWorkspaceAction(
      state,
      "document.confirm_edit",
      {
        target: {
          objectType: "manual_edit_draft",
          objectId: "missing-draft",
          projectId: "project-1",
          conversationId: "conversation-1",
          status: "ready_for_review"
        },
        confirmed: true,
        diffAccepted: true,
        now: "2026-07-05T00:10:00.000Z",
        suffix: "phase9-fail"
      },
      user
    );

    expect(result.status).toBe("blocked");
    expect(state.manualEditDrafts).toEqual({});
  });

  it("invalid actions are blocked with clear reasons", () => {
    const fixture = localSelectionFixture();
    const deletedThreadState = {
      ...fixture.state,
      localThreads: {
        ...fixture.state.localThreads,
        [fixture.localThread.id]: {
          ...fixture.localThread,
          status: "deleted" as const
        }
      }
    };
    const reason = ActionGuardService.getDisabledReason(
      "message.send",
      {
        objectType: "local_thread",
        objectId: fixture.localThread.id,
        projectId: "project-1",
        conversationId: "conversation-1",
        status: "deleted"
      },
      user,
      deletedThreadState
    );

    expect(reason).toContain("deleted");
  });
});
