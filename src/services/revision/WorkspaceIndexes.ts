import type {
  RevisionRepositoryState,
  WorkspaceIndexDefinition
} from "@/types/revision";

export const WORKSPACE_INDEX_DEFINITIONS: WorkspaceIndexDefinition[] = [
  { id: "idx_event_log_project_conversation_created", entity: "EventLog", fields: ["project_id", "conversation_id", "created_at"] },
  { id: "idx_event_log_target_object", entity: "EventLog", fields: ["target_object_type", "target_object_id"] },
  { id: "idx_timeline_node_project_conversation_created", entity: "TimelineNode", fields: ["project_id", "conversation_id", "created_at"] },
  { id: "idx_timeline_node_project_conversation_path", entity: "TimelineNode", fields: ["project_id", "conversation_id", "active_path_id"] },
  { id: "idx_timeline_node_target_object", entity: "TimelineNode", fields: ["target_object_type", "target_object_id"] },
  { id: "idx_timeline_edge_from_node", entity: "TimelineEdge", fields: ["from_node_id"] },
  { id: "idx_timeline_edge_to_node", entity: "TimelineEdge", fields: ["to_node_id"] },
  { id: "idx_message_project_conversation_thread_created", entity: "Message", fields: ["project_id", "conversation_id", "thread_type", "thread_id", "created_at"] },
  { id: "idx_document_version_project_conversation_number", entity: "DocumentVersion", fields: ["project_id", "conversation_id", "version_number"] },
  { id: "idx_document_version_project_conversation_status", entity: "DocumentVersion", fields: ["project_id", "conversation_id", "status"] },
  { id: "idx_text_selection_project_conversation_source_version", entity: "TextSelection", fields: ["project_id", "conversation_id", "source_document_version_id"] },
  { id: "idx_local_thread_project_conversation_parent_selection", entity: "LocalThread", fields: ["project_id", "conversation_id", "parent_selection_id"] },
  { id: "idx_local_selection_project_conversation_source_thread", entity: "LocalSelection", fields: ["project_id", "conversation_id", "source_local_thread_id"] },
  { id: "idx_annotation_project_conversation_scope_status", entity: "Annotation", fields: ["project_id", "conversation_id", "scope_type", "scope_id", "status"] },
  { id: "idx_revision_branch_project_conversation_source_status", entity: "RevisionBranch", fields: ["project_id", "conversation_id", "source_type", "source_id", "status"] },
  { id: "idx_merge_record_project_conversation_source_status", entity: "MergeRecord", fields: ["project_id", "conversation_id", "source_type", "source_id", "status"] },
  { id: "idx_comparison_graph_project_conversation_scope_status", entity: "ComparisonGraph", fields: ["project_id", "conversation_id", "scope_type", "scope_id", "status"] },
  { id: "idx_comparison_run_comparison_status_created", entity: "ComparisonRun", fields: ["comparison_id", "status", "created_at"] },
  { id: "idx_context_snapshot_project_conversation_thread_created", entity: "ContextSnapshot", fields: ["project_id", "conversation_id", "thread_type", "thread_id", "created_at"] },
  { id: "idx_llm_call_project_conversation_thread_created", entity: "LLMCallRecord", fields: ["project_id", "conversation_id", "thread_type", "thread_id", "created_at"] },
  { id: "idx_object_state_transition_object_created", entity: "ObjectStateTransition", fields: ["object_type", "object_id", "created_at"] },
  { id: "idx_backfill_record_source_backfill_type", entity: "BackfillRecord", fields: ["source_entity_type", "source_entity_id", "backfill_type"] },
  { id: "idx_timeline_node_projection_window", entity: "TimelineNodeProjection", fields: ["project_id", "conversation_id", "active_path_id", "created_at"] },
  { id: "idx_timeline_node_projection_target", entity: "TimelineNodeProjection", fields: ["target_object_type", "target_object_id"] },
  { id: "idx_timeline_graph_snapshot_scope", entity: "TimelineGraphSnapshot", fields: ["project_id", "conversation_id", "snapshot_type", "active_path_id", "status"] },
  { id: "idx_object_relation_source", entity: "ObjectRelationIndex", fields: ["source_object_type", "source_object_id", "relation_type", "status"] },
  { id: "idx_object_relation_related", entity: "ObjectRelationIndex", fields: ["related_object_type", "related_object_id", "relation_type", "status"] },
  { id: "idx_context_item_scope_status", entity: "ContextItemIndex", fields: ["project_id", "conversation_id", "scope_type", "scope_id", "status"] },
  { id: "idx_context_item_thread", entity: "ContextItemIndex", fields: ["thread_id", "memory_scope", "status"] },
  { id: "idx_thread_summary_thread_status", entity: "ThreadSummary", fields: ["thread_type", "thread_id", "status", "updated_at"] },
  { id: "idx_document_chunk_version_range", entity: "DocumentChunk", fields: ["document_version_id", "start_offset", "end_offset", "status"] },
  { id: "idx_context_build_cache_key_status", entity: "ContextBuildCache", fields: ["project_id", "conversation_id", "context_rules_version", "input_fingerprint", "status"] }
].map((definition) => ({
  ...definition,
  metadata: {
    declared_for_phase: definition.id.includes("projection") ||
      definition.id.includes("snapshot") ||
      definition.id.includes("relation") ||
      definition.id.includes("context_item") ||
      definition.id.includes("thread_summary") ||
      definition.id.includes("document_chunk") ||
      definition.id.includes("context_build_cache")
      ? "phase_11"
      : "phase_10",
    logical_index: true
  }
}));

export class WorkspaceIndexService {
  static installIndexes(state: RevisionRepositoryState): RevisionRepositoryState {
    const workspaceIndexes = {
      ...state.workspaceIndexes
    };

    for (const definition of WORKSPACE_INDEX_DEFINITIONS) {
      workspaceIndexes[definition.id] = definition;
    }

    return {
      ...state,
      workspaceIndexes
    };
  }

  static listIndexes(state: Pick<RevisionRepositoryState, "workspaceIndexes">) {
    return Object.values(state.workspaceIndexes);
  }

  static hasRequiredIndexes(state: Pick<RevisionRepositoryState, "workspaceIndexes">) {
    const present = new Set(Object.keys(state.workspaceIndexes));

    return WORKSPACE_INDEX_DEFINITIONS.every((definition) =>
      present.has(definition.id)
    );
  }
}
