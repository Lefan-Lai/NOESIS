import type {
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TimelineGraph
} from "@/types/revision";

function payloadString(node: RevisionTimelineNode, key: string) {
  const value = node.payload?.[key];

  return typeof value === "string" ? value : undefined;
}

function contextSnapshotId(node: RevisionTimelineNode) {
  return (
    payloadString(node, "context_snapshot_id") ??
    payloadString(node, "contextSnapshotId") ??
    node.affectedContextRefs?.[0]
  );
}

function llmCallId(node: RevisionTimelineNode) {
  return payloadString(node, "llm_call_id") ?? payloadString(node, "llmCallId");
}

function edgeType(edge: RevisionTimelineEdge) {
  return edge.edgeType === "chronological" ? "sequence" : edge.edgeType;
}

export function toTimelineApiGraph(graph: TimelineGraph) {
  return {
    project_id: graph.projectId,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      event_id: node.eventId,
      event_type: node.eventType,
      target_object_type: node.targetObjectType,
      target_object_id: node.targetObjectId,
      memory_scope: node.memoryScope,
      memory_effect: node.memoryEffect,
      comparison_id: payloadString(node, "comparison_id"),
      comparison_run_id: payloadString(node, "comparison_run_id"),
      source_object_types: node.payload?.source_object_types,
      source_object_ids: node.payload?.source_object_ids,
      scope_type: payloadString(node, "scope_type"),
      scope_id: payloadString(node, "scope_id"),
      active_path_id: node.activePathId ?? payloadString(node, "active_path_id"),
      previous_status: payloadString(node, "previous_status"),
      new_status: payloadString(node, "new_status"),
      revert_id: payloadString(node, "revert_id"),
      state_transition_id: payloadString(node, "state_transition_id"),
      llm_call_id: llmCallId(node),
      context_snapshot_id: contextSnapshotId(node),
      conversation_id: node.conversationId,
      parent_node_id: node.parentNodeId,
      model: node.model,
      label: node.label,
      actor: node.actor,
      status: node.status,
      created_content_ref: node.createdContentRef,
      affected_context_refs: node.affectedContextRefs,
      timestamp: node.timestamp,
      payload: node.payload
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      edge_type: edgeType(edge),
      from_node_id: edge.sourceNodeId,
      to_node_id: edge.targetNodeId,
      memory_effect: edge.payload?.memory_effect,
      revert_id: edge.payload?.revert_id,
      state_transition_id: edge.payload?.state_transition_id,
      status: edge.status,
      label: edge.label,
      timestamp: edge.timestamp,
      payload: edge.payload
    }))
  };
}
