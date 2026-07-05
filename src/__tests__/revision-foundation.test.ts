import { describe, expect, it } from "vitest";
import { ContextSnapshotService } from "@/services/revision/ContextSnapshotService";
import { AnnotationService } from "@/services/revision/AnnotationService";
import { ComparisonService } from "@/services/revision/ComparisonService";
import { LocalSelectionService } from "@/services/revision/LocalSelectionService";
import { LocalThreadMessageService } from "@/services/revision/LocalThreadMessageService";
import { LocalThreadService } from "@/services/revision/LocalThreadService";
import { MainConversationRevisionService } from "@/services/revision/MainConversationRevisionService";
import { DocumentVersionService } from "@/services/revision/DocumentVersionService";
import { MergeService } from "@/services/revision/MergeService";
import { ObjectStateService } from "@/services/revision/ObjectStateService";
import { RevertService } from "@/services/revision/RevertService";
import { RevisionBranchService } from "@/services/revision/RevisionBranchService";
import { TextSelectionService } from "@/services/revision/TextSelectionService";
import { TimelineService } from "@/services/revision/TimelineService";
import { createEmptyRevisionState } from "@/services/revision/emptyRevisionState";
import { toTimelineApiGraph } from "@/services/revision/timelineApiShape";
import type {
  AnnotationModel,
  DocumentVersionModel,
  LocalThreadModel,
  RevisionBranchModel,
  RevisionRepositoryState
} from "@/types/revision";

function activeDocumentVersion(): DocumentVersionModel {
  return {
    id: "doc-version-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    documentId: "doc-1",
    parentVersionId: null,
    status: "active",
    content: "Active document text.",
    title: "Document",
    createdAt: "2026-07-04T00:00:00.000Z"
  };
}

function localAnswerState() {
  const selectionResult = TextSelectionService.createOrGetSelection({
    state: createEmptyRevisionState(),
    projectId: "project-1",
    conversationId: "conversation-1",
    sourceType: "message",
    sourceId: "main-answer-message",
    sourceDocumentVersionId: "doc-version-1",
    selectedText: "original main selected text",
    startOffset: 0,
    endOffset: 27,
    textHash: "hash-main-selection",
    beforeContext: "",
    afterContext: " after",
    now: "2026-07-04T00:00:00.000Z",
    suffix: "phase3-main-selection"
  });
  const localThreadResult = LocalThreadService.getOrCreateLocalThreadForSelection({
    state: selectionResult.state,
    projectId: "project-1",
    selectionId: selectionResult.selection.id,
    conversationId: "local-session-1",
    now: "2026-07-04T00:00:01.000Z",
    suffix: "phase3-local-thread"
  });
  const started = LocalThreadMessageService.createStartedLocalSend({
    state: localThreadResult.state,
    projectId: "project-1",
    localThreadId: localThreadResult.localThread.id,
    question: "Refine locally",
    model: "gpt-5.5",
    activeDocumentVersion: activeDocumentVersion(),
    documentId: "doc-1",
    activeVersionNodeId: "node-1",
    now: "2026-07-04T00:00:02.000Z",
    suffix: "phase3-local-message"
  });
  const completed = LocalThreadMessageService.completeLocalSend({
    state: started.state,
    projectId: "project-1",
    localThreadId: localThreadResult.localThread.id,
    question: "Refine locally",
    answer: "Parent local answer has a fragment worth revising.",
    model: "gpt-5.5",
    provider: "mock",
    llmCallId: started.llmCallRecord.id,
    contextSnapshotId: started.contextSnapshot.id,
    userMessageId: started.userMessage.id,
    userTimelineNodeId: started.timelineNodes[0].id,
    now: "2026-07-04T00:00:03.000Z",
    suffix: "phase3-local-message"
  });

  return {
    state: completed.state,
    mainSelection: selectionResult.selection,
    localThread: localThreadResult.localThread,
    localAssistantMessage: completed.assistantMessage,
    localAssistantNode: completed.timelineNodes[0]
  };
}

describe("revision foundation services", () => {
  it("sending a main message creates messages, events, timeline nodes, LLM call, and context snapshot", () => {
    const now = "2026-07-04T00:00:00.000Z";
    const started = MainConversationRevisionService.createStartedMainSend({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      projectName: "Default",
      conversationId: "conversation-1",
      prompt: "Write a short answer",
      model: "gpt-5.5",
      documentId: "doc-1",
      activeDocumentVersion: activeDocumentVersion(),
      activeVersionNodeId: "node-1",
      recentMessages: [],
      now,
      suffix: "test"
    });
    const completed = MainConversationRevisionService.completeMainSend({
      state: started.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Write a short answer",
      answer: "Here is the answer.",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now: "2026-07-04T00:00:01.000Z",
      suffix: "test"
    });

    expect(Object.values(completed.state.revisionMessages)).toHaveLength(2);
    expect(Object.values(completed.state.eventLogs).map((event) => event.eventType))
      .toEqual([
        "message.user.created",
        "context_snapshot.created",
        "llm.call.started",
        "llm.call.completed",
        "message.assistant.created"
      ]);
    expect(Object.values(completed.state.timelineNodes)).toHaveLength(2);
    expect(Object.values(completed.state.timelineEdges)).toHaveLength(1);
    expect(Object.values(completed.state.timelineEdges)[0].edgeType).toBe("sequence");
    expect(completed.timelineNodes[0].payload).toMatchObject({
      llm_call_id: started.llmCallRecord.id,
      context_snapshot_id: started.contextSnapshot.id
    });
    expect(completed.state.llmCallRecords[started.llmCallRecord.id].status)
      .toBe("completed");
    expect(completed.state.llmCallRecords[started.llmCallRecord.id].model)
      .toBe("gpt-5.5");
    expect(
      completed.state.llmCallRecords[started.llmCallRecord.id].contextSnapshotId
    ).toBe(started.contextSnapshot.id);
    expect(completed.state.llmCallRecords[started.llmCallRecord.id].sessionId)
      .toBe("conversation-1");
    expect(completed.state.llmCallRecords[started.llmCallRecord.id].outputMessageId)
      .toBe(completed.assistantMessage.id);
    expect(completed.state.contextSnapshots[started.contextSnapshot.id])
      .toBeTruthy();
  });

  it("deleted and discarded objects are excluded from context snapshots", () => {
    const deletedAnnotation: AnnotationModel = {
      id: "annotation-deleted",
      projectId: "project-1",
      scope: "document",
      scopeObjectId: "doc-1",
      content: "Deleted note",
      status: "deleted",
      includeInContext: true,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z"
    };
    const discardedThread: LocalThreadModel = {
      id: "thread-discarded",
      projectId: "project-1",
      sourceSelectionId: "selection-1",
      threadType: "local",
      status: "discarded",
      memoryScope: "local_thread",
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
      payload: {
        summary: "Discarded local answer"
      }
    };
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-1",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      activeDocumentVersion: activeDocumentVersion(),
      annotations: [deletedAnnotation],
      localThreads: [discardedThread]
    });

    expect(snapshot.includedItems.map((item) => item.sourceId))
      .not.toContain("annotation-deleted");
    expect(snapshot.excludedItems.map((item) => item.sourceId))
      .toEqual(expect.arrayContaining(["annotation-deleted", "thread-discarded"]));
  });

  it("unmerged branches are retained but excluded by default", () => {
    const branch: RevisionBranchModel = {
      id: "branch-1",
      projectId: "project-1",
      sourceObjectType: "text_selection",
      sourceObjectId: "selection-1",
      status: "active",
      memoryScope: "branch",
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
      payload: {
        summary: "Unmerged branch"
      }
    };
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-branch",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      revisionBranches: [branch]
    });

    expect(snapshot.excludedItems.some((item) => item.sourceId === "branch-1"))
      .toBe(true);
  });

  it("timeline nodes preserve parent-child relationship", () => {
    const state: RevisionRepositoryState = createEmptyRevisionState();
    const first = TimelineService.createTimelineNode(state, {
      id: "node-a",
      projectId: "project-1",
      eventId: "event-a",
      eventType: "message.user.created",
      targetObjectType: "message",
      targetObjectId: "message-a",
      label: "A",
      actor: "user",
      memoryScope: "conversation",
      memoryEffect: "included",
      status: "active",
      timestamp: "2026-07-04T00:00:00.000Z"
    });
    const second = TimelineService.createTimelineNode(first, {
      id: "node-b",
      projectId: "project-1",
      parentNodeId: "node-a",
      eventId: "event-b",
      eventType: "message.assistant.created",
      targetObjectType: "message",
      targetObjectId: "message-b",
      label: "B",
      actor: "assistant",
      memoryScope: "conversation",
      memoryEffect: "included",
      status: "active",
      timestamp: "2026-07-04T00:00:01.000Z"
    });
    const edge = TimelineService.createTimelineEdge(
      {
        timelineEdges: {}
      },
      {
        id: "edge-a-b",
        projectId: "project-1",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        edgeType: "sequence",
        status: "active",
        timestamp: "2026-07-04T00:00:01.000Z"
      }
    );
    const graph = TimelineService.getProjectTimelineGraph(
      {
        timelineNodes: second.timelineNodes,
        timelineEdges: edge.timelineEdges
      },
      "project-1"
    );

    expect(graph.nodes.find((node) => node.id === "node-b")?.parentNodeId)
      .toBe("node-a");
    expect(graph.edges[0]).toMatchObject({
      sourceNodeId: "node-a",
      targetNodeId: "node-b"
    });
  });

  it("serializes the project timeline graph with acceptance API field names", () => {
    const now = "2026-07-04T00:00:00.000Z";
    const started = MainConversationRevisionService.createStartedMainSend({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Explain the idea",
      model: "gpt-5.5",
      recentMessages: [],
      now,
      suffix: "api"
    });
    const completed = MainConversationRevisionService.completeMainSend({
      state: started.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Explain the idea",
      answer: "Answer text.",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now: "2026-07-04T00:00:01.000Z",
      suffix: "api"
    });
    const apiGraph = toTimelineApiGraph(
      TimelineService.getProjectTimelineGraph(completed.state, "project-1")
    );

    expect(apiGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "message.user.created",
          target_object_type: "message",
          memory_scope: "conversation"
        }),
        expect.objectContaining({
          event_type: "message.assistant.created",
          target_object_type: "message",
          memory_scope: "conversation",
          llm_call_id: started.llmCallRecord.id,
          context_snapshot_id: started.contextSnapshot.id
        })
      ])
    );
    expect(apiGraph.edges).toEqual([
      expect.objectContaining({
        edge_type: "sequence",
        from_node_id: started.timelineNodes[0].id,
        to_node_id: completed.timelineNodes[0].id
      })
    ]);
  });

  it("creates and reuses persistent text selections", () => {
    const now = "2026-07-04T00:00:00.000Z";
    const started = MainConversationRevisionService.createStartedMainSend({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Prompt",
      model: "gpt-5.5",
      recentMessages: [],
      now,
      suffix: "select-main"
    });
    const completed = MainConversationRevisionService.completeMainSend({
      state: started.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Prompt",
      answer: "Alpha beta gamma.",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now: "2026-07-04T00:00:01.000Z",
      suffix: "select-main"
    });
    const created = TextSelectionService.createOrGetSelection({
      state: completed.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "message",
      sourceId: completed.assistantMessage.id,
      selectedText: "beta",
      startOffset: 6,
      endOffset: 10,
      textHash: "hash-beta",
      beforeContext: "Alpha ",
      afterContext: " gamma.",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "select"
    });
    const reused = TextSelectionService.createOrGetSelection({
      state: created.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "message",
      sourceId: completed.assistantMessage.id,
      selectedText: "beta",
      startOffset: 6,
      endOffset: 10,
      textHash: "hash-beta",
      beforeContext: "Alpha ",
      afterContext: " gamma.",
      now: "2026-07-04T00:00:03.000Z",
      suffix: "select-again"
    });

    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect(reused.selection.id).toBe(created.selection.id);
    expect(Object.values(created.state.eventLogs).map((event) => event.eventType))
      .toContain("selection.created");
    expect(Object.values(created.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetObjectType: "text_selection",
          targetObjectId: created.selection.id,
          memoryScope: "selected_text",
          memoryEffect: "none"
        })
      ])
    );
    expect(Object.values(created.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "selection_attach"
        })
      ])
    );
  });

  it("creates and restores a local thread for a selection with a branch edge", () => {
    const selectionResult = TextSelectionService.createOrGetSelection({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "message",
      sourceId: "message-source",
      selectedText: "selected text",
      startOffset: 0,
      endOffset: 13,
      textHash: "hash-selection",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "local-selection"
    });
    const created = LocalThreadService.getOrCreateLocalThreadForSelection({
      state: selectionResult.state,
      projectId: "project-1",
      selectionId: selectionResult.selection.id,
      conversationId: "local-session-1",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "local-thread"
    });
    const restored = LocalThreadService.getOrCreateLocalThreadForSelection({
      state: created.state,
      projectId: "project-1",
      selectionId: selectionResult.selection.id,
      conversationId: "local-session-1",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "local-thread-again"
    });

    expect(created.created).toBe(true);
    expect(restored.created).toBe(false);
    expect(restored.localThread.id).toBe(created.localThread.id);
    expect(Object.values(created.state.eventLogs).map((event) => event.eventType))
      .toContain("local_thread.created");
    expect(Object.values(created.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "branch",
          targetNodeId: created.timelineNode?.id
        })
      ])
    );
  });

  it("local message send records messages, events, timeline, LLM call, and local context", () => {
    const selectionResult = TextSelectionService.createOrGetSelection({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "message",
      sourceId: "message-source",
      selectedText: "selected text",
      startOffset: 0,
      endOffset: 13,
      textHash: "hash-selection",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "local-message-selection"
    });
    const localThreadResult = LocalThreadService.getOrCreateLocalThreadForSelection({
      state: {
        ...selectionResult.state,
        localThreads: {
          "local-thread-unrelated": {
            id: "local-thread-unrelated",
            projectId: "project-1",
            conversationId: "local-session-other",
            sourceSelectionId: "other-selection",
            threadType: "local",
            status: "active",
            memoryScope: "local_thread",
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-04T00:00:00.000Z",
            payload: {
              selected_text: "unrelated local text"
            }
          }
        }
      },
      projectId: "project-1",
      selectionId: selectionResult.selection.id,
      conversationId: "local-session-1",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "local-message-thread"
    });
    const started = LocalThreadMessageService.createStartedLocalSend({
      state: localThreadResult.state,
      projectId: "project-1",
      localThreadId: localThreadResult.localThread.id,
      question: "Explain this locally",
      model: "gpt-5.5",
      activeDocumentVersion: activeDocumentVersion(),
      documentId: "doc-1",
      activeVersionNodeId: "node-1",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "local-message"
    });
    const completed = LocalThreadMessageService.completeLocalSend({
      state: started.state,
      projectId: "project-1",
      localThreadId: localThreadResult.localThread.id,
      question: "Explain this locally",
      answer: "Local answer.",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now: "2026-07-04T00:00:03.000Z",
      suffix: "local-message"
    });
    const events = Object.values(completed.state.eventLogs).map(
      (event) => event.eventType
    );

    expect(completed.state.revisionMessages[started.userMessage.id]).toBeTruthy();
    expect(completed.state.revisionMessages[completed.assistantMessage.id])
      .toBeTruthy();
    expect(events).toEqual(
      expect.arrayContaining([
        "local_message.user.created",
        "context_snapshot.created",
        "llm.call.started",
        "llm.call.completed",
        "local_message.assistant.created"
      ])
    );
    expect(completed.state.llmCallRecords[started.llmCallRecord.id]).toMatchObject({
      model: "gpt-5.5",
      threadId: localThreadResult.localThread.id,
      contextSnapshotId: started.contextSnapshot.id,
      outputMessageId: completed.assistantMessage.id
    });
    expect(started.contextSnapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "source_text_selection",
          text: "selected text"
        }),
        expect.objectContaining({
          type: "local_thread_message",
          sourceId: started.userMessage.id
        }),
        expect.objectContaining({
          type: "active_document_version"
        })
      ])
    );
    expect(started.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "local_thread",
          sourceId: "local-thread-unrelated"
        })
      ])
    );
    expect(Object.values(completed.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "branch"
        }),
        expect.objectContaining({
          edgeType: "sequence",
          sourceNodeId: started.timelineNodes[0].id,
          targetNodeId: completed.timelineNodes[0].id
        })
      ])
    );
  });

  it("selecting text inside a local assistant answer creates and reuses LocalSelection", () => {
    const setup = localAnswerState();
    const created = LocalSelectionService.createOrGetLocalSelection({
      state: setup.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      sourceDocumentVersionId: "doc-version-1",
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      beforeContext: "answer has a ",
      afterContext: " worth revising.",
      textHash: "hash-local-fragment",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase3-local-selection"
    });
    const reused = LocalSelectionService.createOrGetLocalSelection({
      state: created.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      sourceDocumentVersionId: "doc-version-1",
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      beforeContext: "answer has a ",
      afterContext: " worth revising.",
      textHash: "hash-local-fragment",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:05.000Z",
      suffix: "phase3-local-selection-again"
    });

    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect(reused.localSelection.id).toBe(created.localSelection.id);
    expect(Object.values(created.state.eventLogs).map((event) => event.eventType))
      .toContain("local_selection.created");
    expect(Object.values(created.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "selection_attach",
          sourceNodeId: setup.localAssistantNode.id,
          targetNodeId: created.timelineNode?.id
        })
      ])
    );
  });

  it("Revise creates or restores a nested local thread for a LocalSelection", () => {
    const setup = localAnswerState();
    const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
      state: setup.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      textHash: "hash-local-fragment",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase3-nested-selection"
    });
    const created =
      LocalThreadService.getOrCreateNestedLocalThreadForLocalSelection({
        state: localSelectionResult.state,
        projectId: "project-1",
        localSelectionId: localSelectionResult.localSelection.id,
        conversationId: "nested-session-1",
        now: "2026-07-04T00:00:05.000Z",
        suffix: "phase3-nested-thread"
      });
    const restored =
      LocalThreadService.getOrCreateNestedLocalThreadForLocalSelection({
        state: created.state,
        projectId: "project-1",
        localSelectionId: localSelectionResult.localSelection.id,
        conversationId: "nested-session-1",
        now: "2026-07-04T00:00:06.000Z",
        suffix: "phase3-nested-thread-again"
      });

    expect(created.created).toBe(true);
    expect(restored.created).toBe(false);
    expect(restored.localThread.id).toBe(created.localThread.id);
    expect(created.localThread).toMatchObject({
      threadType: "nested_local",
      parentThreadId: setup.localThread.id,
      parentLocalSelectionId: localSelectionResult.localSelection.id,
      sourceType: "local_selection"
    });
    expect(Object.values(created.state.eventLogs).map((event) => event.eventType))
      .toContain("nested_local_thread.created");
    expect(Object.values(created.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "nested_branch",
          targetNodeId: created.timelineNode?.id
        })
      ])
    );
  });

  it("nested local messages are persisted with nested events, LLM call, and context snapshot", () => {
    const setup = localAnswerState();
    const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...setup.state,
        localThreads: {
          ...setup.state.localThreads,
          "unrelated-local-thread": {
            id: "unrelated-local-thread",
            projectId: "project-1",
            sourceSelectionId: "other-selection",
            threadType: "local",
            status: "active",
            memoryScope: "local_thread",
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-04T00:00:00.000Z",
            payload: {
              selected_text: "unrelated local thread"
            }
          },
          "deleted-local-thread": {
            id: "deleted-local-thread",
            projectId: "project-1",
            sourceSelectionId: "deleted-selection",
            threadType: "local",
            status: "deleted",
            memoryScope: "local_thread",
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-04T00:00:00.000Z",
            payload: {
              selected_text: "deleted local thread"
            }
          }
        }
      },
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      sourceDocumentVersionId: "doc-version-1",
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      beforeContext: "answer has a ",
      afterContext: " worth revising.",
      textHash: "hash-local-fragment",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase3-nested-message-selection"
    });
    const nestedThreadResult =
      LocalThreadService.getOrCreateNestedLocalThreadForLocalSelection({
        state: localSelectionResult.state,
        projectId: "project-1",
        localSelectionId: localSelectionResult.localSelection.id,
        conversationId: "nested-session-1",
        now: "2026-07-04T00:00:05.000Z",
        suffix: "phase3-nested-message-thread"
      });
    const started = LocalThreadMessageService.createStartedLocalSend({
      state: nestedThreadResult.state,
      projectId: "project-1",
      localThreadId: nestedThreadResult.localThread.id,
      question: "Revise this nested fragment",
      model: "gpt-5.5",
      activeDocumentVersion: activeDocumentVersion(),
      documentId: "doc-1",
      activeVersionNodeId: "node-1",
      now: "2026-07-04T00:00:06.000Z",
      suffix: "phase3-nested-message"
    });
    const completed = LocalThreadMessageService.completeLocalSend({
      state: started.state,
      projectId: "project-1",
      localThreadId: nestedThreadResult.localThread.id,
      question: "Revise this nested fragment",
      answer: "Nested local answer.",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      now: "2026-07-04T00:00:07.000Z",
      suffix: "phase3-nested-message"
    });
    const events = Object.values(completed.state.eventLogs).map(
      (event) => event.eventType
    );

    expect(completed.state.revisionMessages[started.userMessage.id]).toMatchObject({
      threadType: "nested_local"
    });
    expect(completed.state.revisionMessages[completed.assistantMessage.id])
      .toMatchObject({
        threadType: "nested_local"
      });
    expect(events).toEqual(
      expect.arrayContaining([
        "nested_local_message.user.created",
        "context_snapshot.created",
        "llm.call.started",
        "llm.call.completed",
        "nested_local_message.assistant.created"
      ])
    );
    expect(completed.state.llmCallRecords[started.llmCallRecord.id])
      .toMatchObject({
        model: "gpt-5.5",
        threadId: nestedThreadResult.localThread.id,
        threadType: "nested_local",
        contextSnapshotId: started.contextSnapshot.id,
        outputMessageId: completed.assistantMessage.id
      });
    expect(started.contextSnapshot).toMatchObject({
      threadType: "nested_local"
    });
    expect(started.contextSnapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "current_local_selection",
          text: "fragment"
        }),
        expect.objectContaining({
          type: "selected_local_fragment"
        }),
        expect.objectContaining({
          type: "source_parent_local_answer",
          sourceId: setup.localAssistantMessage.id
        }),
        expect.objectContaining({
          type: "parent_local_thread",
          sourceId: setup.localThread.id
        }),
        expect.objectContaining({
          type: "source_text_selection",
          sourceId: setup.mainSelection.id
        })
      ])
    );
    expect(started.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "local_thread",
          sourceId: "unrelated-local-thread"
        }),
        expect.objectContaining({
          type: "local_thread",
          sourceId: "deleted-local-thread",
          text: ""
        })
      ])
    );
    expect(Object.values(completed.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "nested_branch"
        }),
        expect.objectContaining({
          edgeType: "sequence",
          sourceNodeId: started.timelineNodes[0].id,
          targetNodeId: completed.timelineNodes[0].id
        })
      ])
    );
  });

  it("Branch creates a RevisionBranch from LocalSelection without entering document memory", () => {
    const setup = localAnswerState();
    const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
      state: setup.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      sourceDocumentVersionId: "doc-version-1",
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      textHash: "hash-local-fragment",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase3-branch-selection"
    });
    const branchResult = RevisionBranchService.createBranchFromLocalSelection({
      state: localSelectionResult.state,
      projectId: "project-1",
      localSelectionId: localSelectionResult.localSelection.id,
      baseDocumentVersionId: "doc-version-1",
      now: "2026-07-04T00:00:05.000Z",
      suffix: "phase3-branch"
    });
    const mainSnapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-after-branch",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      revisionBranches: Object.values(branchResult.state.revisionBranches)
    });

    expect(branchResult.branch).toMatchObject({
      sourceObjectType: "local_selection",
      sourceObjectId: localSelectionResult.localSelection.id,
      parentSelectionId: setup.mainSelection.id,
      parentLocalSelectionId: localSelectionResult.localSelection.id,
      sourceLocalThreadId: setup.localThread.id,
      content: "fragment",
      draftContent: "fragment",
      memoryScope: "branch",
      memoryEffect: "branch_only"
    });
    expect(Object.values(branchResult.state.eventLogs).map((event) => event.eventType))
      .toContain("branch.created");
    expect(Object.values(branchResult.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "branch",
          targetNodeId: branchResult.timelineNode?.id
        })
      ])
    );
    expect(mainSnapshot.includedItems.map((item) => item.sourceId))
      .not.toContain(branchResult.branch.id);
    expect(mainSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "revision_branch",
          sourceId: branchResult.branch.id
        })
      ])
    );
  });

  it("Add Context Note creates Annotation, EventLog, TimelineNode, and annotation edge", () => {
    const selectionResult = TextSelectionService.createOrGetSelection({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "message",
      sourceId: "message-source",
      selectedText: "selected text",
      startOffset: 0,
      endOffset: 13,
      textHash: "hash-selection-note",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase4-note-selection"
    });
    const noteResult = AnnotationService.createAnnotationFromManualNote({
      state: selectionResult.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      content: "Remember this selected text.",
      title: "Manual note",
      scopeType: "selected_text",
      scopeId: selectionResult.selection.id,
      sourceId: selectionResult.selection.id,
      sourceText: selectionResult.selection.selectedText,
      sourceSelectionId: selectionResult.selection.id,
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase4-manual-note"
    });

    expect(noteResult.annotation).toMatchObject({
      scopeType: "selected_text",
      scopeId: selectionResult.selection.id,
      sourceType: "manual_note",
      memoryPolicy: "auto_by_scope",
      status: "active"
    });
    const noteEvent = Object.values(noteResult.state.eventLogs).find(
      (event) =>
        event.eventType === "annotation.created" &&
        event.objectId === noteResult.annotation.id
    );
    const noteNode = Object.values(noteResult.state.timelineNodes).find(
      (node) =>
        node.targetObjectType === "annotation" &&
        node.targetObjectId === noteResult.annotation.id
    );

    expect(noteEvent?.payload).toMatchObject({
      content_hash: expect.stringMatching(/^note-/),
      scope_type: "selected_text",
      scope_id: selectionResult.selection.id,
      source_type: "manual_note",
      source_id: selectionResult.selection.id,
      memory_policy: "auto_by_scope",
      source_object_type: "text_selection",
      source_object_id: selectionResult.selection.id,
      selection_id: selectionResult.selection.id,
      actor_type: "user",
      actor_id: "user"
    });
    expect(Object.values(noteResult.state.eventLogs).map((event) => event.eventType))
      .toContain("annotation.created");
    expect(Object.values(noteResult.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetObjectType: "annotation",
          targetObjectId: noteResult.annotation.id,
          memoryScope: "annotation",
          memoryEffect: "adds_annotation_memory"
        })
      ])
    );
    expect(noteNode?.payload).toMatchObject({
      node_id: noteNode?.id,
      project_id: "project-1",
      conversation_id: "conversation-1",
      event_id: noteEvent?.id,
      event_type: "annotation.created",
      target_object_type: "annotation",
      target_object_id: noteResult.annotation.id,
      source_object_type: "text_selection",
      source_object_id: selectionResult.selection.id,
      selection_id: selectionResult.selection.id,
      scope_type: "selected_text",
      scope_id: selectionResult.selection.id,
      memory_scope: "annotation",
      memory_effect: "adds_annotation_memory",
      status: "active",
      actor_type: "user",
      actor_id: "user",
      payload: expect.objectContaining({
        content_hash: expect.stringMatching(/^note-/),
        scope_type: "selected_text",
        scope_id: selectionResult.selection.id,
        source_type: "manual_note",
        source_id: selectionResult.selection.id,
        memory_policy: "auto_by_scope"
      })
    });
    expect(Object.values(noteResult.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "annotation_attach"
        })
      ])
    );
  });

  it("Keep as Note from whole local answer creates Annotation with correct source", () => {
    const setup = localAnswerState();
    const noteResult = AnnotationService.createAnnotationFromAnswer({
      state: setup.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      content: setup.localAssistantMessage.content,
      title: "Kept local answer",
      scopeType: "selected_text",
      scopeId: setup.mainSelection.id,
      sourceType: "local_answer",
      sourceId: setup.localAssistantMessage.id,
      sourceText: setup.localAssistantMessage.content,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceSelectionId: setup.mainSelection.id,
      sourceLocalThreadId: setup.localThread.id,
      sourceTimelineNodeId: setup.localAssistantNode.id,
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase4-keep-answer"
    });

    expect(noteResult.annotation).toMatchObject({
      sourceType: "local_answer",
      sourceMessageId: setup.localAssistantMessage.id,
      sourceSelectionId: setup.mainSelection.id,
      sourceLocalThreadId: setup.localThread.id
    });
    const noteNode = Object.values(noteResult.state.timelineNodes).find(
      (node) =>
        node.targetObjectType === "annotation" &&
        node.targetObjectId === noteResult.annotation.id
    );

    expect(noteNode?.payload).toMatchObject({
      source_object_type: "message",
      source_object_id: setup.localAssistantMessage.id,
      selection_id: setup.mainSelection.id,
      local_thread_id: setup.localThread.id,
      payload: expect.objectContaining({
        source_type: "local_answer",
        source_id: setup.localAssistantMessage.id
      })
    });
    expect(Object.values(noteResult.state.eventLogs).map((event) => event.eventType))
      .toContain("annotation.kept_from_answer");
    expect(Object.values(noteResult.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "annotation_attach",
          sourceNodeId: setup.localAssistantNode.id
        })
      ])
    );
  });

  it("Keep as Note from selected local fragment creates Annotation from LocalSelection", () => {
    const setup = localAnswerState();
    const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
      state: setup.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      sourceLocalThreadId: setup.localThread.id,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceAnswerId: setup.localAssistantMessage.id,
      parentSelectionId: setup.mainSelection.id,
      selectedText: "fragment",
      startOffset: 26,
      endOffset: 34,
      textHash: "hash-phase4-local-selection",
      sourceThreadType: "local",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase4-fragment-selection"
    });
    const localSelectionNode = Object.values(
      localSelectionResult.state.timelineNodes
    ).find(
      (node) =>
        node.targetObjectType === "local_selection" &&
        node.targetObjectId === localSelectionResult.localSelection.id
    );
    const noteResult = AnnotationService.createAnnotationFromLocalSelection({
      state: localSelectionResult.state,
      projectId: "project-1",
      conversationId: setup.localThread.conversationId,
      content: "Keep this fragment.",
      title: "Fragment note",
      scopeType: "selected_text",
      scopeId: setup.mainSelection.id,
      sourceId: localSelectionResult.localSelection.id,
      sourceText: localSelectionResult.localSelection.selectedText,
      sourceMessageId: setup.localAssistantMessage.id,
      sourceSelectionId: setup.mainSelection.id,
      sourceLocalSelectionId: localSelectionResult.localSelection.id,
      sourceLocalThreadId: setup.localThread.id,
      sourceTimelineNodeId: localSelectionNode?.id,
      now: "2026-07-04T00:00:05.000Z",
      suffix: "phase4-fragment-note"
    });

    expect(noteResult.annotation).toMatchObject({
      sourceType: "selected_fragment",
      sourceLocalSelectionId: localSelectionResult.localSelection.id,
      sourceLocalThreadId: setup.localThread.id
    });
    const noteNode = Object.values(noteResult.state.timelineNodes).find(
      (node) =>
        node.targetObjectType === "annotation" &&
        node.targetObjectId === noteResult.annotation.id
    );

    expect(noteNode?.payload).toMatchObject({
      source_object_type: "local_selection",
      source_object_id: localSelectionResult.localSelection.id,
      selection_id: setup.mainSelection.id,
      local_selection_id: localSelectionResult.localSelection.id,
      local_thread_id: setup.localThread.id,
      payload: expect.objectContaining({
        source_type: "selected_fragment",
        source_id: localSelectionResult.localSelection.id
      })
    });
    expect(Object.values(noteResult.state.eventLogs).map((event) => event.eventType))
      .toContain("annotation.kept_from_selection");
    expect(Object.values(noteResult.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "annotation_attach",
          sourceNodeId: localSelectionNode?.id
        })
      ])
    );
  });

  it("main conversation context includes global notes and excludes selected/local notes by default", () => {
    const projectNote = AnnotationService.createAnnotationFromManualNote({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      content: "Project-wide note",
      scopeType: "project",
      scopeId: "project-1",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase4-project-note"
    });
    const selectedNote = AnnotationService.createAnnotationFromManualNote({
      state: projectNote.state,
      projectId: "project-1",
      content: "Selected text note",
      scopeType: "selected_text",
      scopeId: "selection-1",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase4-selected-note"
    });
    const localNote = AnnotationService.createAnnotationFromManualNote({
      state: selectedNote.state,
      projectId: "project-1",
      content: "Local thread note",
      scopeType: "local_thread",
      scopeId: "local-thread-1",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase4-local-note"
    });
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase4-main",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      annotations: Object.values(localNote.state.annotations)
    });

    expect(snapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "included_note",
          sourceId: projectNote.annotation.id
        })
      ])
    );
    expect(snapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "excluded_note",
          sourceId: selectedNote.annotation.id
        }),
        expect.objectContaining({
          type: "excluded_note",
          sourceId: selectedNote.annotation.id,
          reason: expect.stringContaining(
            "because selected_text_scope_requires_active_focus"
          )
        }),
        expect.objectContaining({
          type: "excluded_note",
          sourceId: localNote.annotation.id
        }),
        expect.objectContaining({
          type: "excluded_note",
          sourceId: localNote.annotation.id,
          reason: expect.stringContaining(
            "because local_thread_scope_requires_active_focus"
          )
        })
      ])
    );
  });

  it("local context includes active scoped notes and excludes unrelated, discarded, and deleted notes", () => {
    const setup = localAnswerState();
    const selectedNote = AnnotationService.createAnnotationFromManualNote({
      state: setup.state,
      projectId: "project-1",
      content: "Selected text note",
      scopeType: "selected_text",
      scopeId: setup.mainSelection.id,
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase4-local-context-selected-note"
    });
    const localThreadNote = AnnotationService.createAnnotationFromManualNote({
      state: selectedNote.state,
      projectId: "project-1",
      content: "Local thread note",
      scopeType: "local_thread",
      scopeId: setup.localThread.id,
      now: "2026-07-04T00:00:05.000Z",
      suffix: "phase4-local-context-thread-note"
    });
    const unrelatedNote = AnnotationService.createAnnotationFromManualNote({
      state: localThreadNote.state,
      projectId: "project-1",
      content: "Unrelated note",
      scopeType: "selected_text",
      scopeId: "other-selection",
      now: "2026-07-04T00:00:06.000Z",
      suffix: "phase4-local-context-unrelated-note"
    });
    const discardedSeed = AnnotationService.createAnnotationFromManualNote({
      state: unrelatedNote.state,
      projectId: "project-1",
      content: "Discard me",
      scopeType: "selected_text",
      scopeId: setup.mainSelection.id,
      now: "2026-07-04T00:00:07.000Z",
      suffix: "phase4-local-context-discard-seed"
    });
    const discarded = AnnotationService.discardAnnotation({
      state: discardedSeed.state,
      annotationId: discardedSeed.annotation.id,
      now: "2026-07-04T00:00:08.000Z",
      suffix: "phase4-local-context-discard-note"
    });
    const deletedSeed = AnnotationService.createAnnotationFromManualNote({
      state: discarded.state,
      projectId: "project-1",
      content: "Delete me",
      scopeType: "selected_text",
      scopeId: setup.mainSelection.id,
      now: "2026-07-04T00:00:09.000Z",
      suffix: "phase4-local-context-delete-seed"
    });
    const deleted = AnnotationService.deleteAnnotation({
      state: deletedSeed.state,
      annotationId: deletedSeed.annotation.id,
      now: "2026-07-04T00:00:10.000Z",
      suffix: "phase4-local-context-delete-note"
    });
    const started = LocalThreadMessageService.createStartedLocalSend({
      state: deleted.state,
      projectId: "project-1",
      localThreadId: setup.localThread.id,
      question: "Use notes",
      model: "gpt-5.5",
      activeDocumentVersion: activeDocumentVersion(),
      documentId: "doc-1",
      activeVersionNodeId: "node-1",
      now: "2026-07-04T00:00:11.000Z",
      suffix: "phase4-local-context-send"
    });

    expect(started.contextSnapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "included_note",
          sourceId: selectedNote.annotation.id
        }),
        expect.objectContaining({
          type: "included_note",
          sourceId: selectedNote.annotation.id,
          reason: expect.stringContaining(
            "because active_note_matching_parent_selection"
          )
        }),
        expect.objectContaining({
          type: "included_note",
          sourceId: localThreadNote.annotation.id
        }),
        expect.objectContaining({
          type: "included_note",
          sourceId: localThreadNote.annotation.id,
          reason: expect.stringContaining(
            "because active_note_matching_current_local_thread"
          )
        })
      ])
    );
    expect(started.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "excluded_note",
          sourceId: unrelatedNote.annotation.id
        }),
        expect.objectContaining({
          type: "excluded_note",
          sourceId: unrelatedNote.annotation.id,
          reason: expect.stringContaining("because unrelated_selected_text_scope")
        }),
        expect.objectContaining({
          type: "excluded_note",
          sourceId: deletedSeed.annotation.id,
          text: "",
          reason: expect.stringContaining("because deleted_memory_never_included")
        })
      ])
    );
    expect(started.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "excluded_note",
          sourceId: discardedSeed.annotation.id,
          reason: expect.stringContaining(
            "because discarded_note_excluded_by_default"
          )
        })
      ])
    );
  });

  it("annotation update, scope change, discard, delete, and restore events keep audit payloads", () => {
    const created = AnnotationService.createAnnotationFromManualNote({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      content: "Original note",
      title: "Original",
      scopeType: "project",
      scopeId: "project-1",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase4-lifecycle-create"
    });
    const updated = AnnotationService.updateAnnotation({
      state: created.state,
      annotationId: created.annotation.id,
      patch: {
        content: "Updated note",
        title: "Updated"
      },
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase4-lifecycle-update"
    });
    const scopeChanged = AnnotationService.updateAnnotation({
      state: updated.state,
      annotationId: created.annotation.id,
      patch: {
        scopeType: "selected_text",
        scopeId: "selection-9"
      },
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase4-lifecycle-scope"
    });
    const discarded = AnnotationService.discardAnnotation({
      state: scopeChanged.state,
      annotationId: created.annotation.id,
      now: "2026-07-04T00:00:03.000Z",
      suffix: "phase4-lifecycle-discard"
    });
    const deleted = AnnotationService.deleteAnnotation({
      state: discarded.state,
      annotationId: created.annotation.id,
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase4-lifecycle-delete"
    });
    const restored = AnnotationService.restoreAnnotation({
      state: deleted.state,
      annotationId: created.annotation.id,
      now: "2026-07-04T00:00:05.000Z",
      suffix: "phase4-lifecycle-restore"
    });
    const events = Object.values(restored.state.eventLogs);
    const updateEvent = events.find(
      (event) => event.eventType === "annotation.updated"
    );
    const scopeEvent = events.find(
      (event) => event.eventType === "annotation.scope_changed"
    );

    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "annotation.created",
        "annotation.updated",
        "annotation.scope_changed",
        "annotation.discarded",
        "annotation.deleted",
        "annotation.restored"
      ])
    );
    expect(updateEvent?.payload).toMatchObject({
      old_content_hash: expect.stringMatching(/^note-/),
      new_content_hash: expect.stringMatching(/^note-/),
      old_scope_type: "project",
      old_scope_id: "project-1",
      new_scope_type: "project",
      new_scope_id: "project-1",
      changed_fields: expect.arrayContaining(["content", "title"])
    });
    expect(scopeEvent?.payload).toMatchObject({
      old_scope_type: "project",
      old_scope_id: "project-1",
      new_scope_type: "selected_text",
      new_scope_id: "selection-9",
      changed_fields: expect.arrayContaining(["scopeType", "scopeId"])
    });
    expect(restored.state.annotations[created.annotation.id]).toMatchObject({
      status: "active",
      memoryPolicy: "auto_by_scope"
    });
  });

  it("initial assistant answer creates active DocumentVersion and timeline records", () => {
    const started = MainConversationRevisionService.createStartedMainSend({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Write",
      model: "gpt-5.5",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-initial-start"
    });
    const completed = MainConversationRevisionService.completeMainSend({
      state: started.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Write",
      answer: "Initial answer",
      model: "gpt-5.5",
      llmCallId: started.llmCallRecord.id,
      contextSnapshotId: started.contextSnapshot.id,
      userMessageId: started.userMessage.id,
      userTimelineNodeId: started.timelineNodes[0].id,
      documentId: "doc-1",
      documentTitle: "Initial",
      documentContent: "Initial answer",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-initial"
    });

    expect(completed.documentVersion).toMatchObject({
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      versionNumber: 1,
      sourceType: "initial_answer",
      sourceId: completed.assistantMessage.id,
      status: "active"
    });
    expect(completed.state.projects["project-1"].activeDocumentVersionId)
      .toBe(completed.documentVersion?.id);
    expect(
      completed.state.mainConversations["conversation-1"].activeDocumentVersionId
    ).toBe(completed.documentVersion?.id);
    expect(Object.values(completed.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "document.version.created",
          objectType: "document_version",
          objectId: completed.documentVersion?.id
        })
      ])
    );
    expect(Object.values(completed.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "document.version.created",
          targetObjectType: "document_version",
          targetObjectId: completed.documentVersion?.id,
          memoryScope: "document",
          memoryEffect: "updates_document_memory"
        })
      ])
    );
  });

  it("manual edit draft previews diff without creating DocumentVersion and confirm creates a new active version", () => {
    const initial = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "Alpha beta gamma",
      title: "Doc",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-manual-initial"
    });
    const draft = DocumentVersionService.createManualEditDraft({
      state: initial.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      baseDocumentVersionId: initial.documentVersion.id,
      draftContent: "Alpha beta gamma",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-manual-draft"
    });
    const updatedDraft = DocumentVersionService.updateManualEditDraft({
      state: draft.state,
      draftId: draft.draft.id,
      content: "Alpha beta gamma delta",
      now: "2026-07-04T00:00:02.000Z"
    });
    const preview = DocumentVersionService.generateDiffForDraft({
      state: updatedDraft.state,
      draftId: draft.draft.id,
      now: "2026-07-04T00:00:03.000Z"
    });
    const contextBeforeConfirm = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase5-draft-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      activeDocumentVersion: initial.documentVersion,
      documentVersions: Object.values(preview.state.documentVersions),
      manualEditDrafts: Object.values(preview.state.manualEditDrafts)
    });

    expect(Object.values(preview.state.documentVersions)).toHaveLength(1);
    expect(preview.diff.summary.addedCharacters).toBeGreaterThan(0);
    expect(Object.values(preview.state.eventLogs).map((event) => event.eventType))
      .toEqual(
        expect.arrayContaining([
          "document.edit_draft.created",
          "document.edit_draft.updated",
          "document.manual_edit.diff_generated"
        ])
      );
    expect(contextBeforeConfirm.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "manual_edit_draft",
          sourceId: draft.draft.id,
          reason: "because draft_not_confirmed"
        })
      ])
    );

    const confirmed = DocumentVersionService.confirmManualEdit({
      state: preview.state,
      draftId: draft.draft.id,
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase5-manual-confirm"
    });

    expect(confirmed.ok).toBe(true);

    if (!confirmed.ok) {
      throw new Error("Expected manual edit confirmation to succeed");
    }

    expect(confirmed.documentVersion).toMatchObject({
      parentDocumentVersionId: initial.documentVersion.id,
      versionNumber: 2,
      sourceType: "manual_edit",
      sourceId: draft.draft.id,
      status: "active"
    });
    expect(confirmed.state.documentVersions[initial.documentVersion.id].status)
      .toBe("superseded");
    expect(
      DocumentVersionService.getActiveDocumentVersion(
        confirmed.state,
        "project-1",
        "conversation-1"
      )?.id
    ).toBe(confirmed.documentVersion.id);
    expect(Object.values(confirmed.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "document.version.created",
          objectId: confirmed.documentVersion.id
        }),
        expect.objectContaining({
          eventType: "document.manual_edited",
          objectId: confirmed.documentVersion.id
        }),
        expect.objectContaining({
          eventType: "document.version.activated",
          objectId: confirmed.documentVersion.id
        })
      ])
    );
    expect(Object.values(confirmed.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "document.manual_edited",
          targetObjectType: "document_version",
          targetObjectId: confirmed.documentVersion.id,
          memoryEffect: "updates_document_memory",
          payload: expect.objectContaining({
            document_version_before_id: initial.documentVersion.id,
            document_version_after_id: confirmed.documentVersion.id,
            source_object_type: "manual_edit_draft",
            source_object_id: draft.draft.id,
            diff_summary: expect.any(Object),
            changed_ranges: expect.any(Array),
            affected_selection_ids: expect.any(Array)
          })
        })
      ])
    );
    expect(Object.values(confirmed.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "sequence",
          targetNodeId: confirmed.timelineNode.id
        })
      ])
    );

    const contextAfterConfirm = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase5-confirmed-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      activeDocumentVersion: confirmed.documentVersion,
      documentVersions: Object.values(confirmed.state.documentVersions),
      manualEditDrafts: Object.values(confirmed.state.manualEditDrafts)
    });

    expect(contextAfterConfirm.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "active_document_version",
          sourceId: confirmed.documentVersion.id,
          reason: expect.stringContaining("because active_document_version")
        })
      ])
    );
    expect(contextAfterConfirm.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "document_version",
          sourceId: initial.documentVersion.id,
          reason: "because inactive_document_version"
        }),
        expect.objectContaining({
          type: "manual_edit_draft",
          sourceId: draft.draft.id,
          reason: "because draft_not_confirmed"
        })
      ])
    );
  });

  it("manual edit confirmation detects conflict when draft base is no longer active", () => {
    const initial = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "One",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-conflict-initial"
    });
    const draft = DocumentVersionService.createManualEditDraft({
      state: initial.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      baseDocumentVersionId: initial.documentVersion.id,
      draftContent: "One edited",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-conflict-draft"
    });
    const newerActive = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: draft.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-2",
      content: "Two",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase5-conflict-new-active"
    });
    const confirmed = DocumentVersionService.confirmManualEdit({
      state: newerActive.state,
      draftId: draft.draft.id,
      now: "2026-07-04T00:00:03.000Z",
      suffix: "phase5-conflict-confirm"
    });

    expect(confirmed.ok).toBe(false);
    expect(confirmed.conflict).toBe(true);

    if (confirmed.ok) {
      throw new Error("Expected manual edit confirmation conflict");
    }

    expect(confirmed.activeDocumentVersionId).toBe(newerActive.documentVersion.id);
  });

  it("manual edit draft cancellation records document.edit_draft.cancelled", () => {
    const initial = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "Cancel draft base",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-cancel-initial"
    });
    const draft = DocumentVersionService.createManualEditDraft({
      state: initial.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      baseDocumentVersionId: initial.documentVersion.id,
      draftContent: "Cancel draft edited",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-cancel-draft"
    });
    const cancelled = DocumentVersionService.cancelManualEditDraft({
      state: draft.state,
      draftId: draft.draft.id,
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase5-cancel"
    });

    expect(cancelled.draft.status).toBe("cancelled");
    expect(Object.values(cancelled.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "document.edit_draft.cancelled",
          objectType: "manual_edit_draft",
          objectId: draft.draft.id
        })
      ])
    );
  });

  it("manual edit marks affected TextSelections as needs_review when changed range overlaps", () => {
    const initial = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "Alpha beta gamma",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-anchor-initial"
    });
    const selection = TextSelectionService.createOrGetSelection({
      state: initial.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "document_version",
      sourceId: initial.documentVersion.id,
      sourceDocumentVersionId: initial.documentVersion.id,
      selectedText: "beta",
      startOffset: 6,
      endOffset: 10,
      textHash: "hash-beta",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-anchor-selection"
    });
    const draft = DocumentVersionService.createManualEditDraft({
      state: selection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      baseDocumentVersionId: initial.documentVersion.id,
      draftContent: "Alpha BETA gamma",
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase5-anchor-draft"
    });
    const confirmed = DocumentVersionService.confirmManualEdit({
      state: draft.state,
      draftId: draft.draft.id,
      now: "2026-07-04T00:00:03.000Z",
      suffix: "phase5-anchor-confirm"
    });

    expect(confirmed.ok).toBe(true);

    if (!confirmed.ok) {
      throw new Error("Expected anchor status update to succeed");
    }

    expect(
      confirmed.state.textSelections[selection.selection.id].anchorStatus
    ).toBe("needs_review");
    expect(Object.values(confirmed.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "selection.anchor_status_changed",
          objectId: selection.selection.id,
          payload: expect.objectContaining({
            old_anchor_status: "active",
            new_anchor_status: "needs_review",
            reason: "selection_range_overlaps_changed_range",
            overlap_with_changed_range: true
          })
        })
      ])
    );
    expect(Object.values(confirmed.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "selection.anchor_status_changed",
          targetObjectType: "text_selection",
          targetObjectId: selection.selection.id,
          memoryScope: "selected_text",
          memoryEffect: "none",
          payload: expect.objectContaining({
            selection_id: selection.selection.id,
            source_object_type: "document_version",
            source_object_id: confirmed.documentVersion.id,
            document_version_before_id: initial.documentVersion.id,
            document_version_after_id: confirmed.documentVersion.id,
            old_anchor_status: "active",
            new_anchor_status: "needs_review",
            reason: "selection_range_overlaps_changed_range",
            overlap_with_changed_range: true
          })
        })
      ])
    );
  });

  it("local context records older source document version warning metadata", () => {
    const initial = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-1",
      content: "Alpha beta gamma",
      now: "2026-07-04T00:00:00.000Z",
      suffix: "phase5-local-version-initial"
    });
    const selection = TextSelectionService.createOrGetSelection({
      state: initial.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "document_version",
      sourceId: initial.documentVersion.id,
      sourceDocumentVersionId: initial.documentVersion.id,
      selectedText: "beta",
      startOffset: 6,
      endOffset: 10,
      textHash: "hash-local-version-beta",
      now: "2026-07-04T00:00:01.000Z",
      suffix: "phase5-local-version-selection"
    });
    const localThread = LocalThreadService.getOrCreateLocalThreadForSelection({
      state: selection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      selectionId: selection.selection.id,
      now: "2026-07-04T00:00:02.000Z",
      suffix: "phase5-local-version-thread"
    });
    const newerActive = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: localThread.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-2",
      content: "Alpha beta gamma delta",
      now: "2026-07-04T00:00:03.000Z",
      suffix: "phase5-local-version-active"
    });
    const started = LocalThreadMessageService.createStartedLocalSend({
      state: newerActive.state,
      projectId: "project-1",
      localThreadId: localThread.localThread.id,
      question: "Does this still hold?",
      model: "gpt-5.5",
      activeDocumentVersion: newerActive.documentVersion,
      documentId: "doc-1",
      now: "2026-07-04T00:00:04.000Z",
      suffix: "phase5-local-version-send"
    });

    expect(started.contextSnapshot.metadata).toMatchObject({
      source_document_version_id: initial.documentVersion.id,
      active_document_version_id: newerActive.documentVersion.id,
      source_version_is_not_active: true
    });
    expect(started.contextSnapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "source_document_version_metadata",
          reason: "because local_thread_source_version_is_not_active"
        })
      ])
    );
  });

  it("creates a diff-ready merge proposal from a LocalSelection without creating a DocumentVersion", () => {
    const fixture = localAnswerState();
    const documentVersion = {
      ...activeDocumentVersion(),
      content: "original main selected text after",
      contentHash: undefined
    };
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      sourceDocumentVersionId: documentVersion.id,
      selectedText: "fragment worth revising",
      startOffset: 26,
      endOffset: 49,
      now: "2026-07-04T01:00:00.000Z",
      suffix: "phase6-local-selection"
    });
    const versionCount = Object.keys(localSelection.state.documentVersions).length;
    const proposal = MergeService.createMergeProposal({
      state: localSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      mergeMode: "replace_selection",
      now: "2026-07-04T01:00:01.000Z",
      suffix: "phase6-merge-proposal"
    });

    expect(Object.keys(proposal.state.documentVersions)).toHaveLength(versionCount);
    expect(proposal.mergeRecord).toMatchObject({
      sourceType: "local_selection",
      sourceLocalSelectionId: localSelection.localSelection.id,
      sourceSelectionId: fixture.mainSelection.id,
      status: "diff_ready",
      conflictStatus: "none"
    });
    expect(proposal.diff).toBeDefined();
    expect(Object.values(proposal.state.eventLogs).map((event) => event.eventType))
      .toEqual(expect.arrayContaining(["merge.proposed", "merge.diff_generated"]));
    expect(Object.values(proposal.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "merge_proposal"
        })
      ])
    );
    expect(Object.values(proposal.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "merge.proposed",
          targetObjectType: "merge_record",
          targetObjectId: proposal.mergeRecord.id,
          payload: expect.objectContaining({
            node_id: expect.any(String),
            project_id: "project-1",
            conversation_id: "conversation-1",
            event_id: expect.any(String),
            event_type: "merge.proposed",
            target_object_type: "merge_record",
            target_object_id: proposal.mergeRecord.id,
            source_object_type: "local_selection",
            source_object_id: localSelection.localSelection.id,
            selection_id: fixture.mainSelection.id,
            local_selection_id: localSelection.localSelection.id,
            local_thread_id: fixture.localThread.id,
            document_version_before_id: documentVersion.id,
            merge_mode: "replace_selection",
            target_selection_id: fixture.mainSelection.id,
            target_range_start: 0,
            target_range_end: 27,
            memory_scope: "merge",
            memory_effect: "none",
            status: "pending",
            conflict_status: "none",
            actor_type: "user",
            actor_id: "user",
            created_at: "2026-07-04T01:00:01.000Z",
            source_type: "local_selection",
            source_text_hash: expect.any(String),
            target_document_version_id: documentVersion.id
          })
        })
      ])
    );
  });

  it("pending merge proposals stay out of main context", () => {
    const fixture = localAnswerState();
    const documentVersion = {
      ...activeDocumentVersion(),
      content: "original main selected text after"
    };
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      sourceDocumentVersionId: documentVersion.id,
      selectedText: "replacement fragment",
      now: "2026-07-04T01:10:00.000Z",
      suffix: "phase6-context-selection"
    });
    const proposal = MergeService.createMergeProposal({
      state: localSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      now: "2026-07-04T01:10:01.000Z",
      suffix: "phase6-context-proposal"
    });
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase6-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      sessionId: "conversation-1",
      activeDocumentVersion: documentVersion,
      documentVersions: Object.values(proposal.state.documentVersions),
      mergeRecords: Object.values(proposal.state.mergeRecords)
    });

    expect(snapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "merge_record",
          sourceId: proposal.mergeRecord.id,
          reason: "because pending_merge_not_confirmed"
        })
      ])
    );
  });

  it("confirming a merge creates an active merge DocumentVersion and updates active ids", () => {
    const fixture = localAnswerState();
    const documentVersion = {
      ...activeDocumentVersion(),
      content: "original main selected text after"
    };
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      sourceDocumentVersionId: documentVersion.id,
      selectedText: "confirmed replacement",
      now: "2026-07-04T01:20:00.000Z",
      suffix: "phase6-confirm-selection"
    });
    const proposal = MergeService.createMergeProposal({
      state: localSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      now: "2026-07-04T01:20:01.000Z",
      suffix: "phase6-confirm-proposal"
    });
    const confirmed = MergeService.confirmMerge({
      state: proposal.state,
      mergeId: proposal.mergeRecord.id,
      now: "2026-07-04T01:20:02.000Z",
      suffix: "phase6-confirm"
    });

    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      throw new Error("Expected merge confirmation to succeed");
    }
    expect(confirmed.documentVersion).toMatchObject({
      parentDocumentVersionId: documentVersion.id,
      sourceType: "merge",
      sourceId: proposal.mergeRecord.id,
      status: "active"
    });
    expect(confirmed.documentVersion.content).toContain("confirmed replacement");
    expect(confirmed.documentVersion.content).not.toContain(
      "Parent local answer has a fragment worth revising."
    );
    expect(confirmed.mergeRecord).toMatchObject({
      status: "confirmed",
      resultDocumentVersionId: confirmed.documentVersion.id
    });
    expect(confirmed.state.projects["project-1"].activeDocumentVersionId)
      .toBe(confirmed.documentVersion.id);
    expect(confirmed.state.mainConversations["conversation-1"].activeDocumentVersionId)
      .toBe(confirmed.documentVersion.id);
    expect(Object.values(confirmed.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeType: "merge_back" }),
        expect.objectContaining({ edgeType: "sequence" })
      ])
    );
    expect(Object.values(confirmed.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "merge.confirmed" }),
        expect.objectContaining({ eventType: "document.version.created" }),
        expect.objectContaining({ eventType: "document.version.activated" })
      ])
    );
    expect(Object.values(confirmed.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "merge.confirmed",
          targetObjectType: "merge_record",
          targetObjectId: proposal.mergeRecord.id,
          payload: expect.objectContaining({
            node_id: expect.any(String),
            project_id: "project-1",
            conversation_id: "conversation-1",
            event_id: expect.any(String),
            event_type: "merge.confirmed",
            target_object_type: "merge_record",
            target_object_id: proposal.mergeRecord.id,
            source_object_type: "local_selection",
            source_object_id: localSelection.localSelection.id,
            selection_id: fixture.mainSelection.id,
            local_selection_id: localSelection.localSelection.id,
            local_thread_id: fixture.localThread.id,
            document_version_before_id: documentVersion.id,
            document_version_after_id: confirmed.documentVersion.id,
            merge_mode: "replace_selection",
            target_selection_id: fixture.mainSelection.id,
            target_range_start: 0,
            target_range_end: 27,
            memory_scope: "document",
            memory_effect: "updates_document_memory",
            status: "active",
            conflict_status: "none",
            actor_type: "user",
            actor_id: "user",
            created_at: "2026-07-04T01:20:02.000Z",
            source_type: "local_selection",
            source_text_hash: expect.any(String),
            target_document_version_id: documentVersion.id,
            result_document_version_id: confirmed.documentVersion.id,
            diff_summary: expect.any(Object),
            changed_ranges: expect.any(Array)
          })
        })
      ])
    );
    const snapshot = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase6-confirmed-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      sessionId: "conversation-1",
      activeDocumentVersion: confirmed.documentVersion,
      documentVersions: Object.values(confirmed.state.documentVersions),
      mergeRecords: Object.values(confirmed.state.mergeRecords)
    });

    expect(snapshot.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: confirmed.documentVersion.id,
          reason: expect.stringContaining(
            "because active_document_version_after_confirmed_merge"
          )
        })
      ])
    );
  });

  it("detects merge conflicts when target selection cannot be resolved", () => {
    const fixture = localAnswerState();
    const oldVersion = {
      ...activeDocumentVersion(),
      id: "doc-version-old",
      status: "superseded" as const,
      content: "original main selected text after"
    };
    const activeVersion = {
      ...activeDocumentVersion(),
      id: "doc-version-active",
      content: "Completely different active text."
    };
    const oldSelection = TextSelectionService.createOrGetSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [oldVersion.id]: oldVersion,
          [activeVersion.id]: activeVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "document_version",
      sourceId: oldVersion.id,
      sourceDocumentVersionId: oldVersion.id,
      selectedText: "original main selected text",
      startOffset: 0,
      endOffset: 27,
      now: "2026-07-04T01:30:00.000Z",
      suffix: "phase6-conflict-old-selection"
    });
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: oldSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: oldSelection.selection.id,
      sourceDocumentVersionId: oldVersion.id,
      selectedText: "replacement text",
      now: "2026-07-04T01:30:01.000Z",
      suffix: "phase6-conflict-local-selection"
    });
    const proposal = MergeService.createMergeProposal({
      state: localSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      now: "2026-07-04T01:30:02.000Z",
      suffix: "phase6-conflict-proposal"
    });

    expect(proposal.mergeRecord).toMatchObject({
      status: "conflict",
      conflictStatus: "needs_manual_target"
    });
    expect(Object.values(proposal.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "merge.conflict_detected"
        })
      ])
    );
  });

  it("manual target range resolves target conflict", () => {
    const fixture = localAnswerState();
    const activeVersion = {
      ...activeDocumentVersion(),
      content: "Completely different active text."
    };
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [activeVersion.id]: activeVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      sourceDocumentVersionId: activeVersion.id,
      selectedText: "manual replacement",
      now: "2026-07-04T01:40:00.000Z",
      suffix: "phase6-manual-target-selection"
    });
    const proposal = MergeService.createMergeProposal({
      state: localSelection.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      manualTargetRange: {
        start: 0,
        end: 10
      },
      now: "2026-07-04T01:40:01.000Z",
      suffix: "phase6-manual-target-proposal"
    });

    expect(proposal.mergeRecord.status).toBe("diff_ready");
    expect(proposal.mergeRecord.targetRangeStart).toBe(0);
    expect(proposal.mergeRecord.targetRangeEnd).toBe(10);
    expect(Object.values(proposal.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "merge.target_changed"
        })
      ])
    );
    expect(Object.values(proposal.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "merge.target_changed",
          payload: expect.objectContaining({
            target_range_start: 0,
            target_range_end: 10,
            memory_scope: "merge",
            memory_effect: "none"
          })
        })
      ])
    );
  });

  it("confirming a RevisionBranch merge marks the branch as merged", () => {
    const fixture = localAnswerState();
    const documentVersion = {
      ...activeDocumentVersion(),
      content: "original main selected text after"
    };
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: {
        ...fixture.state,
        documentVersions: {
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      sourceDocumentVersionId: documentVersion.id,
      selectedText: "branch replacement",
      now: "2026-07-04T01:50:00.000Z",
      suffix: "phase6-branch-local-selection"
    });
    const branch = RevisionBranchService.createBranchFromLocalSelection({
      state: localSelection.state,
      projectId: "project-1",
      localSelectionId: localSelection.localSelection.id,
      baseDocumentVersionId: documentVersion.id,
      now: "2026-07-04T01:50:01.000Z",
      suffix: "phase6-branch"
    });
    const proposal = MergeService.createMergeProposal({
      state: branch.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "revision_branch",
      sourceId: branch.branch.id,
      now: "2026-07-04T01:50:02.000Z",
      suffix: "phase6-branch-proposal"
    });
    const confirmed = MergeService.confirmMerge({
      state: proposal.state,
      mergeId: proposal.mergeRecord.id,
      now: "2026-07-04T01:50:03.000Z",
      suffix: "phase6-branch-confirm"
    });

    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      throw new Error("Expected branch merge confirmation to succeed");
    }
    expect(confirmed.state.revisionBranches[branch.branch.id].status).toBe(
      "merged"
    );
    expect(Object.values(confirmed.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "branch.merged"
        })
      ])
    );
  });

  it("Phase 7 state transitions discard, restore, and tombstone memory with audit records", () => {
    const created = AnnotationService.createAnnotationFromManualNote({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      content: "Remember this scoped note",
      scopeType: "conversation",
      scopeId: "conversation-1",
      now: "2026-07-04T02:00:00.000Z",
      suffix: "phase7-state-note"
    });
    const discarded = ObjectStateService.discardObject({
      state: created.state,
      objectType: "annotation",
      objectId: created.annotation.id,
      reason: "user_does_not_want_this_note_in_context",
      now: "2026-07-04T02:00:01.000Z",
      suffix: "phase7-state-discard"
    });
    const discardedContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase7-discarded-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      sessionId: "conversation-1",
      annotations: Object.values(discarded.state.annotations)
    });

    expect(discarded.state.annotations[created.annotation.id]).toMatchObject({
      status: "discarded",
      memoryPolicy: "excluded_by_default",
      includeInContext: false
    });
    expect(Object.values(discarded.state.objectStateTransitions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectType: "annotation",
          objectId: created.annotation.id,
          fromStatus: "active",
          toStatus: "discarded"
        })
      ])
    );
    expect(Object.values(discarded.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "annotation.discarded",
          objectType: "annotation",
          objectId: created.annotation.id
        })
      ])
    );
    expect(discardedContext.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: created.annotation.id,
          reason: expect.stringContaining("because discarded_excluded_by_default")
        })
      ])
    );

    const restored = ObjectStateService.restoreObject({
      state: discarded.state,
      objectType: "annotation",
      objectId: created.annotation.id,
      reason: "user_restored_note",
      now: "2026-07-04T02:00:02.000Z",
      suffix: "phase7-state-restore"
    });
    const restoredContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase7-restored-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      sessionId: "conversation-1",
      annotations: Object.values(restored.state.annotations)
    });

    expect(restored.state.annotations[created.annotation.id]).toMatchObject({
      status: "active",
      includeInContext: true
    });
    expect(restoredContext.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "included_note",
          sourceId: created.annotation.id
        })
      ])
    );

    const deleted = ObjectStateService.deleteObject({
      state: restored.state,
      objectType: "annotation",
      objectId: created.annotation.id,
      reason: "user_confirmed_delete",
      confirmed: true,
      now: "2026-07-04T02:00:03.000Z",
      suffix: "phase7-state-delete"
    });
    const deletedContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase7-deleted-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      sessionId: "conversation-1",
      annotations: Object.values(deleted.state.annotations)
    });

    expect(deleted.state.annotations[created.annotation.id]).toMatchObject({
      status: "deleted",
      memoryPolicy: "never_include",
      includeInContext: false
    });
    expect(deletedContext.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: created.annotation.id,
          text: "",
          reason: expect.stringContaining("because deleted_memory_never_included")
        })
      ])
    );
    expect(() =>
      ObjectStateService.restoreObject({
        state: deleted.state,
        objectType: "annotation",
        objectId: created.annotation.id,
        reason: "normal_restore_should_fail",
        now: "2026-07-04T02:00:04.000Z",
        suffix: "phase7-state-restore-deleted"
      })
    ).toThrow("Deleted objects cannot be restored");
  });

  it("Phase 7 local context and object-specific lifecycle events follow state rules", () => {
    const fixture = localAnswerState();
    const note = AnnotationService.createAnnotationFromManualNote({
      state: fixture.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      content: "Local scoped note that should be discarded",
      scopeType: "selected_text",
      scopeId: fixture.mainSelection.id,
      now: "2026-07-04T02:05:00.000Z",
      suffix: "phase7-local-note"
    });
    const discardedNote = ObjectStateService.discardObject({
      state: note.state,
      objectType: "annotation",
      objectId: note.annotation.id,
      reason: "discard_local_note",
      now: "2026-07-04T02:05:01.000Z",
      suffix: "phase7-local-note-discard"
    });
    const localStarted = LocalThreadMessageService.createStartedLocalSend({
      state: discardedNote.state,
      projectId: "project-1",
      localThreadId: fixture.localThread.id,
      question: "Use current local context",
      model: "gpt-5.5",
      activeDocumentVersion: activeDocumentVersion(),
      documentId: "doc-1",
      now: "2026-07-04T02:05:02.000Z",
      suffix: "phase7-local-context-after-discard"
    });

    expect(localStarted.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: note.annotation.id,
          reason: expect.stringContaining("because discarded_excluded_by_default")
        })
      ])
    );

    const discardedThread = ObjectStateService.discardObject({
      state: fixture.state,
      objectType: "local_thread",
      objectId: fixture.localThread.id,
      reason: "discard_thread",
      now: "2026-07-04T02:05:03.000Z",
      suffix: "phase7-local-thread-discard"
    });
    const restoredThread = ObjectStateService.restoreObject({
      state: discardedThread.state,
      objectType: "local_thread",
      objectId: fixture.localThread.id,
      reason: "restore_thread",
      now: "2026-07-04T02:05:04.000Z",
      suffix: "phase7-local-thread-restore"
    });
    const discardedAgain = ObjectStateService.discardObject({
      state: restoredThread.state,
      objectType: "local_thread",
      objectId: fixture.localThread.id,
      reason: "discard_thread_again",
      now: "2026-07-04T02:05:05.000Z",
      suffix: "phase7-local-thread-discard-again"
    });
    const deletedParent = ObjectStateService.deleteObject({
      state: discardedAgain.state,
      objectType: "text_selection",
      objectId: fixture.mainSelection.id,
      reason: "delete_parent_selection",
      confirmed: true,
      now: "2026-07-04T02:05:06.000Z",
      suffix: "phase7-parent-selection-delete"
    });

    expect(Object.values(restoredThread.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "local_thread.discarded" }),
        expect.objectContaining({ eventType: "local_thread.restored" })
      ])
    );
    expect(() =>
      ObjectStateService.restoreObject({
        state: deletedParent.state,
        objectType: "local_thread",
        objectId: fixture.localThread.id,
        reason: "restore_should_fail_parent_deleted",
        now: "2026-07-04T02:05:07.000Z",
        suffix: "phase7-local-thread-restore-parent-deleted"
      })
    ).toThrow("parent selection is deleted");

    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: fixture.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      selectedText: "branch candidate",
      now: "2026-07-04T02:05:08.000Z",
      suffix: "phase7-branch-local-selection"
    });
    const branch = RevisionBranchService.createBranchFromLocalSelection({
      state: localSelection.state,
      projectId: "project-1",
      localSelectionId: localSelection.localSelection.id,
      now: "2026-07-04T02:05:09.000Z",
      suffix: "phase7-branch"
    });
    const branchDiscarded = ObjectStateService.discardObject({
      state: branch.state,
      objectType: "revision_branch",
      objectId: branch.branch.id,
      reason: "discard_branch",
      now: "2026-07-04T02:05:10.000Z",
      suffix: "phase7-branch-discard"
    });
    const branchRestored = ObjectStateService.restoreObject({
      state: branchDiscarded.state,
      objectType: "revision_branch",
      objectId: branch.branch.id,
      reason: "restore_branch",
      now: "2026-07-04T02:05:11.000Z",
      suffix: "phase7-branch-restore"
    });
    const branchDeleted = ObjectStateService.deleteObject({
      state: branchRestored.state,
      objectType: "revision_branch",
      objectId: branch.branch.id,
      reason: "delete_branch",
      confirmed: true,
      now: "2026-07-04T02:05:12.000Z",
      suffix: "phase7-branch-delete"
    });

    expect(Object.values(branchDeleted.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "branch.discarded" }),
        expect.objectContaining({ eventType: "branch.restored" }),
        expect.objectContaining({ eventType: "branch.deleted" })
      ])
    );

    const messageDiscarded = ObjectStateService.discardObject({
      state: fixture.state,
      objectType: "message",
      objectId: fixture.localAssistantMessage.id,
      reason: "discard_message",
      now: "2026-07-04T02:05:13.000Z",
      suffix: "phase7-message-discard"
    });
    const messageRestored = ObjectStateService.restoreObject({
      state: messageDiscarded.state,
      objectType: "message",
      objectId: fixture.localAssistantMessage.id,
      reason: "restore_message",
      now: "2026-07-04T02:05:14.000Z",
      suffix: "phase7-message-restore"
    });
    const messageDeleted = ObjectStateService.deleteObject({
      state: messageRestored.state,
      objectType: "message",
      objectId: fixture.localAssistantMessage.id,
      reason: "delete_message",
      confirmed: true,
      now: "2026-07-04T02:05:15.000Z",
      suffix: "phase7-message-delete"
    });

    expect(Object.values(messageDeleted.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "message.discarded" }),
        expect.objectContaining({ eventType: "message.restored" }),
        expect.objectContaining({ eventType: "message.deleted" })
      ])
    );

    const documentVersion = {
      ...activeDocumentVersion(),
      content: "original main selected text after"
    };
    const mergeProposal = MergeService.createMergeProposal({
      state: {
        ...localSelection.state,
        documentVersions: {
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceType: "local_selection",
      sourceId: localSelection.localSelection.id,
      now: "2026-07-04T02:05:16.000Z",
      suffix: "phase7-merge-proposal"
    });
    const mergeDiscarded = ObjectStateService.discardObject({
      state: mergeProposal.state,
      objectType: "merge_record",
      objectId: mergeProposal.mergeRecord.id,
      reason: "discard_merge",
      now: "2026-07-04T02:05:17.000Z",
      suffix: "phase7-merge-discard"
    });
    const mergeRestored = ObjectStateService.restoreObject({
      state: mergeDiscarded.state,
      objectType: "merge_record",
      objectId: mergeProposal.mergeRecord.id,
      reason: "restore_merge",
      now: "2026-07-04T02:05:18.000Z",
      suffix: "phase7-merge-restore"
    });

    expect(mergeRestored.state.mergeRecords[mergeProposal.mergeRecord.id].status)
      .toBe("pending");
    expect(Object.values(mergeRestored.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "merge.discarded" }),
        expect.objectContaining({ eventType: "merge.restored" })
      ])
    );
  });

  it("Phase 7 revert previews without mutation, changes active path, and future sends continue from target", () => {
    const firstStarted = MainConversationRevisionService.createStartedMainSend({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      projectName: "Project",
      conversationId: "conversation-1",
      conversationTitle: "Conversation",
      prompt: "Generate v1",
      model: "gpt-5.5",
      documentId: "doc-1",
      now: "2026-07-04T02:10:00.000Z",
      suffix: "phase7-revert-first"
    });
    const firstCompleted = MainConversationRevisionService.completeMainSend({
      state: firstStarted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Generate v1",
      answer: "Assistant answer v1",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: firstStarted.llmCallRecord.id,
      contextSnapshotId: firstStarted.contextSnapshot.id,
      userMessageId: firstStarted.userMessage.id,
      userTimelineNodeId: firstStarted.timelineNodes[0].id,
      documentId: "doc-1",
      documentContent: "Document version one.",
      now: "2026-07-04T02:10:01.000Z",
      suffix: "phase7-revert-first"
    });
    const firstDocumentNodeId =
      firstCompleted.documentVersion?.createdFromTimelineNodeId;

    if (!firstDocumentNodeId) {
      throw new Error("Expected first document timeline node");
    }

    const secondStarted = MainConversationRevisionService.createStartedMainSend({
      state: firstCompleted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Generate v2",
      model: "gpt-5.5",
      documentId: "doc-1",
      activeDocumentVersion: firstCompleted.documentVersion,
      recentMessages: Object.values(firstCompleted.state.revisionMessages),
      now: "2026-07-04T02:10:02.000Z",
      suffix: "phase7-revert-second"
    });
    const secondCompleted = MainConversationRevisionService.completeMainSend({
      state: secondStarted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Generate v2",
      answer: "Assistant answer v2",
      model: "gpt-5.5",
      provider: "mock",
      llmCallId: secondStarted.llmCallRecord.id,
      contextSnapshotId: secondStarted.contextSnapshot.id,
      userMessageId: secondStarted.userMessage.id,
      userTimelineNodeId: secondStarted.timelineNodes[0].id,
      documentId: "doc-1",
      documentContent: "Document version two.",
      now: "2026-07-04T02:10:03.000Z",
      suffix: "phase7-revert-second"
    });
    const stateBeforePreview = JSON.stringify(secondCompleted.state);
    const preview = RevertService.previewRevert({
      state: secondCompleted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      targetNodeId: firstDocumentNodeId,
      now: "2026-07-04T02:10:04.000Z",
      suffix: "phase7-revert-preview"
    });

    expect(JSON.stringify(secondCompleted.state)).toBe(stateBeforePreview);
    expect(preview.newActiveDocumentVersionId).toBe(
      firstCompleted.documentVersion?.id
    );
    expect(preview.inactiveNodeIds).toEqual(
      expect.arrayContaining([
        secondStarted.timelineNodes[0].id,
        secondCompleted.timelineNodes[0].id,
        secondCompleted.documentVersion?.createdFromTimelineNodeId
      ])
    );
    const recordedPreview = RevertService.recordRevertPreview({
      state: secondCompleted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      targetNodeId: firstDocumentNodeId,
      now: "2026-07-04T02:10:04.500Z",
      suffix: "phase7-revert-preview-record"
    });

    expect(Object.values(recordedPreview.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "timeline.revert_previewed",
          objectType: "timeline_node",
          objectId: firstDocumentNodeId
        })
      ])
    );

    const reverted = RevertService.confirmRevert({
      state: secondCompleted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      targetNodeId: firstDocumentNodeId,
      now: "2026-07-04T02:10:05.000Z",
      suffix: "phase7-revert-confirm"
    });

    expect(reverted.revertRecord).toMatchObject({
      toNodeId: firstDocumentNodeId,
      newActiveDocumentVersionId: firstCompleted.documentVersion?.id,
      status: "completed"
    });
    expect(
      reverted.state.mainConversations["conversation-1"].activeTimelineNodeId
    ).toBe(firstDocumentNodeId);
    expect(
      reverted.state.mainConversations["conversation-1"].activeDocumentVersionId
    ).toBe(firstCompleted.documentVersion?.id);
    expect(reverted.preview.inactiveNodeIds.every(
      (nodeId) => reverted.state.timelineNodes[nodeId].status === "inactive"
    )).toBe(true);
    expect(Object.values(reverted.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "timeline.reverted" }),
        expect.objectContaining({ eventType: "timeline.active_path_changed" }),
        expect.objectContaining({
          eventType: "timeline.continuation_path_created"
        })
      ])
    );
    expect(Object.values(reverted.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "revert",
          sourceNodeId: secondCompleted.documentVersion?.createdFromTimelineNodeId,
          targetNodeId: firstDocumentNodeId
        })
      ])
    );

    const followupStarted = MainConversationRevisionService.createStartedMainSend({
      state: reverted.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      prompt: "Continue after revert",
      model: "gpt-5.5",
      documentId: "doc-1",
      activeDocumentVersion: firstCompleted.documentVersion,
      recentMessages: Object.values(reverted.state.revisionMessages),
      now: "2026-07-04T02:10:06.000Z",
      suffix: "phase7-revert-followup"
    });

    expect(followupStarted.timelineEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "continuation",
          sourceNodeId: firstDocumentNodeId,
          targetNodeId: followupStarted.timelineNodes[0].id
        })
      ])
    );
    expect(followupStarted.contextSnapshot.includedItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: secondStarted.userMessage.id })
      ])
    );
    expect(followupStarted.contextSnapshot.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: secondStarted.timelineNodes[0].id,
          reason: "because inactive_path_excluded"
        })
      ])
    );
  });

  it("Phase 8 creates a persisted comparison graph and run from two document versions", () => {
    const first = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-1",
      content: "AI can draft lessons quickly with teacher review.",
      now: "2026-07-04T03:00:00.000Z",
      suffix: "phase8-doc-v1"
    });
    const second = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: first.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-2",
      content: "AI can draft lessons quickly, but teachers should verify quality and bias.",
      now: "2026-07-04T03:00:01.000Z",
      suffix: "phase8-doc-v2"
    });
    const versionCountBefore = Object.keys(second.state.documentVersions).length;
    const comparison = ComparisonService.createComparison({
      state: second.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      title: "Document version comparison",
      scopeType: "document",
      scopeId: "doc-1",
      sources: [
        {
          objectType: "document_version",
          objectId: first.documentVersion.id
        },
        {
          objectType: "document_version",
          objectId: second.documentVersion.id
        }
      ],
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-04T03:00:02.000Z",
      suffix: "phase8-doc-comparison"
    });

    expect(Object.keys(comparison.state.documentVersions)).toHaveLength(
      versionCountBefore
    );
    expect(comparison.comparison).toMatchObject({
      status: "active",
      activeRunId: comparison.run.id,
      sourceObjectTypes: ["document_version", "document_version"],
      sourceObjectIds: [
        first.documentVersion.id,
        second.documentVersion.id
      ]
    });
    expect(comparison.run).toMatchObject({
      comparisonId: comparison.comparison.id,
      runNumber: 1,
      model: "gpt-5.5",
      status: "active",
      llmCallId: expect.any(String),
      contextSnapshotId: expect.any(String)
    });
    expect(comparison.run.graphData).toEqual(
      expect.objectContaining({
        nodes: expect.any(Array),
        edges: expect.any(Array)
      })
    );
    expect(comparison.state.llmCallRecords[comparison.run.llmCallId]).toMatchObject({
      model: "gpt-5.5",
      status: "completed",
      comparisonId: comparison.comparison.id,
      outputObjectId: comparison.run.id
    });
    expect(comparison.state.contextSnapshots[comparison.run.contextSnapshotId])
      .toMatchObject({
        callType: "comparison_generation",
        comparisonId: comparison.comparison.id
      });
    expect(Object.values(comparison.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "comparison.created" }),
        expect.objectContaining({ eventType: "comparison.run.created" }),
        expect.objectContaining({ eventType: "comparison.generated" }),
        expect.objectContaining({ eventType: "llm.call.started" }),
        expect.objectContaining({ eventType: "llm.call.completed" })
      ])
    );
    expect(Object.values(comparison.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeType: "comparison_attach" }),
        expect.objectContaining({ edgeType: "comparison_run" })
      ])
    );
    expect(Object.values(comparison.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "comparison.created",
          targetObjectType: "comparison_graph",
          targetObjectId: comparison.comparison.id,
          memoryScope: "comparison",
          memoryEffect: "none",
          status: "active",
          payload: expect.objectContaining({
            node_id: expect.any(String),
            project_id: "project-1",
            conversation_id: "conversation-1",
            event_type: "comparison.created",
            target_object_type: "comparison_graph",
            target_object_id: comparison.comparison.id,
            comparison_id: comparison.comparison.id,
            source_object_types: ["document_version", "document_version"],
            source_object_ids: [
              first.documentVersion.id,
              second.documentVersion.id
            ],
            source_hashes: expect.any(Object),
            graph_node_count: 0,
            graph_edge_count: 0
          })
        }),
        expect.objectContaining({
          eventType: "comparison.generated",
          targetObjectType: "comparison_run",
          targetObjectId: comparison.run.id,
          memoryScope: "comparison",
          memoryEffect: "none",
          status: "active",
          payload: expect.objectContaining({
            node_id: expect.any(String),
            project_id: "project-1",
            event_type: "comparison.generated",
            target_object_type: "comparison_run",
            target_object_id: comparison.run.id,
            source_object_type: "comparison_graph",
            source_object_id: comparison.comparison.id,
            comparison_id: comparison.comparison.id,
            comparison_run_id: comparison.run.id,
            llm_call_id: comparison.run.llmCallId,
            context_snapshot_id: comparison.run.contextSnapshotId,
            model: "gpt-5.5",
            source_hashes: expect.any(Object),
            graph_node_count: expect.any(Number),
            graph_edge_count: expect.any(Number),
            summary_hash: expect.any(String)
          })
        })
      ])
    );
  });

  it("Phase 8 supports document-branch and text-local-selection comparison sources", () => {
    const fixture = localAnswerState();
    const localSelection = LocalSelectionService.createOrGetLocalSelection({
      state: fixture.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      sourceLocalThreadId: fixture.localThread.id,
      sourceMessageId: fixture.localAssistantMessage.id,
      sourceAnswerId: fixture.localAssistantMessage.id,
      parentSelectionId: fixture.mainSelection.id,
      selectedText: "local revised fragment",
      now: "2026-07-04T03:05:00.000Z",
      suffix: "phase8-source-local-selection"
    });
    const branch = RevisionBranchService.createBranchFromLocalSelection({
      state: localSelection.state,
      projectId: "project-1",
      localSelectionId: localSelection.localSelection.id,
      now: "2026-07-04T03:05:01.000Z",
      suffix: "phase8-source-branch"
    });
    const documentVersion = activeDocumentVersion();
    const docBranchComparison = ComparisonService.createComparison({
      state: {
        ...branch.state,
        documentVersions: {
          ...branch.state.documentVersions,
          [documentVersion.id]: documentVersion
        }
      },
      projectId: "project-1",
      conversationId: "conversation-1",
      title: "Document to branch",
      sources: [
        { objectType: "document_version", objectId: documentVersion.id },
        { objectType: "revision_branch", objectId: branch.branch.id }
      ],
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-04T03:05:02.000Z",
      suffix: "phase8-doc-branch"
    });
    const textLocalComparison = ComparisonService.createComparison({
      state: docBranchComparison.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      title: "Selection to local selection",
      scopeType: "selected_text",
      scopeId: fixture.mainSelection.id,
      sources: [
        { objectType: "text_selection", objectId: fixture.mainSelection.id },
        {
          objectType: "local_selection",
          objectId: localSelection.localSelection.id
        }
      ],
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-04T03:05:03.000Z",
      suffix: "phase8-text-local"
    });

    expect(docBranchComparison.comparison.sourceObjectTypes).toEqual([
      "document_version",
      "revision_branch"
    ]);
    expect(textLocalComparison.comparison.sourceObjectTypes).toEqual([
      "text_selection",
      "local_selection"
    ]);
    expect(
      ComparisonService.getComparisonsForObject(
        textLocalComparison.state,
        "text_selection",
        fixture.mainSelection.id
      ).map((comparison) => comparison.id)
    ).toContain(textLocalComparison.comparison.id);
    expect(
      ComparisonService.getComparisonsByScope(
        textLocalComparison.state,
        "selected_text",
        fixture.mainSelection.id
      ).map((comparison) => comparison.id)
    ).toContain(textLocalComparison.comparison.id);
  });

  it("Phase 8 regenerate preserves old runs, clear preserves records, and context excludes by state", () => {
    const first = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-1",
      content: "Original claim about AI tutoring.",
      now: "2026-07-04T03:10:00.000Z",
      suffix: "phase8-regen-doc-v1"
    });
    const second = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: first.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-2",
      content: "Revised claim about AI tutoring with safeguards.",
      now: "2026-07-04T03:10:01.000Z",
      suffix: "phase8-regen-doc-v2"
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
      now: "2026-07-04T03:10:02.000Z",
      suffix: "phase8-regen-create"
    });
    const regenerated = ComparisonService.regenerateComparison({
      state: created.state,
      comparisonId: created.comparison.id,
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-04T03:10:03.000Z",
      suffix: "phase8-regen"
    });

    expect(Object.values(regenerated.state.comparisonRuns)).toHaveLength(2);
    expect(regenerated.state.comparisonRuns[created.run.id].status).toBe(
      "superseded"
    );
    expect(regenerated.comparison.activeRunId).toBe(regenerated.run.id);
    expect(Object.values(regenerated.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeType: "supersede" })
      ])
    );
    expect(Object.values(regenerated.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "comparison.regenerated",
          targetObjectType: "comparison_run",
          targetObjectId: regenerated.run.id,
          payload: expect.objectContaining({
            previous_run_id: created.run.id,
            new_run_id: regenerated.run.id,
            graph_node_count: expect.any(Number),
            graph_edge_count: expect.any(Number),
            summary_hash: expect.any(String)
          })
        })
      ])
    );

    const mainContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase8-main-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      comparisonGraphs: Object.values(regenerated.state.comparisonGraphs),
      comparisonRuns: Object.values(regenerated.state.comparisonRuns)
    });

    expect(mainContext.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "excluded_comparison",
          sourceId: regenerated.comparison.id,
          reason: expect.stringContaining("comparison_not_active_or_pinned")
        })
      ])
    );

    const panelContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase8-panel-context",
      projectId: "project-1",
      callType: "comparison_chat",
      purpose: "comparison_chat",
      model: "gpt-5.5",
      comparisonId: regenerated.comparison.id,
      activeComparisonId: regenerated.comparison.id,
      activeComparisonRunId: regenerated.run.id,
      comparisonGraphs: Object.values(regenerated.state.comparisonGraphs),
      comparisonRuns: Object.values(regenerated.state.comparisonRuns)
    });

    expect(panelContext.includedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "included_comparison",
          sourceId: regenerated.comparison.id,
          reason: "active_comparison_panel_context"
        }),
        expect.objectContaining({
          type: "comparison_source_object",
          reason: "active_comparison_panel_context"
        }),
        expect.objectContaining({
          type: "comparison_graph_data",
          sourceId: regenerated.run.id,
          reason: "active_comparison_panel_context"
        })
      ])
    );

    const cleared = ComparisonService.clearComparison({
      state: regenerated.state,
      comparisonId: regenerated.comparison.id,
      now: "2026-07-04T03:10:04.000Z",
      suffix: "phase8-clear"
    });
    const clearedContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase8-cleared-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      comparisonGraphs: Object.values(cleared.state.comparisonGraphs),
      comparisonRuns: Object.values(cleared.state.comparisonRuns)
    });

    expect(cleared.comparison.status).toBe("cleared");
    expect(cleared.state.comparisonRuns[created.run.id]).toBeDefined();
    expect(clearedContext.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: regenerated.comparison.id,
          reason: "cleared_comparison_excluded"
        })
      ])
    );

    const discarded = ComparisonService.discardComparison({
      state: regenerated.state,
      comparisonId: regenerated.comparison.id,
      now: "2026-07-04T03:10:05.000Z",
      suffix: "phase8-discard"
    });
    expect(discarded.state.comparisonGraphs[regenerated.comparison.id].status)
      .toBe("discarded");
    expect(Object.values(discarded.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "comparison.discarded" })
      ])
    );

    const deleted = ComparisonService.deleteComparison({
      state: regenerated.state,
      comparisonId: regenerated.comparison.id,
      confirmed: true,
      now: "2026-07-04T03:10:06.000Z",
      suffix: "phase8-delete"
    });
    const deletedContext = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase8-deleted-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      comparisonGraphs: Object.values(deleted.state.comparisonGraphs),
      comparisonRuns: Object.values(deleted.state.comparisonRuns)
    });

    expect(deleted.state.comparisonGraphs[regenerated.comparison.id]).toMatchObject({
      status: "deleted",
      summary: undefined,
      graphNodes: [],
      graphEdges: []
    });
    expect(Object.values(deleted.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "comparison.deleted",
          targetObjectType: "comparison_graph",
          targetObjectId: regenerated.comparison.id,
          status: "deleted"
        })
      ])
    );
    expect(deletedContext.excludedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: regenerated.comparison.id,
          text: "",
          reason: "deleted_memory_never_included"
        })
      ])
    );
  });

  it("Phase 8 exports comparison maps and keeps summaries as scoped notes", () => {
    const first = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: createEmptyRevisionState(),
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-1",
      content: "First answer emphasizes speed.",
      now: "2026-07-04T03:20:00.000Z",
      suffix: "phase8-export-doc-v1"
    });
    const second = DocumentVersionService.createInitialDocumentVersionFromAnswer({
      state: first.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      documentId: "doc-1",
      messageId: "assistant-doc-2",
      content: "Second answer emphasizes speed and verification.",
      now: "2026-07-04T03:20:01.000Z",
      suffix: "phase8-export-doc-v2"
    });
    const created = ComparisonService.createComparison({
      state: second.state,
      projectId: "project-1",
      conversationId: "conversation-1",
      title: "Exportable comparison",
      scopeType: "document",
      scopeId: "doc-1",
      sources: [
        { objectType: "document_version", objectId: first.documentVersion.id },
        { objectType: "document_version", objectId: second.documentVersion.id }
      ],
      model: "gpt-5.5",
      modelProvider: "mock",
      now: "2026-07-04T03:20:02.000Z",
      suffix: "phase8-export-create"
    });
    const exported = ComparisonService.exportComparison({
      state: created.state,
      comparisonId: created.comparison.id,
      exportType: "markdown",
      now: "2026-07-04T03:20:03.000Z",
      suffix: "phase8-export"
    });
    const noted = ComparisonService.keepSummaryAsNote({
      state: exported.state,
      comparisonRunId: created.run.id,
      now: "2026-07-04T03:20:04.000Z",
      suffix: "phase8-note"
    });

    expect(exported.export).toMatchObject({
      comparisonId: created.comparison.id,
      comparisonRunId: created.run.id,
      exportType: "markdown",
      status: "active"
    });
    expect(exported.export.fileMetadata?.content).toContain(
      "Exportable comparison"
    );
    expect(noted.annotation).toMatchObject({
      sourceType: "comparison_summary",
      sourceId: created.run.id,
      scopeType: "document",
      scopeId: "doc-1"
    });
    expect(Object.values(noted.state.eventLogs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "comparison.exported" }),
        expect.objectContaining({ eventType: "comparison.summary_kept_as_note" })
      ])
    );
    expect(Object.values(noted.state.timelineEdges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeType: "export" }),
        expect.objectContaining({ edgeType: "annotation_attach" })
      ])
    );
    expect(Object.values(noted.state.timelineNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "comparison.exported",
          targetObjectType: "comparison_export",
          targetObjectId: exported.export.id,
          memoryScope: "comparison",
          memoryEffect: "none",
          payload: expect.objectContaining({
            comparison_id: created.comparison.id,
            comparison_run_id: created.run.id,
            export_type: "markdown",
            source_object_type: "comparison_run",
            source_object_id: created.run.id,
            graph_node_count: expect.any(Number),
            graph_edge_count: expect.any(Number),
            summary_hash: expect.any(String)
          })
        })
      ])
    );
    const contextAfterExport = ContextSnapshotService.buildContextSnapshot({
      llmCallId: "llm-call-phase8-export-context",
      projectId: "project-1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      comparisonGraphs: Object.values(noted.state.comparisonGraphs),
      comparisonRuns: Object.values(noted.state.comparisonRuns)
    });

    expect([
      ...contextAfterExport.includedItems,
      ...contextAfterExport.excludedItems
    ].map((item) => item.sourceId)).not.toContain(exported.export.id);
  });
});
