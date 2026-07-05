import type {
  AnnotationScopeType,
  ComparisonExportModel,
  ComparisonExportType,
  ComparisonGraphModel,
  ComparisonRunModel,
  ComparisonSourceType,
  FlexiblePayload,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import type { ContextSnapshot, ContextSnapshotItem, LLMCallRecord } from "@/types/context";
import { AnnotationService } from "./AnnotationService";
import { ContextSnapshotService } from "./ContextSnapshotService";
import { DiffService, hashContent } from "./DiffService";
import { EventService } from "./EventService";
import { ObjectStateService } from "./ObjectStateService";
import { TimelineService } from "./TimelineService";

type ComparisonSourceInput = {
  objectType: ComparisonSourceType;
  objectId: string;
};

type ResolvedComparisonSource = {
  objectType: ComparisonSourceType;
  objectId: string;
  label: string;
  content: string;
  contentHash: string;
  status: string;
  sourceVersion?: string;
  timelineNode?: RevisionTimelineNode;
  snapshot: FlexiblePayload;
};

type CreateComparisonInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  title?: string;
  description?: string;
  scopeType?: AnnotationScopeType | "comparison" | "document";
  scopeId?: string;
  sources: ComparisonSourceInput[];
  model: string;
  modelProvider?: "openai" | "mock";
  createdBy?: "user" | "assistant" | "system";
  allowNonActiveSources?: boolean;
  now: string;
  suffix: string;
};

type GenerateComparisonRunInput = {
  state: RevisionRepositoryState;
  comparisonId: string;
  model: string;
  modelProvider?: "openai" | "mock";
  eventType?: "comparison.generated" | "comparison.regenerated";
  previousRunId?: string;
  allowNonActiveSources?: boolean;
  now: string;
  suffix: string;
};

function sourceKey(source: ComparisonSourceInput) {
  return `${source.objectType}:${source.objectId}`;
}

function latestNodeForObject(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  objectId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === objectType &&
        node.targetObjectId === objectId &&
        node.status !== "deleted"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function sourceObjectType(type: ComparisonSourceType): RevisionObjectType {
  return type;
}

function objectStatusAllowsSource(status: string, allowNonActiveSources?: boolean) {
  if (status === "deleted") {
    return false;
  }

  if ((status === "discarded" || status === "inactive") && !allowNonActiveSources) {
    return false;
  }

  return true;
}

function sourceLabel(type: ComparisonSourceType, object: FlexiblePayload) {
  if (type === "document_version") {
    return `Document v${object.versionNumber ?? object.version_number ?? "?"}`;
  }

  if (type === "revision_branch") {
    return object.title?.toString() ?? `Branch ${object.id}`;
  }

  if (type === "message") {
    return `${object.threadType ?? object.thread_type ?? "main"} message`;
  }

  if (type === "local_selection") {
    return "Selected local fragment";
  }

  if (type === "text_selection") {
    return "Original selected text";
  }

  if (type === "merge_record") {
    return `Merge ${object.mergeId ?? object.merge_id ?? object.id}`;
  }

  if (type === "annotation") {
    return object.title?.toString() ?? "Annotation";
  }

  return type;
}

function resolveObject(
  state: RevisionRepositoryState,
  source: ComparisonSourceInput
): FlexiblePayload | undefined {
  if (source.objectType === "document_version") {
    return state.documentVersions[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "revision_branch") {
    return state.revisionBranches[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "message") {
    return state.revisionMessages[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "local_selection") {
    return state.localSelections[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "text_selection") {
    return state.textSelections[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "merge_record") {
    return state.mergeRecords[source.objectId] as FlexiblePayload | undefined;
  }

  if (source.objectType === "annotation") {
    return state.annotations[source.objectId] as FlexiblePayload | undefined;
  }

  return undefined;
}

function sourceContent(type: ComparisonSourceType, object: FlexiblePayload) {
  if (type === "document_version") {
    return object.content?.toString() ?? "";
  }

  if (type === "revision_branch") {
    return object.draftContent?.toString() ?? object.content?.toString() ?? "";
  }

  if (type === "message") {
    return object.content?.toString() ?? "";
  }

  if (type === "local_selection" || type === "text_selection") {
    return object.selectedText?.toString() ?? object.selected_text?.toString() ?? "";
  }

  if (type === "merge_record") {
    return [
      object.sourceText?.toString() ?? object.source_text?.toString() ?? "",
      object.diffSummary ? JSON.stringify(object.diffSummary) : "",
      object.diff_summary ? JSON.stringify(object.diff_summary) : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (type === "annotation") {
    return object.content?.toString() ?? "";
  }

  return "";
}

function contentHash(type: ComparisonSourceType, object: FlexiblePayload, content: string) {
  const explicit =
    object.contentHash?.toString() ??
    object.content_hash?.toString() ??
    object.textHash?.toString() ??
    object.text_hash?.toString();

  return explicit ?? hashContent(`${type}:${content}`);
}

function summarySentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}

function wordSet(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/iu)
      .map((word) => word.trim())
      .filter((word) => word.length > 2)
  );
}

function setIntersection<T>(left: Set<T>, right: Set<T>) {
  return [...left].filter((value) => right.has(value));
}

function buildSemanticOutput(sources: ResolvedComparisonSource[]) {
  const [first, second] = sources;
  const diff = DiffService.createTextDiff(first.content, second.content);
  const firstWords = wordSet(first.content);
  const secondWords = wordSet(second.content);
  const sharedWords = setIntersection(firstWords, secondWords).slice(0, 8);
  const firstOnly = [...firstWords].filter((word) => !secondWords.has(word)).slice(0, 8);
  const secondOnly = [...secondWords].filter((word) => !firstWords.has(word)).slice(0, 8);
  const similarities = sharedWords.map((word) => ({
    label: word,
    summary: `Both sources refer to ${word}.`
  }));
  const differences = [
    {
      label: "content_delta",
      summary: `${diff.summary.addedCharacters} added chars, ${diff.summary.removedCharacters} removed chars.`
    },
    ...firstOnly.map((word) => ({
      label: `${first.label}: ${word}`,
      summary: `Only ${first.label} emphasizes ${word}.`
    })),
    ...secondOnly.map((word) => ({
      label: `${second.label}: ${word}`,
      summary: `Only ${second.label} emphasizes ${word}.`
    }))
  ].slice(0, 10);
  const nodes = sources.map((source, index) => ({
    id: `source-${index + 1}`,
    type: "source_fragment",
    label: source.label,
    summary: summarySentence(source.content),
    source_refs: [sourceKey(source)]
  }));
  const similarityNodes = similarities.slice(0, 4).map((similarity, index) => ({
    id: `similarity-${index + 1}`,
    type: "similarity",
    label: similarity.label,
    summary: similarity.summary,
    source_refs: sources.map(sourceKey)
  }));
  const differenceNodes = differences.slice(0, 4).map((difference, index) => ({
    id: `difference-${index + 1}`,
    type: "difference",
    label: difference.label,
    summary: difference.summary,
    source_refs: sources.map(sourceKey)
  }));
  const graphNodes = [...nodes, ...similarityNodes, ...differenceNodes];
  const graphEdges = [
    {
      id: "edge-source-diff",
      source: "source-1",
      target: "source-2",
      type: diff.changedRanges.length > 0 ? "differs_from" : "same_as",
      summary: diff.changedRanges.length > 0
        ? "The selected sources differ semantically or textually."
        : "The selected sources are closely aligned."
    },
    ...similarityNodes.map((node) => ({
      id: `edge-${node.id}`,
      source: node.id,
      target: "source-1",
      type: "supports",
      summary: "Similarity is grounded in the first source."
    })),
    ...differenceNodes.map((node) => ({
      id: `edge-${node.id}`,
      source: node.id,
      target: "source-2",
      type: "differs_from",
      summary: "Difference is visible against the second source."
    }))
  ];

  return {
    summary: `Compared ${sources.length} sources. ${diff.changedRanges.length > 0 ? "Meaning or wording changed across the sources." : "Sources are mostly aligned."}`,
    similarities,
    differences,
    conflicts: [],
    semanticGroups: [
      {
        id: "group-sources",
        title: "Compared sources",
        source_refs: sources.map(sourceKey)
      },
      {
        id: "group-differences",
        title: "Meaning differences",
        count: differences.length
      }
    ],
    graph: {
      nodes: graphNodes,
      edges: graphEdges
    },
    recommendations: [
      {
        label: "review_before_merge",
        summary: "Use this comparison as review context; do not merge automatically."
      }
    ],
    differenceSummary: differences.map((item) => item.summary).join(" "),
    similaritySummary: similarities.map((item) => item.summary).join(" "),
    conflictSummary: "No direct contradiction detected by the deterministic comparison pass.",
    recommendationSummary: "Review source differences, then save a note or create an explicit merge if needed."
  };
}

function validateSemanticOutput(output: ReturnType<typeof buildSemanticOutput>) {
  if (!output.summary || !Array.isArray(output.graph.nodes) || !Array.isArray(output.graph.edges)) {
    throw new Error("Invalid comparison output");
  }
}

function contextItemFromSource(source: ResolvedComparisonSource): ContextSnapshotItem {
  return {
    id: `ctx-comparison-source-${source.objectType}-${source.objectId}`,
    type: "comparison_source",
    sourceId: source.objectId,
    text: source.content,
    reason: "active_comparison_panel_context",
    included: true
  };
}

function comparisonRunCount(state: RevisionRepositoryState, comparisonId: string) {
  return Object.values(state.comparisonRuns).filter(
    (run) => run.comparisonId === comparisonId
  ).length;
}

function latestNodeForComparisonRun(state: RevisionRepositoryState, runId: string) {
  return latestNodeForObject(state, "comparison_run", runId);
}

function latestNodeForComparisonGraph(state: RevisionRepositoryState, comparisonId: string) {
  return latestNodeForObject(state, "comparison_graph", comparisonId);
}

function comparisonSummaryHash(summary?: string) {
  return summary ? hashContent(summary) : undefined;
}

export class ComparisonService {
  static resolveComparisonSources(input: {
    state: RevisionRepositoryState;
    sources: ComparisonSourceInput[];
    allowNonActiveSources?: boolean;
  }) {
    const seen = new Set<string>();
    const resolved: ResolvedComparisonSource[] = [];

    for (const source of input.sources) {
      const key = sourceKey(source);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const object = resolveObject(input.state, source);
      if (!object) {
        throw new Error(`Comparison source not found: ${key}`);
      }

      const status = object.status?.toString() ?? "active";
      if (!objectStatusAllowsSource(status, input.allowNonActiveSources)) {
        throw new Error(`Comparison source cannot be used without confirmation: ${key}`);
      }

      const content = sourceContent(source.objectType, object);
      const hash = contentHash(source.objectType, object, content);
      const timelineNode = latestNodeForObject(
        input.state,
        sourceObjectType(source.objectType),
        source.objectId
      );
      const snapshot: FlexiblePayload = {
        object_type: source.objectType,
        object_id: source.objectId,
        label: sourceLabel(source.objectType, object),
        content,
        content_hash: hash,
        status,
        source_version:
          object.versionNumber?.toString() ??
          object.version_number?.toString() ??
          object.sourceDocumentVersionId?.toString() ??
          object.source_document_version_id?.toString(),
        requires_confirmation: status === "discarded" || status === "inactive"
      };

      resolved.push({
        objectType: source.objectType,
        objectId: source.objectId,
        label: snapshot.label as string,
        content,
        contentHash: hash,
        status,
        sourceVersion: snapshot.source_version as string | undefined,
        timelineNode,
        snapshot
      });
    }

    if (resolved.length < 2) {
      throw new Error("Comparison requires at least two sources");
    }

    return resolved;
  }

  static createComparison(input: CreateComparisonInput) {
    const project = input.state.projects[input.projectId];
    const conversation = input.conversationId
      ? input.state.mainConversations[input.conversationId]
      : undefined;

    if (project && project.status === "deleted") {
      throw new Error("Project is deleted");
    }

    if (input.conversationId && conversation?.status === "deleted") {
      throw new Error("Conversation is deleted");
    }

    const sources = ComparisonService.resolveComparisonSources(input);
    const comparisonId = `comparison-${input.suffix}`;
    const sourceHashes = Object.fromEntries(
      sources.map((source) => [sourceKey(source), source.contentHash])
    );
    const comparison: ComparisonGraphModel = {
      id: comparisonId,
      comparisonId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      title: input.title ?? "Semantic Comparison",
      description: input.description,
      scopeType: input.scopeType ?? "comparison",
      scopeId: input.scopeId ?? comparisonId,
      sourceObjectTypes: sources.map((source) => source.objectType),
      sourceObjectIds: sources.map((source) => source.objectId),
      sourceSnapshot: sources.map((source) => source.snapshot),
      sourceHashes,
      sourceVersions: sources.map((source) => source.sourceVersion ?? ""),
      createdBy: input.createdBy ?? "user",
      createdAt: input.now,
      updatedAt: input.now,
      status: "active",
      model: input.model,
      graphNodes: [],
      graphEdges: [],
      metadata: {
        source_count: sources.length
      },
      payload: {
        source_object_types: sources.map((source) => source.objectType),
        source_object_ids: sources.map((source) => source.objectId),
        scope_type: input.scopeType ?? "comparison",
        scope_id: input.scopeId ?? comparisonId
      }
    };
    const sourceParentNode = sources.find((source) => source.timelineNode)?.timelineNode;
    const createdEventId = `event-comparison-created-${input.suffix}`;
    const createdTimelineNodeId = `timeline-comparison-created-${input.suffix}`;
    const createdPayload = {
      node_id: createdTimelineNodeId,
      project_id: input.projectId,
      conversation_id: input.conversationId,
      event_id: createdEventId,
      event_type: "comparison.created",
      target_object_type: "comparison_graph",
      target_object_id: comparison.id,
      source_object_type: sourceParentNode?.targetObjectType,
      source_object_id: sourceParentNode?.targetObjectId,
      comparison_id: comparison.id,
      comparison_run_id: undefined,
      source_object_types: comparison.sourceObjectTypes,
      source_object_ids: comparison.sourceObjectIds,
      llm_call_id: undefined,
      context_snapshot_id: undefined,
      model: input.model,
      memory_scope: "comparison",
      memory_effect: "none",
      status: "active",
      created_at: input.now,
      scope_type: comparison.scopeType,
      scope_id: comparison.scopeId,
      source_hashes: sourceHashes,
      graph_node_count: 0,
      graph_edge_count: 0,
      summary_hash: undefined,
      previous_run_id: undefined,
      new_run_id: undefined,
      export_type: undefined
    };
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: createdEventId,
        projectId: input.projectId,
        eventType: "comparison.created",
        objectType: "comparison_graph",
        objectId: comparison.id,
        actor: input.createdBy ?? "user",
        timestamp: input.now,
        payload: createdPayload
      },
      {
        id: createdTimelineNodeId,
        conversationId: input.conversationId,
        parentNodeId: sourceParentNode?.id,
        label: "Comparison created",
        memoryScope: "comparison",
        memoryEffect: "none",
        status: "active",
        createdContentRef: comparison.id,
        payload: createdPayload
      }
    );
    let nextState: RevisionRepositoryState = {
      ...input.state,
      comparisonGraphs: {
        ...input.state.comparisonGraphs,
        [comparison.id]: comparison
      },
      eventLogs: eventResult.eventLogs,
      timelineNodes: eventResult.timelineNodes,
      timelineEdges: eventResult.timelineEdges
    };

    for (const source of sources) {
      if (!source.timelineNode) {
        continue;
      }

      const edgeResult = TimelineService.createTimelineEdge(
        {
          timelineEdges: nextState.timelineEdges
        },
        {
          id: `timeline-edge-${source.timelineNode.id}-${eventResult.timelineNode.id}-comparison-attach`,
          projectId: input.projectId,
          sourceNodeId: source.timelineNode.id,
          targetNodeId: eventResult.timelineNode.id,
          edgeType: "comparison_attach",
          label: "comparison source",
          status: "active",
          timestamp: input.now,
          payload: {
            comparison_id: comparison.id,
            source_object_type: source.objectType,
            source_object_id: source.objectId
          }
        }
      );
      nextState = {
        ...nextState,
        timelineEdges: edgeResult.timelineEdges
      };
    }

    const generated = ComparisonService.generateComparisonRun({
      state: nextState,
      comparisonId: comparison.id,
      model: input.model,
      modelProvider: input.modelProvider ?? "mock",
      eventType: "comparison.generated",
      allowNonActiveSources: input.allowNonActiveSources,
      now: input.now,
      suffix: `${input.suffix}-run-1`
    });

    return {
      state: generated.state,
      comparison: generated.comparison,
      run: generated.run
    };
  }

  static generateComparisonRun(input: GenerateComparisonRunInput) {
    const comparison = input.state.comparisonGraphs[input.comparisonId];
    if (!comparison || comparison.status === "deleted") {
      throw new Error("Active comparison not found");
    }

    const sources = ComparisonService.resolveComparisonSources({
      state: input.state,
      sources: (comparison.sourceObjectTypes ?? []).map((type, index) => ({
        objectType: type,
        objectId: comparison.sourceObjectIds[index]
      })),
      allowNonActiveSources: input.allowNonActiveSources
    });
    const runNumber = comparisonRunCount(input.state, comparison.id) + 1;
    const llmCallId = `llm-call-comparison-${input.suffix}`;
    const contextSnapshotId = `context-snapshot-comparison-${input.suffix}`;
    const contextSnapshot: ContextSnapshot = {
      id: contextSnapshotId,
      llmCallId,
      projectId: comparison.projectId,
      callType: "comparison_generation",
      purpose: "argument_comparison",
      model: input.model,
      sessionId: comparison.conversationId,
      threadType: "comparison",
      comparisonId: comparison.id,
      includedItems: sources.map(contextItemFromSource),
      excludedItems: Object.values(input.state.comparisonGraphs)
        .filter((graph) => graph.id !== comparison.id)
        .map((graph) => ({
          id: `ctx-comparison-${graph.id}`,
          type: "excluded_comparison",
          sourceId: graph.id,
          text: graph.status === "deleted" ? "" : graph.title ?? "",
          reason:
            graph.status === "deleted"
              ? "deleted_memory_never_included"
              : graph.status === "discarded"
                ? "discarded_excluded_by_default"
                : graph.status === "cleared"
                  ? "cleared_comparison_excluded"
                  : "unrelated_comparison_scope",
          included: false
        })),
      tokenEstimate: Math.ceil(
        sources.reduce((total, source) => total + source.content.length, 0) / 4
      ),
      createdAt: input.now,
      metadata: {
        comparison_id: comparison.id,
        source_object_ids: comparison.sourceObjectIds,
        source_hashes: Object.fromEntries(
          sources.map((source) => [sourceKey(source), source.contentHash])
        )
      }
    };
    const llmCallRecord: LLMCallRecord = {
      id: llmCallId,
      projectId: comparison.projectId,
      callType: "comparison_generation",
      purpose: "argument_comparison",
      model: input.model,
      provider: input.modelProvider ?? "mock",
      status: "started",
      prompt: JSON.stringify({
        task: "semantic_comparison",
        output_format: "strict_json",
        sources: sources.map((source) => source.snapshot)
      }),
      contextSnapshotId,
      sessionId: comparison.conversationId,
      threadType: "comparison",
      comparisonId: comparison.id,
      createdAt: input.now,
      completedAt: input.now
    };
    let nextState: RevisionRepositoryState = {
      ...input.state,
      contextSnapshots: {
        ...input.state.contextSnapshots,
        [contextSnapshot.id]: contextSnapshot
      },
      llmCallRecords: {
        ...input.state.llmCallRecords,
        [llmCallRecord.id]: llmCallRecord
      }
    };
    const contextEvent = EventService.createEvent(nextState, {
      id: `event-context-snapshot-comparison-${input.suffix}`,
      projectId: comparison.projectId,
      eventType: "context_snapshot.created",
      objectType: "context_snapshot",
      objectId: contextSnapshot.id,
      actor: "system",
      timestamp: input.now,
      payload: {
        comparison_id: comparison.id,
        llm_call_id: llmCallId
      }
    });
    const llmStarted = EventService.createEvent(
      {
        eventLogs: contextEvent.eventLogs
      },
      {
        id: `event-llm-started-comparison-${input.suffix}`,
        projectId: comparison.projectId,
        eventType: "llm.call.started",
        objectType: "llm_call",
        objectId: llmCallId,
        actor: "system",
        timestamp: input.now,
        payload: {
          comparison_id: comparison.id,
          model: input.model,
          context_snapshot_id: contextSnapshot.id
        }
      }
    );
    nextState = {
      ...nextState,
      eventLogs: llmStarted.eventLogs
    };

    try {
      const output = buildSemanticOutput(sources);
      validateSemanticOutput(output);
      const runId = `comparison-run-${input.suffix}`;
      const sourceHashes = Object.fromEntries(
        sources.map((source) => [sourceKey(source), source.contentHash])
      );
      const run: ComparisonRunModel = {
        id: runId,
        comparisonRunId: runId,
        comparisonId: comparison.id,
        projectId: comparison.projectId,
        conversationId: comparison.conversationId,
        runNumber,
        model: input.model,
        modelProvider: input.modelProvider ?? "mock",
        llmCallId,
        contextSnapshotId,
        graphData: output.graph,
        summary: output.summary,
        semanticGroups: output.semanticGroups,
        differenceSummary: output.differenceSummary,
        similaritySummary: output.similaritySummary,
        conflictSummary: output.conflictSummary,
        recommendationSummary: output.recommendationSummary,
        inputSourceSnapshot: sources.map((source) => source.snapshot),
        inputSourceHashes: sourceHashes,
        status: "active",
        createdBy: "assistant",
        createdAt: input.now,
        updatedAt: input.now,
        metadata: {
          similarities: output.similarities,
          differences: output.differences,
          conflicts: output.conflicts,
          recommendations: output.recommendations
        }
      };
      const completedCall: LLMCallRecord = {
        ...llmCallRecord,
        status: "completed",
        outputObjectId: run.id,
        completedAt: input.now
      };
      const updatedComparison: ComparisonGraphModel = {
        ...comparison,
        activeRunId: run.id,
        updatedAt: input.now,
        model: input.model,
        contextSnapshotId,
        graphNodes: output.graph.nodes,
        graphEdges: output.graph.edges,
        summary: output.summary,
        sourceSnapshot: sources.map((source) => source.snapshot),
        sourceHashes
      };
      const llmCompleted = EventService.createEvent(nextState, {
        id: `event-llm-completed-comparison-${input.suffix}`,
        projectId: comparison.projectId,
        eventType: "llm.call.completed",
        objectType: "llm_call",
        objectId: llmCallId,
        actor: "system",
        timestamp: input.now,
        payload: {
          comparison_id: comparison.id,
          comparison_run_id: run.id,
          model: input.model,
          context_snapshot_id: contextSnapshot.id
        }
      });
      const runCreated = EventService.createEvent(nextState, {
        id: `event-comparison-run-created-${input.suffix}`,
        projectId: comparison.projectId,
        eventType: "comparison.run.created",
        objectType: "comparison_run",
        objectId: run.id,
        actor: "assistant",
        timestamp: input.now,
        payload: {
          comparison_id: comparison.id,
          comparison_run_id: run.id,
          run_number: runNumber,
          model: input.model,
          llm_call_id: llmCallId,
          context_snapshot_id: contextSnapshot.id
        }
      });
      const graphNode = latestNodeForComparisonGraph(nextState, comparison.id);
      const comparisonEventType = input.eventType ?? "comparison.generated";
      const comparisonEventId = `event-${comparisonEventType.replaceAll(".", "-")}-${input.suffix}`;
      const comparisonTimelineNodeId = `timeline-${comparisonEventType.replaceAll(".", "-")}-${input.suffix}`;
      const generatedPayload = {
        node_id: comparisonTimelineNodeId,
        project_id: comparison.projectId,
        conversation_id: comparison.conversationId,
        event_id: comparisonEventId,
        event_type: comparisonEventType,
        target_object_type: "comparison_run",
        target_object_id: run.id,
        source_object_type: "comparison_graph",
        source_object_id: comparison.id,
        comparison_id: comparison.id,
        comparison_run_id: run.id,
        source_object_types: updatedComparison.sourceObjectTypes,
        source_object_ids: updatedComparison.sourceObjectIds,
        llm_call_id: llmCallId,
        context_snapshot_id: contextSnapshot.id,
        model: input.model,
        memory_scope: "comparison",
        memory_effect: "none",
        status: "active",
        created_at: input.now,
        scope_type: updatedComparison.scopeType,
        scope_id: updatedComparison.scopeId,
        source_hashes: sourceHashes,
        graph_node_count: output.graph.nodes.length,
        graph_edge_count: output.graph.edges.length,
        summary_hash: comparisonSummaryHash(output.summary),
        previous_run_id: input.previousRunId,
        new_run_id: run.id,
        export_type: undefined
      };
      const comparisonEvent = EventService.createEventWithTimelineNode(
        {
          ...nextState,
          eventLogs: {
            ...nextState.eventLogs,
            ...llmCompleted.eventLogs,
            ...runCreated.eventLogs
          }
        },
        {
          id: comparisonEventId,
          projectId: comparison.projectId,
          eventType: comparisonEventType,
          objectType: "comparison_run",
          objectId: run.id,
          actor: "assistant",
          timestamp: input.now,
          payload: generatedPayload
        },
        {
          id: comparisonTimelineNodeId,
          conversationId: comparison.conversationId,
          parentNodeId: graphNode?.id,
          label: input.eventType === "comparison.regenerated"
            ? "Comparison regenerated"
            : "Comparison generated",
          model: input.model,
          memoryScope: "comparison",
          memoryEffect: "none",
          status: "active",
          createdContentRef: run.id,
          affectedContextRefs: [contextSnapshot.id],
          payload: generatedPayload
        },
        graphNode
          ? {
              id: `timeline-edge-${graphNode.id}-comparison-run-${run.id}`,
              sourceNodeId: graphNode.id,
              edgeType: "comparison_run",
              label: "comparison run"
            }
          : undefined
      );

      return {
        state: {
          ...nextState,
          comparisonGraphs: {
            ...nextState.comparisonGraphs,
            [updatedComparison.id]: updatedComparison
          },
          comparisonRuns: {
            ...nextState.comparisonRuns,
            [run.id]: run
          },
          llmCallRecords: {
            ...nextState.llmCallRecords,
            [completedCall.id]: completedCall
          },
          eventLogs: comparisonEvent.eventLogs,
          timelineNodes: comparisonEvent.timelineNodes,
          timelineEdges: comparisonEvent.timelineEdges
        },
        comparison: updatedComparison,
        run
      };
    } catch (error) {
      const runId = `comparison-run-${input.suffix}`;
      const failedRun: ComparisonRunModel = {
        id: runId,
        comparisonRunId: runId,
        comparisonId: comparison.id,
        projectId: comparison.projectId,
        conversationId: comparison.conversationId,
        runNumber,
        model: input.model,
        modelProvider: input.modelProvider ?? "mock",
        llmCallId,
        contextSnapshotId,
        graphData: { nodes: [], edges: [] },
        summary: "",
        semanticGroups: [],
        inputSourceSnapshot: sources.map((source) => source.snapshot),
        inputSourceHashes: Object.fromEntries(
          sources.map((source) => [sourceKey(source), source.contentHash])
        ),
        status: "failed",
        createdBy: "assistant",
        createdAt: input.now,
        updatedAt: input.now,
        errorMessage: error instanceof Error ? error.message : "Unknown comparison error"
      };
      const failedCall: LLMCallRecord = {
        ...llmCallRecord,
        status: "failed",
        outputObjectId: failedRun.id,
        completedAt: input.now
      };
      const failedEvent = EventService.createEventWithTimelineNode(
        nextState,
        {
          id: `event-llm-failed-comparison-${input.suffix}`,
          projectId: comparison.projectId,
          eventType: "llm.call.failed",
          objectType: "llm_call",
          objectId: llmCallId,
          actor: "system",
          timestamp: input.now,
          payload: {
            comparison_id: comparison.id,
            comparison_run_id: failedRun.id,
            error_message: failedRun.errorMessage
          }
        },
        {
          id: `timeline-comparison-failed-${input.suffix}`,
          conversationId: comparison.conversationId,
          label: "Comparison generation failed",
          model: input.model,
          memoryScope: "comparison",
          memoryEffect: "none",
          status: "failed",
          payload: {
            comparison_id: comparison.id,
            comparison_run_id: failedRun.id,
            error_message: failedRun.errorMessage
          }
        }
      );

      return {
        state: {
          ...nextState,
          comparisonRuns: {
            ...nextState.comparisonRuns,
            [failedRun.id]: failedRun
          },
          llmCallRecords: {
            ...nextState.llmCallRecords,
            [failedCall.id]: failedCall
          },
          eventLogs: failedEvent.eventLogs,
          timelineNodes: failedEvent.timelineNodes,
          timelineEdges: failedEvent.timelineEdges
        },
        comparison,
        run: failedRun
      };
    }
  }

  static regenerateComparison(input: GenerateComparisonRunInput) {
    const previousComparison = input.state.comparisonGraphs[input.comparisonId];
    const previousRun = previousComparison?.activeRunId
      ? input.state.comparisonRuns[previousComparison.activeRunId]
      : undefined;
    const generated = ComparisonService.generateComparisonRun({
      ...input,
      eventType: "comparison.regenerated",
      previousRunId: previousRun?.id
    });

    if (!previousRun || generated.run.status !== "active") {
      return generated;
    }

    const supersededPrevious: ComparisonRunModel = {
      ...previousRun,
      status: "superseded",
      updatedAt: input.now,
      metadata: {
        ...previousRun.metadata,
        superseded_by_run_id: generated.run.id
      }
    };
    const previousNode = latestNodeForComparisonRun(generated.state, previousRun.id);
    const newNode = latestNodeForComparisonRun(generated.state, generated.run.id);
    const edgeResult =
      previousNode && newNode
        ? TimelineService.createTimelineEdge(
            {
              timelineEdges: generated.state.timelineEdges
            },
            {
              id: `timeline-edge-${previousNode.id}-${newNode.id}-supersede`,
              projectId: generated.comparison.projectId,
              sourceNodeId: previousNode.id,
              targetNodeId: newNode.id,
              edgeType: "supersede",
              label: "regenerated run",
              status: "active",
              timestamp: input.now,
              payload: {
                comparison_id: generated.comparison.id,
                previous_run_id: previousRun.id,
                new_run_id: generated.run.id,
                memory_effect: "none"
              }
            }
          )
        : undefined;

    return {
      ...generated,
      state: {
        ...generated.state,
        comparisonRuns: {
          ...generated.state.comparisonRuns,
          [supersededPrevious.id]: supersededPrevious,
          [generated.run.id]: generated.run
        },
        timelineEdges: edgeResult?.timelineEdges ?? generated.state.timelineEdges
      }
    };
  }

  static clearComparison(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    now: string;
    suffix: string;
  }) {
    const comparison = input.state.comparisonGraphs[input.comparisonId];
    if (!comparison || comparison.status === "deleted") {
      throw new Error("Comparison not found");
    }

    const cleared: ComparisonGraphModel = {
      ...comparison,
      status: "cleared",
      updatedAt: input.now,
      payload: {
        ...comparison.payload,
        cleared_from_view: true,
        active_run_id: comparison.activeRunId
      }
    };
    const sourceNode = latestNodeForComparisonGraph(input.state, comparison.id);
    const clearEventId = `event-comparison-cleared-${input.suffix}`;
    const clearNodeId = `timeline-comparison-cleared-${input.suffix}`;
    const clearPayload = {
      node_id: clearNodeId,
      project_id: comparison.projectId,
      conversation_id: comparison.conversationId,
      event_id: clearEventId,
      event_type: "comparison.cleared",
      target_object_type: "comparison_graph",
      target_object_id: comparison.id,
      source_object_type: sourceNode?.targetObjectType,
      source_object_id: sourceNode?.targetObjectId,
      comparison_id: comparison.id,
      comparison_run_id: comparison.activeRunId,
      source_object_types: comparison.sourceObjectTypes,
      source_object_ids: comparison.sourceObjectIds,
      llm_call_id: undefined,
      context_snapshot_id: comparison.contextSnapshotId,
      model: comparison.model,
      memory_scope: "comparison",
      memory_effect: "excluded_by_default",
      status: "cleared",
      created_at: input.now,
      scope_type: comparison.scopeType,
      scope_id: comparison.scopeId,
      source_hashes: comparison.sourceHashes,
      graph_node_count: comparison.graphNodes.length,
      graph_edge_count: comparison.graphEdges.length,
      summary_hash: comparisonSummaryHash(comparison.summary),
      previous_run_id: comparison.activeRunId,
      new_run_id: undefined,
      export_type: undefined,
      cleared_from_view: true,
      active_run_id: comparison.activeRunId
    };
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: clearEventId,
        projectId: comparison.projectId,
        eventType: "comparison.cleared",
        objectType: "comparison_graph",
        objectId: comparison.id,
        actor: "user",
        timestamp: input.now,
        payload: clearPayload
      },
      {
        id: clearNodeId,
        conversationId: comparison.conversationId,
        parentNodeId: sourceNode?.id,
        label: "Comparison cleared from view",
        memoryScope: "comparison",
        memoryEffect: "excluded_by_default",
        status: "cleared",
        payload: clearPayload
      },
      sourceNode
        ? {
            id: `timeline-edge-${sourceNode.id}-timeline-comparison-cleared-${input.suffix}`,
            sourceNodeId: sourceNode.id,
            edgeType: "sequence",
            label: "clear comparison"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        comparisonGraphs: {
          ...input.state.comparisonGraphs,
          [cleared.id]: cleared
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      comparison: cleared
    };
  }

  static discardComparison(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    now: string;
    suffix: string;
  }) {
    return ObjectStateService.discardObject({
      state: input.state,
      objectType: "comparison_graph",
      objectId: input.comparisonId,
      reason: "comparison_discarded",
      now: input.now,
      suffix: input.suffix
    });
  }

  static deleteComparison(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    now: string;
    suffix: string;
    confirmed: boolean;
  }) {
    const result = ObjectStateService.deleteObject({
      state: input.state,
      objectType: "comparison_graph",
      objectId: input.comparisonId,
      reason: "comparison_deleted",
      confirmed: input.confirmed,
      now: input.now,
      suffix: input.suffix
    });
    const graph = result.state.comparisonGraphs[input.comparisonId];

    return {
      ...result,
      state: {
        ...result.state,
        comparisonGraphs: {
          ...result.state.comparisonGraphs,
          [input.comparisonId]: {
            ...graph,
            summary: undefined,
            graphNodes: [],
            graphEdges: [],
            metadata: {
              ...graph.metadata,
              redaction_policy: "hide_full_content_from_context_review"
            }
          }
        }
      }
    };
  }

  static restoreComparison(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    now: string;
    suffix: string;
  }) {
    return ObjectStateService.restoreObject({
      state: input.state,
      objectType: "comparison_graph",
      objectId: input.comparisonId,
      reason: "comparison_restored",
      now: input.now,
      suffix: input.suffix
    });
  }

  static exportComparison(input: {
    state: RevisionRepositoryState;
    comparisonId: string;
    runId?: string;
    exportType: ComparisonExportType;
    now: string;
    suffix: string;
  }) {
    const comparison = input.state.comparisonGraphs[input.comparisonId];
    const runId = input.runId ?? comparison?.activeRunId;
    const run = runId ? input.state.comparisonRuns[runId] : undefined;

    if (!comparison || !run || run.status === "deleted") {
      throw new Error("Exportable comparison run not found");
    }

    const fileName = `${comparison.title ?? "comparison"}-${run.runNumber}.${input.exportType === "markdown" ? "md" : input.exportType}`;
    const content =
      input.exportType === "markdown"
        ? [
            `# ${comparison.title ?? "Semantic Comparison"}`,
            "",
            run.summary,
            "",
            "## Difference Summary",
            run.differenceSummary ?? "",
            "",
            "## Graph JSON",
            "```json",
            JSON.stringify(run.graphData, null, 2),
            "```"
          ].join("\n")
        : JSON.stringify(
            {
              comparison,
              run
            },
            null,
            2
          );
    const exportId = `comparison-export-${input.suffix}`;
    const comparisonExport: ComparisonExportModel = {
      id: exportId,
      exportId,
      projectId: comparison.projectId,
      conversationId: comparison.conversationId,
      comparisonId: comparison.id,
      comparisonRunId: run.id,
      exportType: input.exportType,
      fileName,
      fileUrl: `memory://comparison-exports/${exportId}`,
      fileMetadata: {
        content,
        content_hash: hashContent(content),
        bytes: content.length
      },
      createdBy: "user",
      createdAt: input.now,
      status: "active",
      metadata: {
        comparison_id: comparison.id,
        comparison_run_id: run.id
      }
    };
    const runNode = latestNodeForComparisonRun(input.state, run.id);
    const exportEventId = `event-comparison-exported-${input.suffix}`;
    const exportNodeId = `timeline-comparison-exported-${input.suffix}`;
    const exportPayload = {
      node_id: exportNodeId,
      project_id: comparison.projectId,
      conversation_id: comparison.conversationId,
      event_id: exportEventId,
      event_type: "comparison.exported",
      target_object_type: "comparison_export",
      target_object_id: comparisonExport.id,
      source_object_type: "comparison_run",
      source_object_id: run.id,
      comparison_id: comparison.id,
      comparison_run_id: run.id,
      source_object_types: comparison.sourceObjectTypes,
      source_object_ids: comparison.sourceObjectIds,
      llm_call_id: run.llmCallId,
      context_snapshot_id: run.contextSnapshotId,
      model: run.model,
      memory_scope: "comparison",
      memory_effect: "none",
      status: "active",
      created_at: input.now,
      scope_type: comparison.scopeType,
      scope_id: comparison.scopeId,
      source_hashes: comparison.sourceHashes,
      graph_node_count: Array.isArray(run.graphData.nodes)
        ? run.graphData.nodes.length
        : 0,
      graph_edge_count: Array.isArray(run.graphData.edges)
        ? run.graphData.edges.length
        : 0,
      summary_hash: comparisonSummaryHash(run.summary),
      previous_run_id: undefined,
      new_run_id: undefined,
      export_type: input.exportType,
      export_id: comparisonExport.id,
      file_name: fileName
    };
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: exportEventId,
        projectId: comparison.projectId,
        eventType: "comparison.exported",
        objectType: "comparison_export",
        objectId: comparisonExport.id,
        actor: "user",
        timestamp: input.now,
        payload: exportPayload
      },
      {
        id: exportNodeId,
        conversationId: comparison.conversationId,
        parentNodeId: runNode?.id,
        label: "Comparison exported",
        memoryScope: "comparison",
        memoryEffect: "none",
        status: "active",
        createdContentRef: comparisonExport.id,
        payload: exportPayload
      },
      runNode
        ? {
            id: `timeline-edge-${runNode.id}-timeline-comparison-exported-${input.suffix}`,
            sourceNodeId: runNode.id,
            edgeType: "export",
            label: "export comparison"
          }
        : undefined
    );

    return {
      state: {
        ...input.state,
        comparisonExports: {
          ...input.state.comparisonExports,
          [comparisonExport.id]: comparisonExport
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      export: comparisonExport
    };
  }

  static keepSummaryAsNote(input: {
    state: RevisionRepositoryState;
    comparisonRunId: string;
    now: string;
    suffix: string;
  }) {
    const run = input.state.comparisonRuns[input.comparisonRunId];
    const comparison = run
      ? input.state.comparisonGraphs[run.comparisonId]
      : undefined;

    if (!run || !comparison || run.status === "deleted") {
      throw new Error("Comparison run not found");
    }

    const defaultScope =
      comparison.scopeType === "selected_text" ||
      comparison.scopeType === "branch" ||
      comparison.scopeType === "document"
        ? comparison.scopeType
        : "comparison";
    const noteResult = AnnotationService.createAnnotationFromManualNote({
      state: input.state,
      projectId: comparison.projectId,
      conversationId: comparison.conversationId,
      content: [
        run.summary,
        run.differenceSummary,
        run.conflictSummary
      ]
        .filter(Boolean)
        .join("\n\n"),
      title: `${comparison.title ?? "Comparison"} summary`,
      scopeType: defaultScope as AnnotationScopeType,
      scopeId:
        defaultScope === "comparison"
          ? comparison.id
          : comparison.scopeId ?? comparison.id,
      sourceType: "comparison_summary",
      sourceId: run.id,
      now: input.now,
      suffix: input.suffix
    });
    const runNode = latestNodeForComparisonRun(noteResult.state, run.id);
    const annotationNode = latestNodeForObject(
      noteResult.state,
      "annotation",
      noteResult.annotation.id
    );
    const eventResult = EventService.createEvent(noteResult.state, {
      id: `event-comparison-summary-kept-as-note-${input.suffix}`,
      projectId: comparison.projectId,
      eventType: "comparison.summary_kept_as_note",
      objectType: "annotation",
      objectId: noteResult.annotation.id,
      actor: "user",
      timestamp: input.now,
      payload: {
        comparison_id: comparison.id,
        comparison_run_id: run.id,
        annotation_id: noteResult.annotation.id
      }
    });
    const edgeResult =
      runNode && annotationNode
        ? TimelineService.createTimelineEdge(
            {
              timelineEdges: noteResult.state.timelineEdges
            },
            {
              id: `timeline-edge-${runNode.id}-${annotationNode.id}-comparison-note`,
              projectId: comparison.projectId,
              sourceNodeId: runNode.id,
              targetNodeId: annotationNode.id,
              edgeType: "annotation_attach",
              label: "keep summary as note",
              status: "active",
              timestamp: input.now,
              payload: {
                comparison_id: comparison.id,
                comparison_run_id: run.id,
                annotation_id: noteResult.annotation.id
              }
            }
          )
        : undefined;

    return {
      state: {
        ...noteResult.state,
        eventLogs: eventResult.eventLogs,
        timelineEdges: edgeResult?.timelineEdges ?? noteResult.state.timelineEdges
      },
      annotation: noteResult.annotation
    };
  }

  static getComparison(state: RevisionRepositoryState, comparisonId: string) {
    return state.comparisonGraphs[comparisonId];
  }

  static getComparisonRun(state: RevisionRepositoryState, runId: string) {
    return state.comparisonRuns[runId];
  }

  static getComparisonsForObject(
    state: RevisionRepositoryState,
    objectType: ComparisonSourceType,
    objectId: string
  ) {
    return Object.values(state.comparisonGraphs).filter((comparison) =>
      (comparison.sourceObjectTypes ?? []).some(
        (type, index) =>
          type === objectType && comparison.sourceObjectIds[index] === objectId
      )
    );
  }

  static getComparisonsByScope(
    state: RevisionRepositoryState,
    scopeType: string,
    scopeId: string
  ) {
    return Object.values(state.comparisonGraphs).filter(
      (comparison) =>
        comparison.scopeType === scopeType && comparison.scopeId === scopeId
    );
  }
}
