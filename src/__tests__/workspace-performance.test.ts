import { describe, expect, it } from "vitest";
import { ComparisonGraphQueryService } from "@/services/revision/ComparisonGraphQueryService";
import { ContextSnapshotService } from "@/services/revision/ContextSnapshotService";
import { DocumentChunkService } from "@/services/revision/DocumentChunkService";
import { hashContent } from "@/services/revision/DiffService";
import { LocalThreadQueryService } from "@/services/revision/LocalThreadQueryService";
import { ObjectStateService } from "@/services/revision/ObjectStateService";
import { ThreadSummaryService } from "@/services/revision/ThreadSummaryService";
import { TimelineService } from "@/services/revision/TimelineService";
import { WorkspaceProjectionService } from "@/services/revision/WorkspaceProjectionService";
import { createEmptyRevisionState } from "@/services/revision/emptyRevisionState";
import { revisionRepository } from "@/services/revision/revisionRepository";
import type {
  AnnotationModel,
  ComparisonGraphModel,
  ComparisonRunModel,
  DocumentVersionModel,
  LocalThreadModel,
  MessageModel,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";

function baseState() {
  const state = createEmptyRevisionState();
  const now = "2026-07-05T03:00:00.000Z";

  return {
    ...state,
    projects: {
      project1: {
        id: "project1",
        name: "Project",
        status: "active",
        activeConversationId: "conv1",
        createdAt: now,
        updatedAt: now
      }
    },
    mainConversations: {
      conv1: {
        id: "conv1",
        projectId: "project1",
        title: "Conversation",
        status: "active",
        activeTimelinePathId: "path1",
        activeTimelineNodeId: "node-9999",
        activeDocumentVersionId: "doc-v1",
        createdAt: now,
        updatedAt: now
      }
    },
    timelinePaths: {
      path1: {
        id: "path1",
        projectId: "project1",
        conversationId: "conv1",
        rootNodeId: "node-0",
        headNodeId: "node-9999",
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    }
  } satisfies RevisionRepositoryState;
}

function withTimelineNodes(count: number) {
  const state = baseState();
  const timelineNodes: Record<string, RevisionTimelineNode> = {};
  const timelineEdges: Record<string, RevisionTimelineEdge> = {};

  for (let index = 0; index < count; index += 1) {
    const id = `node-${index}`;
    timelineNodes[id] = {
      id,
      projectId: "project1",
      conversationId: "conv1",
      parentNodeId: index > 0 ? `node-${index - 1}` : undefined,
      eventId: `event-${index}`,
      eventType: index % 2 === 0 ? "message.user.created" : "message.assistant.created",
      targetObjectType: "message",
      targetObjectId: `msg-${index}`,
      label: `Message ${index}`,
      actor: index % 2 === 0 ? "user" : "assistant",
      memoryScope: "conversation",
      memoryEffect: "included",
      status: "active",
      activePathId: "path1",
      timestamp: new Date(Date.UTC(2026, 6, 5, 3, 0, index)).toISOString()
    };

    if (index > 0) {
      timelineEdges[`edge-${index - 1}-${index}`] = {
        id: `edge-${index - 1}-${index}`,
        projectId: "project1",
        sourceNodeId: `node-${index - 1}`,
        targetNodeId: id,
        edgeType: "sequence",
        status: "active",
        timestamp: timelineNodes[id].timestamp
      };
    }
  }

  return {
    ...state,
    timelineNodes,
    timelineEdges
  };
}

describe("Phase 11 performance foundation", () => {
  it("builds timeline projections and returns windowed timeline results for large graphs", () => {
    const state = WorkspaceProjectionService.rebuildTimelineNodeProjections({
      state: withTimelineNodes(10000),
      projectId: "project1",
      conversationId: "conv1",
      now: "2026-07-05T03:10:00.000Z"
    });
    const overview = TimelineService.getActivePathOverview(
      state,
      "project1",
      "conv1"
    );
    const snapshotResult = TimelineService.createActivePathOverviewSnapshot({
      state,
      projectId: "project1",
      conversationId: "conv1",
      now: "2026-07-05T03:10:30.000Z"
    });
    const window = TimelineService.getTimelineWindow({
      state,
      projectId: "project1",
      conversationId: "conv1",
      anchorNodeId: "node-5000",
      direction: "around",
      limit: 50
    });
    const subgraph = TimelineService.getObjectSubgraph(
      state,
      "message",
      "msg-5000",
      {
        depth: 2,
        limit: 20
      }
    );

    expect(overview.nodeCount).toBe(10000);
    expect(overview.nodes.length).toBeLessThanOrEqual(10);
    expect(snapshotResult.snapshot.snapshotType).toBe("active_path_overview");
    expect(
      Object.values(snapshotResult.state.eventLogs).some(
        (event) => event.eventType === "timeline.snapshot.created"
      )
    ).toBe(true);
    expect(window.nodes).toHaveLength(50);
    expect(window.hasMoreBefore).toBe(true);
    expect(window.hasMoreAfter).toBe(true);
    expect(subgraph.nodes.length).toBeLessThanOrEqual(5);
  });

  it("opens a project with overview metadata and an initial timeline window only", () => {
    const state = withTimelineNodes(200);
    const content = "Current document content that should not be returned in open metadata.";
    revisionRepository.replaceState({
      ...state,
      documentVersions: {
        "doc-v1": {
          id: "doc-v1",
          projectId: "project1",
          conversationId: "conv1",
          documentId: "doc1",
          versionNumber: 1,
          content,
          contentHash: hashContent(content),
          sourceType: "initial_answer",
          sourceId: "msg-1",
          status: "active",
          createdAt: "2026-07-05T03:00:00.000Z"
        }
      }
    });

    const payload = revisionRepository.openProjectWorkspace({
      projectId: "project1",
      conversationId: "conv1",
      timelineLimit: 50
    });

    expect(payload.activePathOverview.nodeCount).toBe(200);
    expect(payload.activePathOverview.nodes.length).toBeLessThanOrEqual(10);
    expect(payload.initialTimelineWindow.nodes).toHaveLength(50);
    expect(payload.currentDocumentVersion?.contentHash).toBe(hashContent(content));
    expect("content" in (payload.currentDocumentVersion ?? {})).toBe(false);
  });

  it("opens local threads lazily with the last page and related counts", () => {
    const selection: TextSelectionModel = {
      id: "sel1",
      projectId: "project1",
      conversationId: "conv1",
      sourceType: "document_version",
      sourceId: "doc-v1",
      sourceDocumentVersionId: "doc-v1",
      selectedText: "Selected text",
      status: "active",
      createdAt: "2026-07-05T03:00:00.000Z"
    };
    const thread: LocalThreadModel = {
      id: "thread1",
      projectId: "project1",
      conversationId: "conv1",
      sourceSelectionId: "sel1",
      threadType: "local",
      status: "active",
      memoryScope: "local_thread",
      createdAt: "2026-07-05T03:00:00.000Z",
      updatedAt: "2026-07-05T03:00:00.000Z"
    };
    const messages = Object.fromEntries(
      Array.from({ length: 35 }, (_, index) => {
        const message: MessageModel = {
          id: `local-msg-${index}`,
          projectId: "project1",
          conversationId: "conv1",
          threadId: "thread1",
          threadType: "local",
          role: index % 2 === 0 ? "user" : "assistant",
          content: `Local message ${index}`,
          status: "active",
          memoryScope: "local_thread",
          includeInContext: true,
          createdAt: new Date(Date.UTC(2026, 6, 5, 3, 0, index)).toISOString()
        };
        return [message.id, message];
      })
    );
    const annotation: AnnotationModel = {
      id: "note1",
      projectId: "project1",
      conversationId: "conv1",
      content: "Useful local note",
      scope: "local_thread",
      scopeObjectId: "thread1",
      scopeType: "local_thread",
      scopeId: "thread1",
      status: "active",
      includeInContext: true,
      memoryPolicy: "auto_by_scope",
      createdAt: "2026-07-05T03:00:00.000Z",
      updatedAt: "2026-07-05T03:00:00.000Z"
    };
    const state = {
      ...baseState(),
      textSelections: { sel1: selection },
      localThreads: { thread1: thread },
      revisionMessages: messages,
      annotations: { note1: annotation }
    };
    const result = LocalThreadQueryService.openLocalThread({
      state,
      threadId: "thread1",
      limit: 20
    });

    expect(result.messages).toHaveLength(20);
    expect(result.messages[0].id).toBe("local-msg-15");
    expect(result.relatedObjectCounts.annotation).toBe(1);
    expect(result.latestRelatedNotesPreview[0].id).toBe("note1");
  });

  it("builds indexed context, caches decisions, and prevents stale deleted cache reads", () => {
    const documentContent = Array.from({ length: 20 }, (_, index) =>
      `Paragraph ${index}. This paragraph explains scalable context building and chunking for Answer Atlas.`
    ).join("\n\n");
    const version: DocumentVersionModel = {
      id: "doc-v1",
      projectId: "project1",
      conversationId: "conv1",
      documentId: "doc1",
      versionNumber: 1,
      content: documentContent,
      contentHash: hashContent(documentContent),
      sourceType: "initial_answer",
      sourceId: "assistant1",
      status: "active",
      createdAt: "2026-07-05T03:00:00.000Z"
    };
    const activeNote: AnnotationModel = {
      id: "note-active",
      projectId: "project1",
      conversationId: "conv1",
      content: "Remember the active scoped note.",
      scope: "conversation",
      scopeObjectId: "conv1",
      scopeType: "conversation",
      scopeId: "conv1",
      status: "active",
      includeInContext: true,
      memoryPolicy: "auto_by_scope",
      createdAt: "2026-07-05T03:01:00.000Z",
      updatedAt: "2026-07-05T03:01:00.000Z"
    };
    const deletedNote: AnnotationModel = {
      ...activeNote,
      id: "note-deleted",
      content: "Deleted note should not appear.",
      status: "deleted",
      memoryPolicy: "never_include",
      includeInContext: false
    };
    const stateWithChunks = DocumentChunkService.createChunksForDocumentVersion({
      state: {
        ...baseState(),
        documentVersions: { [version.id]: version },
        annotations: {
          [activeNote.id]: activeNote,
          [deletedNote.id]: deletedNote
        }
      },
      documentVersionId: version.id,
      now: "2026-07-05T03:02:00.000Z"
    }).state;
    const indexed = WorkspaceProjectionService.rebuildContextItemIndex({
      state: stateWithChunks,
      projectId: "project1",
      conversationId: "conv1",
      now: "2026-07-05T03:03:00.000Z"
    });
    const first = ContextSnapshotService.buildScalableContextSnapshot({
      state: indexed,
      llmCallId: "llm-1",
      projectId: "project1",
      conversationId: "conv1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      threadType: "main",
      threadId: "conv1",
      activeDocumentVersionId: "doc-v1",
      tokenBudget: 1200,
      now: "2026-07-05T03:04:00.000Z"
    });
    const second = ContextSnapshotService.buildScalableContextSnapshot({
      state: first.state,
      llmCallId: "llm-2",
      projectId: "project1",
      conversationId: "conv1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      threadType: "main",
      threadId: "conv1",
      activeDocumentVersionId: "doc-v1",
      tokenBudget: 1200,
      now: "2026-07-05T03:05:00.000Z"
    });
    const poisonedState = {
      ...second.state,
      contextItemIndex: {
        ...second.state.contextItemIndex,
        "context-index-annotation-note-active": {
          ...second.state.contextItemIndex["context-index-annotation-note-active"],
          status: "deleted" as const,
          memoryPolicy: "never_include" as const,
          contentPreview: ""
        }
      }
    };
    const third = ContextSnapshotService.buildScalableContextSnapshot({
      state: poisonedState,
      llmCallId: "llm-3",
      projectId: "project1",
      conversationId: "conv1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      threadType: "main",
      threadId: "conv1",
      activeDocumentVersionId: "doc-v1",
      tokenBudget: 1200,
      now: "2026-07-05T03:06:00.000Z"
    });
    const deleted = ObjectStateService.deleteObject({
      state: second.state,
      objectType: "annotation",
      objectId: "note-active",
      reason: "test_delete_note_invalidates_context_cache",
      confirmed: true,
      now: "2026-07-05T03:07:00.000Z",
      suffix: "note-active-delete"
    });
    const fourth = ContextSnapshotService.buildScalableContextSnapshot({
      state: deleted.state,
      llmCallId: "llm-4",
      projectId: "project1",
      conversationId: "conv1",
      callType: "main_conversation",
      purpose: "general_followup",
      model: "gpt-5.5",
      threadType: "main",
      threadId: "conv1",
      activeDocumentVersionId: "doc-v1",
      tokenBudget: 1200,
      now: "2026-07-05T03:08:00.000Z"
    });

    expect(first.snapshot.cacheHit).toBe(false);
    expect(first.snapshot.includedItems.some((item) => item.sourceId === "note-active")).toBe(true);
    expect(first.snapshot.excludedItems.find((item) => item.sourceId === "note-deleted")?.text).toBe("");
    expect(second.snapshot.cacheHit).toBe(true);
    expect(second.state.contextSnapshots["context-snapshot-llm-2"]).toBeDefined();
    expect(third.snapshot.cacheHit).toBe(false);
    expect(third.snapshot.excludedItems.find((item) => item.sourceId === "note-active")?.text).toBe("");
    expect(
      Object.values(deleted.state.eventLogs).some(
        (event) => event.eventType === "context.cache.invalidated"
      )
    ).toBe(true);
    expect(fourth.snapshot.cacheHit).toBe(false);
    expect(fourth.snapshot.excludedItems.find((item) => item.sourceId === "note-active")?.text).toBe("");
  });

  it("summarizes long threads and pages large comparison graphs", () => {
    const messages = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => {
        const message: MessageModel = {
          id: `main-msg-${index}`,
          projectId: "project1",
          conversationId: "conv1",
          threadId: "conv1",
          threadType: "main",
          role: index % 2 === 0 ? "user" : "assistant",
          content: `Main message ${index} with enough text to summarize.`,
          status: "active",
          memoryScope: "conversation",
          includeInContext: true,
          createdAt: new Date(Date.UTC(2026, 6, 5, 4, 0, index)).toISOString()
        };
        return [message.id, message];
      })
    );
    const comparison: ComparisonGraphModel = {
      id: "comparison1",
      projectId: "project1",
      conversationId: "conv1",
      title: "Large comparison",
      sourceObjectIds: ["doc-v1", "doc-v2"],
      sourceVersions: [],
      activeRunId: "run1",
      status: "active",
      graphNodes: [],
      graphEdges: [],
      createdAt: "2026-07-05T04:00:00.000Z"
    };
    const run: ComparisonRunModel = {
      id: "run1",
      comparisonId: "comparison1",
      projectId: "project1",
      conversationId: "conv1",
      runNumber: 1,
      model: "gpt-5.5",
      llmCallId: "llm-run1",
      contextSnapshotId: "ctx-run1",
      graphData: {
        nodes: Array.from({ length: 1000 }, (_, index) => ({
          id: `g-node-${index}`,
          label: `Node ${index}`,
          group_id: `group-${index % 10}`,
          source_refs: [{ object_type: "document_version", object_id: `doc-v${index % 2 + 1}` }]
        })),
        edges: Array.from({ length: 3000 }, (_, index) => ({
          id: `g-edge-${index}`,
          source: `g-node-${index % 1000}`,
          target: `g-node-${(index + 1) % 1000}`
        }))
      },
      summary: "Large semantic map",
      semanticGroups: Array.from({ length: 10 }, (_, index) => ({
        id: `group-${index}`,
        title: `Group ${index}`
      })),
      inputSourceSnapshot: [],
      inputSourceHashes: {},
      status: "active",
      createdAt: "2026-07-05T04:00:00.000Z",
      updatedAt: "2026-07-05T04:00:00.000Z"
    };
    const state = {
      ...baseState(),
      revisionMessages: messages,
      comparisonGraphs: { comparison1: comparison },
      comparisonRuns: { run1: run }
    };
    const summary = ThreadSummaryService.getOrCreateThreadSummary({
      state,
      projectId: "project1",
      conversationId: "conv1",
      threadType: "main",
      threadId: "conv1",
      now: "2026-07-05T04:01:00.000Z"
    });
    const graphSummary = ComparisonGraphQueryService.getGraphSummary({
      state: summary.state,
      comparisonId: "comparison1"
    });
    const graphWindow = ComparisonGraphQueryService.getGraphWindow({
      state: summary.state,
      runId: "run1",
      groupId: "group-1",
      limit: 25
    });
    const sourceRefs = ComparisonGraphQueryService.getNodeSourceRefs({
      state: summary.state,
      runId: "run1",
      nodeId: "g-node-1"
    });

    expect(summary.summary.coveredMessageIds.length).toBe(48);
    expect(graphSummary.useClusteredView).toBe(true);
    expect(graphSummary.defaultView).toBe("semantic_groups");
    expect(graphWindow.nodes).toHaveLength(25);
    expect(graphWindow.hasMore).toBe(true);
    expect(sourceRefs.refCount).toBe(1);
  });
});
