import type {
  RevertRecordModel,
  RevisionRepositoryState,
  RevisionTimelineNode,
  TimelinePathModel
} from "@/types/revision";
import { DiffService, type TextDiff } from "./DiffService";
import { DocumentVersionService } from "./DocumentVersionService";
import { EventService } from "./EventService";
import { TimelineService } from "./TimelineService";

type RevertInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  targetNodeId: string;
  now: string;
  suffix: string;
  actor?: "user" | "assistant" | "system";
};

type RevertPreview = {
  targetNode: RevisionTimelineNode;
  currentActiveNode?: RevisionTimelineNode;
  previousActiveDocumentVersionId?: string;
  newActiveDocumentVersionId?: string;
  inactiveNodeIds: string[];
  affectedNodeIds: string[];
  documentDiff?: TextDiff;
  contextChanges: {
    excludedAfterRevert: string[];
    includedActiveDocumentVersionId?: string;
    exclusionReason: string;
  };
};

function activeNodeForInput(input: {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
}) {
  return TimelineService.getActiveTimelineNode(
    input.state,
    input.projectId,
    input.conversationId
  );
}

function ensurePreview(input: RevertInput): RevertPreview {
  const targetNode = input.state.timelineNodes[input.targetNodeId];

  if (!targetNode) {
    throw new Error("Target timeline node not found");
  }

  if (targetNode.status === "deleted") {
    throw new Error("Cannot revert to a deleted timeline node");
  }

  const currentActiveNode = activeNodeForInput(input);
  const currentDocumentVersion = DocumentVersionService.getActiveDocumentVersion(
    input.state,
    input.projectId,
    input.conversationId
  );
  const targetDocumentVersion =
    TimelineService.getNearestDocumentVersionForNode(
      input.state,
      targetNode.id
    ) ?? currentDocumentVersion;

  if (
    currentActiveNode?.id === targetNode.id &&
    currentDocumentVersion?.id === targetDocumentVersion?.id
  ) {
    throw new Error("Target timeline node is already active");
  }

  const inactiveNodes = TimelineService.getNodesAfterTargetOnCurrentActivePath(
    input.state,
    input.projectId,
    input.conversationId,
    targetNode.id
  );
  const documentDiff =
    currentDocumentVersion &&
    targetDocumentVersion &&
    currentDocumentVersion.id !== targetDocumentVersion.id
      ? DiffService.createTextDiff(
          currentDocumentVersion.content,
          targetDocumentVersion.content
        )
      : undefined;

  return {
    targetNode,
    currentActiveNode,
    previousActiveDocumentVersionId: currentDocumentVersion?.id,
    newActiveDocumentVersionId: targetDocumentVersion?.id,
    inactiveNodeIds: inactiveNodes.map((node) => node.id),
    affectedNodeIds: inactiveNodes.map((node) => node.id),
    documentDiff,
    contextChanges: {
      excludedAfterRevert: inactiveNodes.map((node) => node.id),
      includedActiveDocumentVersionId: targetDocumentVersion?.id,
      exclusionReason: "inactive_path_excluded"
    }
  };
}

function rootNodeIdForTarget(
  state: RevisionRepositoryState,
  targetNodeId: string
) {
  const ancestors = TimelineService.getAncestors(state, targetNodeId);
  return ancestors[ancestors.length - 1]?.id ?? targetNodeId;
}

function createInactiveNodeEvents(input: {
  state: RevisionRepositoryState;
  nodes: RevisionTimelineNode[];
  now: string;
  suffix: string;
}) {
  let nextState = input.state;

  for (const node of input.nodes) {
    const eventResult = EventService.createEventWithTimelineNode(
      nextState,
      {
        id: `event-timeline-node-marked-inactive-${node.id}-${input.suffix}`,
        projectId: node.projectId,
        eventType: "timeline.node_marked_inactive",
        objectType: "timeline_node",
        objectId: node.id,
        actor: "system",
        timestamp: input.now,
        payload: {
          target_node_id: node.id,
          previous_status: node.status,
          new_status: "inactive",
          reason: "active_path_reverted"
        }
      },
      {
        id: `timeline-node-marked-inactive-${node.id}-${input.suffix}`,
        conversationId: node.conversationId,
        parentNodeId: node.id,
        label: "Timeline node marked inactive",
        memoryScope: "inactive_path",
        memoryEffect: "excluded_inactive",
        status: "inactive",
        createdContentRef: node.id,
        payload: {
          target_node_id: node.id,
          previous_status: node.status,
          new_status: "inactive",
          reason: "active_path_reverted"
        }
      },
      {
        id: `timeline-edge-${node.id}-timeline-node-marked-inactive-${node.id}-${input.suffix}`,
        sourceNodeId: node.id,
        edgeType: "active_path",
        label: "marked inactive",
        status: "inactive"
      }
    );

    nextState = {
      ...nextState,
      eventLogs: eventResult.eventLogs,
      timelineNodes: eventResult.timelineNodes,
      timelineEdges: eventResult.timelineEdges
    };
  }

  return nextState;
}

function updateActiveDocumentVersion(input: {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  previousActiveDocumentVersionId?: string;
  newActiveDocumentVersionId?: string;
  now: string;
}) {
  if (!input.newActiveDocumentVersionId) {
    return input.state;
  }

  const target = input.state.documentVersions[input.newActiveDocumentVersionId];

  if (!target) {
    return input.state;
  }

  const project = input.state.projects[input.projectId];
  const conversation = input.conversationId
    ? input.state.mainConversations[input.conversationId]
    : undefined;
  const documentVersions = Object.fromEntries(
    Object.entries(input.state.documentVersions).map(([id, version]) => {
      const inCurrentScope =
        version.projectId === input.projectId &&
        (!input.conversationId || version.conversationId === input.conversationId);

      if (!inCurrentScope) {
        return [id, version];
      }

      if (version.id === target.id) {
        return [
          id,
          {
            ...version,
            status: "active" as const,
            metadata: {
              ...version.metadata,
              activated_by_revert_at: input.now
            }
          }
        ];
      }

      if (version.status === "active") {
        return [
          id,
          {
            ...version,
            status: "superseded" as const,
            metadata: {
              ...version.metadata,
              deactivated_by_revert_at: input.now,
              replaced_by_active_document_version_id: target.id
            }
          }
        ];
      }

      return [id, version];
    })
  ) as RevisionRepositoryState["documentVersions"];

  return {
    ...input.state,
    projects: project
      ? {
          ...input.state.projects,
          [project.id]: {
            ...project,
            activeDocumentVersionId: target.id,
            updatedAt: input.now
          }
        }
      : input.state.projects,
    mainConversations:
      conversation && input.conversationId
        ? {
            ...input.state.mainConversations,
            [conversation.id]: {
              ...conversation,
              activeDocumentVersionId: target.id,
              updatedAt: input.now
            }
        }
      : input.state.mainConversations,
    documentVersions
  };
}

export class RevertService {
  static previewRevert(input: RevertInput): RevertPreview {
    return ensurePreview(input);
  }

  static recordRevertPreview(input: RevertInput): {
    state: RevisionRepositoryState;
    preview: RevertPreview;
    timelineNode: RevisionTimelineNode;
  } {
    const preview = ensurePreview(input);
    const eventId = `event-timeline-revert-previewed-${input.suffix}`;
    const timelineNodeId = `timeline-revert-previewed-${input.suffix}`;
    const activePath = TimelineService.getActivePath(
      input.state,
      input.projectId,
      input.conversationId
    );
    const payload = {
      node_id: timelineNodeId,
      project_id: input.projectId,
      conversation_id: input.conversationId,
      event_id: eventId,
      event_type: "timeline.revert_previewed",
      source_object_type: "timeline_node",
      source_object_id: preview.currentActiveNode?.id,
      target_object_type: "timeline_node",
      target_object_id: preview.targetNode.id,
      from_node_id: preview.currentActiveNode?.id,
      to_node_id: preview.targetNode.id,
      inactive_node_ids: preview.inactiveNodeIds,
      affected_node_ids: preview.affectedNodeIds,
      previous_active_document_version_id:
        preview.previousActiveDocumentVersionId,
      new_active_document_version_id: preview.newActiveDocumentVersionId,
      document_version_before_id: preview.previousActiveDocumentVersionId,
      document_version_after_id: preview.newActiveDocumentVersionId,
      previous_active_path_id: activePath?.id,
      new_active_path_id: undefined,
      memory_scope: "timeline",
      memory_effect: "none"
    };
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: eventId,
        projectId: input.projectId,
        eventType: "timeline.revert_previewed",
        objectType: "timeline_node",
        objectId: preview.targetNode.id,
        actor: input.actor ?? "user",
        timestamp: input.now,
        payload
      },
      {
        id: timelineNodeId,
        conversationId: preview.targetNode.conversationId ?? input.conversationId,
        parentNodeId: preview.currentActiveNode?.id,
        label: "Timeline revert previewed",
        memoryScope: "timeline",
        memoryEffect: "none",
        status: "active_marker",
        payload
      }
    );

    return {
      state: {
        ...input.state,
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      preview,
      timelineNode: eventResult.timelineNode
    };
  }

  static confirmRevert(input: RevertInput): {
    state: RevisionRepositoryState;
    preview: RevertPreview;
    revertRecord: RevertRecordModel;
    timelinePath: TimelinePathModel;
    timelineNode: RevisionTimelineNode;
  } {
    const preview = ensurePreview(input);
    const inactiveNodeSet = new Set(preview.inactiveNodeIds);
    const inactiveNodes = preview.inactiveNodeIds
      .map((nodeId) => input.state.timelineNodes[nodeId])
      .filter(Boolean);
    const markResult = TimelineService.markNodesInactive(
      input.state,
      preview.inactiveNodeIds
    );
    let nextState: RevisionRepositoryState = {
      ...input.state,
      timelineNodes: markResult.timelineNodes
    };

    nextState = createInactiveNodeEvents({
      state: nextState,
      nodes: inactiveNodes,
      now: input.now,
      suffix: input.suffix
    });
    const activePathNodeIds = TimelineService.getAncestors(
      nextState,
      preview.targetNode.id
    ).map((node) => node.id);
    const reactivateResult = TimelineService.markNodesActiveOnPath(
      nextState,
      activePathNodeIds,
      input.now
    );
    nextState = {
      ...nextState,
      timelineNodes: reactivateResult.timelineNodes
    };

    const pathResult = TimelineService.createContinuationPathFromNode({
      state: nextState,
      projectId: input.projectId,
      conversationId: preview.targetNode.conversationId ?? input.conversationId,
      nodeId: preview.targetNode.id,
      rootNodeId: rootNodeIdForTarget(nextState, preview.targetNode.id),
      now: input.now,
      suffix: input.suffix,
      metadata: {
        created_by: "revert",
        inactive_node_ids: preview.inactiveNodeIds,
        reactivated_node_ids: reactivateResult.reactivatedNodeIds
      }
    });
    nextState = {
      ...nextState,
      timelinePaths: pathResult.timelinePaths
    };

    const continuationEvent = EventService.createEvent(
      nextState,
      {
        id: `event-timeline-continuation-path-created-${input.suffix}`,
        projectId: input.projectId,
        eventType: "timeline.continuation_path_created",
        objectType: "timeline_path",
        objectId: pathResult.timelinePath.id,
        actor: "system",
        timestamp: input.now,
        payload: {
          path_id: pathResult.timelinePath.id,
          created_from_node_id: preview.targetNode.id,
          head_node_id: preview.targetNode.id,
          inactive_node_ids: preview.inactiveNodeIds,
          reactivated_node_ids: reactivateResult.reactivatedNodeIds
        }
      }
    );
    nextState = {
      ...nextState,
      eventLogs: continuationEvent.eventLogs
    };

    const revertId = `revert-${input.suffix}`;
    const eventId = `event-timeline-reverted-${input.suffix}`;
    const timelineNodeId = `timeline-reverted-${input.suffix}`;
    const previousActivePathId = TimelineService.getActivePath(
      input.state,
      input.projectId,
      input.conversationId
    )?.id;
    const revertPayload = {
      node_id: timelineNodeId,
      project_id: input.projectId,
      conversation_id: input.conversationId,
      event_id: eventId,
      event_type: "timeline.reverted",
      source_object_type: "timeline_node",
      source_object_id: preview.currentActiveNode?.id,
      target_object_type: "timeline_node",
      target_object_id: preview.targetNode.id,
      document_version_before_id: preview.previousActiveDocumentVersionId,
      document_version_after_id: preview.newActiveDocumentVersionId,
      revert_id: revertId,
      from_node_id: preview.currentActiveNode?.id,
      to_node_id: preview.targetNode.id,
      from_path_id: previousActivePathId,
      to_path_id: pathResult.timelinePath.id,
      previous_active_path_id: previousActivePathId,
      new_active_path_id: pathResult.timelinePath.id,
      previous_active_document_version_id:
        preview.previousActiveDocumentVersionId,
      new_active_document_version_id: preview.newActiveDocumentVersionId,
      affected_node_ids: preview.affectedNodeIds,
      inactive_node_ids: preview.inactiveNodeIds,
      active_path_node_ids: activePathNodeIds,
      reactivated_node_ids: reactivateResult.reactivatedNodeIds,
      memory_scope: "timeline",
      memory_effect: "changes_active_path"
    };
    const revertEventResult = EventService.createEventWithTimelineNode(
      nextState,
      {
        id: eventId,
        projectId: input.projectId,
        eventType: "timeline.reverted",
        objectType: "timeline_node",
        objectId: preview.targetNode.id,
        actor: input.actor ?? "user",
        timestamp: input.now,
        payload: revertPayload
      },
      {
        id: timelineNodeId,
        conversationId: preview.targetNode.conversationId ?? input.conversationId,
        parentNodeId: preview.currentActiveNode?.id,
        label: "Timeline reverted",
        memoryScope: "timeline",
        memoryEffect: "changes_active_path",
        status: "active_marker",
        createdContentRef: revertId,
        payload: revertPayload
      }
    );
    nextState = {
      ...nextState,
      eventLogs: revertEventResult.eventLogs,
      timelineNodes: revertEventResult.timelineNodes,
      timelineEdges: revertEventResult.timelineEdges
    };

    if (preview.currentActiveNode) {
      const edgeResult = TimelineService.createTimelineEdge(
        {
          timelineEdges: nextState.timelineEdges
        },
        {
          id: `timeline-edge-revert-${preview.currentActiveNode.id}-${preview.targetNode.id}-${input.suffix}`,
          projectId: input.projectId,
          sourceNodeId: preview.currentActiveNode.id,
          targetNodeId: preview.targetNode.id,
          edgeType: "revert",
          label: "revert",
          status: "active",
          timestamp: input.now,
          payload: {
            revert_id: revertId,
            inactive_node_ids: preview.inactiveNodeIds
          }
        }
      );
      nextState = {
        ...nextState,
        timelineEdges: edgeResult.timelineEdges
      };
    }

    const activePathResult = TimelineService.setActivePath(
      nextState,
      input.projectId,
      input.conversationId,
      pathResult.timelinePath.id,
      input.now
    );
    const activeNodeResult = TimelineService.setActiveNode(
      {
        ...nextState,
        projects: activePathResult.projects,
        mainConversations: activePathResult.mainConversations
      },
      input.projectId,
      input.conversationId,
      preview.targetNode.id,
      input.now
    );
    nextState = {
      ...nextState,
      timelinePaths: activePathResult.timelinePaths,
      projects: activeNodeResult.projects,
      mainConversations: activeNodeResult.mainConversations
    };
    nextState = updateActiveDocumentVersion({
      state: nextState,
      projectId: input.projectId,
      conversationId: input.conversationId,
      previousActiveDocumentVersionId: preview.previousActiveDocumentVersionId,
      newActiveDocumentVersionId: preview.newActiveDocumentVersionId,
      now: input.now
    });

    const activePathChanged = EventService.createEvent(
      nextState,
      {
        id: `event-timeline-active-path-changed-${input.suffix}`,
        projectId: input.projectId,
        eventType: "timeline.active_path_changed",
        objectType: "timeline_path",
        objectId: pathResult.timelinePath.id,
        actor: "system",
        timestamp: input.now,
        payload: {
          active_timeline_path_id: pathResult.timelinePath.id,
          active_timeline_node_id: preview.targetNode.id,
          previous_active_node_id: preview.currentActiveNode?.id,
          inactive_node_ids: preview.inactiveNodeIds,
          reactivated_node_ids: reactivateResult.reactivatedNodeIds
        }
      }
    );
    nextState = {
      ...nextState,
      eventLogs: activePathChanged.eventLogs
    };

    const revertRecord: RevertRecordModel = {
      id: revertId,
      revertId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      fromNodeId: preview.currentActiveNode?.id ?? "",
      toNodeId: preview.targetNode.id,
      fromPathId: revertPayload.from_path_id,
      toPathId: pathResult.timelinePath.id,
      previousActiveDocumentVersionId: preview.previousActiveDocumentVersionId,
      newActiveDocumentVersionId: preview.newActiveDocumentVersionId,
      affectedNodeIds: preview.affectedNodeIds,
      inactiveNodeIds: Array.from(inactiveNodeSet),
      createdBy: input.actor ?? "user",
      createdAt: input.now,
      eventId: revertEventResult.event.id,
      timelineNodeId: revertEventResult.timelineNode.id,
      status: "completed",
      metadata: revertPayload
    };

    return {
      state: {
        ...nextState,
        revertRecords: {
          ...nextState.revertRecords,
          [revertRecord.id]: revertRecord
        }
      },
      preview,
      revertRecord,
      timelinePath: pathResult.timelinePath,
      timelineNode: revertEventResult.timelineNode
    };
  }
}
