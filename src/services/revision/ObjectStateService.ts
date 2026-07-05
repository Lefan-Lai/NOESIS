import type {
  FlexiblePayload,
  MemoryEffect,
  MemoryScope,
  ObjectStateTransitionModel,
  ObjectStatus,
  RevisionEventType,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import { ContextBuildCacheService } from "./ContextBuildCacheService";
import { EventService } from "./EventService";
import { TimelineService } from "./TimelineService";
import { WorkspaceProjectionService } from "./WorkspaceProjectionService";
import { hashContent } from "./DiffService";

type StatefulObject = {
  id: string;
  projectId: string;
  conversationId?: string;
  status: ObjectStatus | string;
  memoryScope?: MemoryScope;
  memoryEffect?: MemoryEffect;
  includeInContext?: boolean;
  memoryPolicy?: string;
  content?: string;
  draftContent?: string;
  sourceText?: string;
  selectedText?: string;
  scope?: MemoryScope;
  payload?: FlexiblePayload;
};

type StateChangeInput = {
  state: RevisionRepositoryState;
  objectType: RevisionObjectType;
  objectId: string;
  reason: string;
  actorType?: "user" | "assistant" | "system";
  actorId?: string;
  now: string;
  suffix: string;
  confirmed?: boolean;
  metadata?: FlexiblePayload;
};

type StateChangeResult = {
  state: RevisionRepositoryState;
  object: StatefulObject;
  transition: ObjectStateTransitionModel;
  timelineNode: RevisionTimelineNode;
};

function collectionForObject(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType
): Record<string, StatefulObject> | undefined {
  switch (objectType) {
    case "message":
      return state.revisionMessages as Record<string, StatefulObject>;
    case "document_version":
      return state.documentVersions as Record<string, StatefulObject>;
    case "text_selection":
      return state.textSelections as Record<string, StatefulObject>;
    case "local_thread":
      return state.localThreads as Record<string, StatefulObject>;
    case "local_selection":
      return state.localSelections as Record<string, StatefulObject>;
    case "annotation":
      return state.annotations as Record<string, StatefulObject>;
    case "revision_branch":
      return state.revisionBranches as Record<string, StatefulObject>;
    case "merge_record":
      return state.mergeRecords as Record<string, StatefulObject>;
    case "comparison_graph":
      return state.comparisonGraphs as Record<string, StatefulObject>;
    case "comparison_run":
      return state.comparisonRuns as Record<string, StatefulObject>;
    case "comparison_export":
      return state.comparisonExports as Record<string, StatefulObject>;
    case "timeline_node":
      return state.timelineNodes as Record<string, StatefulObject>;
    default:
      return undefined;
  }
}

function putObject(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  object: StatefulObject
): Partial<RevisionRepositoryState> {
  switch (objectType) {
    case "message":
      return {
        revisionMessages: {
          ...state.revisionMessages,
          [object.id]: object as RevisionRepositoryState["revisionMessages"][string]
        }
      };
    case "document_version":
      return {
        documentVersions: {
          ...state.documentVersions,
          [object.id]: object as RevisionRepositoryState["documentVersions"][string]
        }
      };
    case "text_selection":
      return {
        textSelections: {
          ...state.textSelections,
          [object.id]: object as RevisionRepositoryState["textSelections"][string]
        }
      };
    case "local_thread":
      return {
        localThreads: {
          ...state.localThreads,
          [object.id]: object as RevisionRepositoryState["localThreads"][string]
        }
      };
    case "local_selection":
      return {
        localSelections: {
          ...state.localSelections,
          [object.id]: object as RevisionRepositoryState["localSelections"][string]
        }
      };
    case "annotation":
      return {
        annotations: {
          ...state.annotations,
          [object.id]: object as RevisionRepositoryState["annotations"][string]
        }
      };
    case "revision_branch":
      return {
        revisionBranches: {
          ...state.revisionBranches,
          [object.id]: object as RevisionRepositoryState["revisionBranches"][string]
        }
      };
    case "merge_record":
      return {
        mergeRecords: {
          ...state.mergeRecords,
          [object.id]: object as RevisionRepositoryState["mergeRecords"][string]
        }
      };
    case "comparison_graph":
      return {
        comparisonGraphs: {
          ...state.comparisonGraphs,
          [object.id]: object as RevisionRepositoryState["comparisonGraphs"][string]
        }
      };
    case "comparison_run":
      return {
        comparisonRuns: {
          ...state.comparisonRuns,
          [object.id]: object as RevisionRepositoryState["comparisonRuns"][string]
        }
      };
    case "comparison_export":
      return {
        comparisonExports: {
          ...state.comparisonExports,
          [object.id]: object as RevisionRepositoryState["comparisonExports"][string]
        }
      };
    case "timeline_node":
      return {
        timelineNodes: {
          ...state.timelineNodes,
          [object.id]: object as RevisionRepositoryState["timelineNodes"][string]
        }
      };
    default:
      return {};
  }
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

function objectText(object: StatefulObject) {
  return (
    object.content ??
    object.draftContent ??
    object.sourceText ??
    object.selectedText ??
    ""
  );
}

function objectScope(objectType: RevisionObjectType, object: StatefulObject): MemoryScope {
  if (object.memoryScope) {
    return object.memoryScope;
  }

  if (object.scope) {
    return object.scope;
  }

  if (objectType === "document_version") {
    return "document";
  }

  if (objectType === "text_selection" || objectType === "local_selection") {
    return "selected_text";
  }

  if (objectType === "annotation") {
    return "annotation";
  }

  if (objectType === "revision_branch") {
    return "branch";
  }

  if (objectType === "merge_record") {
    return "merge";
  }

  if (objectType === "comparison_graph") {
    return "comparison";
  }

  if (objectType === "comparison_run" || objectType === "comparison_export") {
    return "comparison";
  }

  if (objectType === "timeline_node") {
    return "timeline";
  }

  return "conversation";
}

function discardEventType(objectType: RevisionObjectType): RevisionEventType {
  if (objectType === "annotation") {
    return "annotation.discarded";
  }

  if (objectType === "message") {
    return "message.discarded";
  }

  if (objectType === "revision_branch") {
    return "branch.discarded";
  }

  if (objectType === "merge_record") {
    return "merge.discarded";
  }

  if (objectType === "comparison_graph" || objectType === "comparison_run") {
    return "comparison.discarded";
  }

  if (objectType === "local_thread") {
    return "local_thread.discarded";
  }

  return "object.discarded";
}

function deleteEventType(objectType: RevisionObjectType): RevisionEventType {
  if (objectType === "annotation") {
    return "annotation.deleted";
  }

  if (objectType === "message") {
    return "message.deleted";
  }

  if (objectType === "revision_branch") {
    return "branch.deleted";
  }

  if (objectType === "local_thread") {
    return "local_thread.deleted";
  }

  if (objectType === "merge_record") {
    return "merge.deleted";
  }

  if (
    objectType === "comparison_graph" ||
    objectType === "comparison_run" ||
    objectType === "comparison_export"
  ) {
    return "comparison.deleted";
  }

  return "object.deleted";
}

function restoreEventType(objectType: RevisionObjectType): RevisionEventType {
  if (objectType === "annotation") {
    return "annotation.restored";
  }

  if (objectType === "message") {
    return "message.restored";
  }

  if (objectType === "revision_branch") {
    return "branch.restored";
  }

  if (objectType === "local_thread") {
    return "local_thread.restored";
  }

  if (objectType === "merge_record") {
    return "merge.restored";
  }

  if (objectType === "comparison_graph" || objectType === "comparison_run") {
    return "comparison.restored";
  }

  return "object.restored";
}

function statusAfterRestore(objectType: RevisionObjectType): ObjectStatus | string {
  if (objectType === "merge_record") {
    return "pending";
  }

  return "active";
}

function applyStatusPolicy(params: {
  object: StatefulObject;
  objectType: RevisionObjectType;
  nextStatus: ObjectStatus | string;
  now: string;
  memoryPolicy: "excluded_by_default" | "never_include" | "restored";
}) {
  const object = params.object;
  const text = objectText(object);
  const nextPayload: FlexiblePayload = {
    ...object.payload,
    previous_status: object.status,
    status: params.nextStatus,
    state_changed_at: params.now,
    content_hash: text ? hashContent(text) : undefined
  };
  const next: StatefulObject = {
    ...object,
    status: params.nextStatus,
    payload: nextPayload
  };

  if (params.memoryPolicy === "excluded_by_default") {
    next.includeInContext = false;
    next.memoryPolicy = "excluded_by_default";
    next.memoryScope = "discarded";
    next.memoryEffect = "excluded_by_default";
    next.payload = {
      ...next.payload,
      memory_policy: "excluded_by_default"
    };
  }

  if (params.memoryPolicy === "never_include") {
    next.includeInContext = false;
    next.memoryPolicy = "never_include";
    next.memoryScope = "deleted";
    next.memoryEffect = "permanently_excluded";
    next.payload = {
      ...next.payload,
      memory_policy: "never_include",
      redaction_policy: "hide_full_content_from_context_review"
    };
  }

  if (params.memoryPolicy === "restored") {
    next.includeInContext = object.memoryPolicy === "never_include" ? false : true;
    next.memoryPolicy =
      object.memoryPolicy === "never_include" ? "never_include" : "auto_by_scope";
    next.memoryScope = object.payload?.previous_memory_scope as MemoryScope | undefined;
    next.memoryEffect = "restored_to_scope";
    next.payload = {
      ...next.payload,
      memory_policy: next.memoryPolicy,
      restored_at: params.now
    };
  }

  return next;
}

function validateParentRestore(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  object: StatefulObject
) {
  const objectWithParents = object as {
    parentSelectionId?: string;
    sourceSelectionId?: string;
    scopeType?: string;
    scopeObjectId?: string;
    scopeId?: string;
    parentLocalSelectionId?: string;
    sourceLocalSelectionId?: string;
  };
  const scopedSelectedTextId =
    objectWithParents.scopeType === "selected_text"
      ? objectWithParents.scopeId ?? objectWithParents.scopeObjectId
      : undefined;
  const parentSelectionId =
    objectWithParents.parentSelectionId ??
    objectWithParents.sourceSelectionId ??
    scopedSelectedTextId ??
    (object.payload?.source_selection_id as string | undefined) ??
    (object.payload?.parent_selection_id as string | undefined) ??
    (object.payload?.sourceSelectionId as string | undefined);
  const parentLocalSelectionId =
    objectWithParents.parentLocalSelectionId ??
    objectWithParents.sourceLocalSelectionId ??
    (object.payload?.source_local_selection_id as string | undefined) ??
    (object.payload?.parent_local_selection_id as string | undefined);

  if (objectType === "local_thread") {
    const sourceSelectionId =
      (object as RevisionRepositoryState["localThreads"][string])
        .sourceSelectionId;
    const selection = state.textSelections[sourceSelectionId];
    if (selection?.status === "deleted") {
      throw new Error("Cannot restore local thread because its parent selection is deleted");
    }
  }

  if (parentSelectionId && state.textSelections[parentSelectionId]?.status === "deleted") {
    throw new Error("Cannot restore object because its parent selection is deleted");
  }

  if (
    parentLocalSelectionId &&
    state.localSelections[parentLocalSelectionId]?.status === "deleted"
  ) {
    throw new Error("Cannot restore object because its parent local selection is deleted");
  }
}

function parentPathStatus(
  state: RevisionRepositoryState,
  sourceNode?: RevisionTimelineNode
) {
  if (!sourceNode) {
    return "no_parent_node";
  }

  const activePath = TimelineService.getActivePath(
    state,
    sourceNode.projectId,
    sourceNode.conversationId
  );

  if (!activePath) {
    return sourceNode.status === "active" ? "active_without_path" : sourceNode.status;
  }

  const activeNodeIds = new Set(
    TimelineService.getActivePathNodes(
      state,
      sourceNode.projectId,
      sourceNode.conversationId
    ).map((node) => node.id)
  );

  return activeNodeIds.has(sourceNode.id) ? "on_active_path" : "off_active_path";
}

function runStateChange(params: StateChangeInput & {
  nextStatus: ObjectStatus | string;
  eventType: RevisionEventType;
  label: string;
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  memoryPolicy: "excluded_by_default" | "never_include" | "restored";
}): StateChangeResult {
  const collection = collectionForObject(params.state, params.objectType);
  const current = collection?.[params.objectId];

  if (!current) {
    throw new Error(`Object not found: ${params.objectType}:${params.objectId}`);
  }

  if (
    params.objectType === "document_version" &&
    current.status === "active" &&
    params.nextStatus !== "active"
  ) {
    throw new Error("Active document version cannot be discarded or deleted directly");
  }

  const sourceNode = latestNodeForObject(
    params.state,
    params.objectType,
    params.objectId
  );
  const previousMemoryScope = current.memoryScope ?? objectScope(params.objectType, current);
  const updated = applyStatusPolicy({
    object: {
      ...current,
      payload: {
        ...current.payload,
        previous_memory_scope: previousMemoryScope,
        previous_memory_policy: current.memoryPolicy
      }
    },
    objectType: params.objectType,
    nextStatus: params.nextStatus,
    now: params.now,
    memoryPolicy: params.memoryPolicy
  });
  const transitionId = `state-transition-${params.suffix}`;
  const eventId = `event-${params.eventType.replaceAll(".", "-")}-${params.suffix}`;
  const timelineNodeId = `timeline-${params.eventType.replaceAll(".", "-")}-${params.suffix}`;
  const redactionPolicy =
    params.memoryPolicy === "never_include"
      ? "hide_full_content_from_context_review"
      : undefined;
  const transitionPayload = {
    node_id: timelineNodeId,
    project_id: current.projectId,
    conversation_id: current.conversationId,
    event_id: eventId,
    event_type: params.eventType,
    target_object_type: params.objectType,
    target_object_id: params.objectId,
    previous_status: current.status,
    new_status: params.nextStatus,
    state_transition_id: transitionId,
    actor_type: params.actorType ?? "user",
    actor_id: params.actorId,
    created_at: params.now,
    object_type: params.objectType,
    object_id: params.objectId,
    from_status: current.status,
    to_status: params.nextStatus,
    reason: params.reason,
    parent_path_status: parentPathStatus(params.state, sourceNode),
    previous_memory_scope: previousMemoryScope,
    previous_memory_policy: current.memoryPolicy,
    memory_scope: params.memoryScope,
    memory_effect: params.memoryEffect,
    memory_policy:
      params.memoryPolicy === "restored" ? updated.memoryPolicy : params.memoryPolicy,
    redaction_policy: redactionPolicy,
    ...params.metadata
  };
  const eventResult = EventService.createEventWithTimelineNode(
    params.state,
    {
      id: eventId,
      projectId: current.projectId,
      eventType: params.eventType,
      objectType: params.objectType,
      objectId: params.objectId,
      actor: params.actorType ?? "user",
      timestamp: params.now,
      payload: transitionPayload
    },
    {
      id: timelineNodeId,
      conversationId: current.conversationId,
      parentNodeId: sourceNode?.id,
      label: params.label,
      memoryScope: params.memoryScope,
      memoryEffect: params.memoryEffect,
      status:
        params.nextStatus === "deleted" ||
        params.nextStatus === "discarded" ||
        params.nextStatus === "inactive"
          ? (params.nextStatus as ObjectStatus)
          : "active",
      createdContentRef: params.objectId,
      payload: transitionPayload
    },
    sourceNode
      ? {
          id: `timeline-edge-${sourceNode.id}-${timelineNodeId}`,
          sourceNodeId: sourceNode.id,
          edgeType: "sequence",
          label: params.label
        }
      : undefined
  );
  const transition: ObjectStateTransitionModel = {
    id: transitionId,
    transitionId,
    projectId: current.projectId,
    conversationId: current.conversationId,
    objectType: params.objectType,
    objectId: params.objectId,
    fromStatus: current.status as ObjectStatus,
    toStatus: params.nextStatus as ObjectStatus,
    reason: params.reason,
    actorType: params.actorType ?? "user",
    actorId: params.actorId,
    eventId: eventResult.event.id,
    timelineNodeId: eventResult.timelineNode.id,
    createdAt: params.now,
    metadata: transitionPayload
  };
  const updatedCollections = putObject(
    params.state,
    params.objectType,
    updated
  );

  let nextState: RevisionRepositoryState = {
      ...params.state,
      ...updatedCollections,
      objectStateTransitions: {
        ...params.state.objectStateTransitions,
        [transition.id]: transition
      },
      eventLogs: eventResult.eventLogs,
      timelineNodes: eventResult.timelineNodes,
      timelineEdges: eventResult.timelineEdges
    };
  nextState = WorkspaceProjectionService.rebuildContextItemIndex({
    state: nextState,
    projectId: current.projectId,
    conversationId: current.conversationId,
    now: params.now
  });
  nextState = ContextBuildCacheService.invalidateCaches({
    state: nextState,
    reason: params.eventType,
    projectId: current.projectId,
    conversationId: current.conversationId,
    objectType: params.objectType,
    objectId: params.objectId,
    now: params.now
  });

  return {
    state: nextState,
    object: updated,
    transition,
    timelineNode: eventResult.timelineNode
  };
}

export class ObjectStateService {
  static discardObject(input: StateChangeInput) {
    return runStateChange({
      ...input,
      nextStatus: "discarded",
      eventType: discardEventType(input.objectType),
      label: "Object discarded",
      memoryScope: "discarded",
      memoryEffect: "excluded_by_default",
      memoryPolicy: "excluded_by_default"
    });
  }

  static deleteObject(input: StateChangeInput) {
    if (!input.confirmed) {
      throw new Error("Delete requires explicit confirmation");
    }

    return runStateChange({
      ...input,
      nextStatus: "deleted",
      eventType: deleteEventType(input.objectType),
      label: "Object deleted",
      memoryScope: "deleted",
      memoryEffect: "permanently_excluded",
      memoryPolicy: "never_include",
      metadata: {
        redaction_policy: "hide_full_content_from_context_review",
        ...input.metadata
      }
    });
  }

  static restoreObject(input: StateChangeInput) {
    const collection = collectionForObject(input.state, input.objectType);
    const object = collection?.[input.objectId];

    if (!object) {
      throw new Error(`Object not found: ${input.objectType}:${input.objectId}`);
    }

    if (object.status === "deleted") {
      throw new Error("Deleted objects cannot be restored through the normal restore flow");
    }

    if (object.status !== "discarded") {
      throw new Error("Only discarded objects can be restored");
    }

    validateParentRestore(input.state, input.objectType, object);

    return runStateChange({
      ...input,
      nextStatus: statusAfterRestore(input.objectType),
      eventType: restoreEventType(input.objectType),
      label: "Object restored",
      memoryScope: objectScope(input.objectType, object),
      memoryEffect: "restored_to_scope",
      memoryPolicy: "restored"
    });
  }

  static getObjectStatus(
    state: RevisionRepositoryState,
    objectType: RevisionObjectType,
    objectId: string
  ) {
    return collectionForObject(state, objectType)?.[objectId]?.status;
  }

  static assertObjectCanEnterContext(
    state: RevisionRepositoryState,
    objectType: RevisionObjectType,
    objectId: string
  ) {
    const status = ObjectStateService.getObjectStatus(state, objectType, objectId);

    if (!status) {
      throw new Error(`Object not found: ${objectType}:${objectId}`);
    }

    if (status === "deleted") {
      throw new Error("deleted_memory_never_included");
    }

    if (status === "discarded") {
      throw new Error("discarded_excluded_by_default");
    }

    if (status === "inactive") {
      throw new Error("inactive_path_excluded");
    }

    if (status === "superseded") {
      throw new Error("superseded_answer_excluded");
    }

    if (status === "pending") {
      throw new Error("pending_proposal_not_confirmed");
    }

    if (status === "cancelled") {
      throw new Error("cancelled_object_excluded");
    }

    if (status === "failed") {
      throw new Error("failed_generation_excluded");
    }

    if (status === "conflict") {
      throw new Error("conflict_not_resolved");
    }

    return true;
  }
}
