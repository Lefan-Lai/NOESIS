import type {
  AnnotationMemoryPolicy,
  AnnotationModel,
  AnnotationScopeType,
  AnnotationSourceType,
  FlexiblePayload,
  MemoryEffect,
  MemoryScope,
  ObjectStatus,
  RevisionEventType,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineNode
} from "@/types/revision";
import { EventService } from "./EventService";

type AnnotationScopeInput = {
  scopeType: AnnotationScopeType;
  scopeId: string;
};

type AnnotationSourceInput = {
  sourceType: AnnotationSourceType;
  sourceId?: string;
  sourceText?: string;
  sourceMessageId?: string;
  sourceSelectionId?: string;
  sourceLocalSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceBranchId?: string;
  sourceDocumentVersionId?: string;
};

type CreateAnnotationInput = AnnotationScopeInput &
  AnnotationSourceInput & {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    content: string;
    title?: string;
    memoryPolicy?: AnnotationMemoryPolicy;
    createdBy?: AnnotationModel["createdBy"];
    sourceTimelineNodeId?: string;
    now: string;
    suffix: string;
    eventType?: Extract<
      RevisionEventType,
      | "annotation.created"
      | "annotation.kept_from_answer"
      | "annotation.kept_from_selection"
    >;
  };

type UpdateAnnotationPatch = Partial<
  Pick<
    AnnotationModel,
    | "content"
    | "title"
    | "scopeType"
    | "scopeId"
    | "memoryPolicy"
    | "includeInContext"
    | "payload"
  >
>;

function memoryScopeForAnnotation(scopeType: AnnotationScopeType): MemoryScope {
  if (scopeType === "selected_text") {
    return "selected_text";
  }

  if (scopeType === "nested_local_thread") {
    return "nested_local_thread";
  }

  if (scopeType === "local_thread") {
    return "local_thread";
  }

  if (scopeType === "branch") {
    return "branch";
  }

  if (scopeType === "comparison") {
    return "comparison";
  }

  return scopeType;
}

function includeByDefault(policy: AnnotationMemoryPolicy) {
  return (
    policy === "auto_by_scope" ||
    policy === "always_include_when_scope_matches"
  );
}

function objectTypeForScope(
  scopeType: AnnotationScopeType
): RevisionObjectType | undefined {
  if (scopeType === "selected_text") {
    return "text_selection";
  }

  if (scopeType === "local_thread" || scopeType === "nested_local_thread") {
    return "local_thread";
  }

  if (scopeType === "branch") {
    return "revision_branch";
  }

  if (scopeType === "conversation") {
    return "main_conversation";
  }

  if (scopeType === "document") {
    return "document_version";
  }

  if (scopeType === "comparison") {
    return "comparison_graph";
  }

  if (scopeType === "project") {
    return "project";
  }

  return undefined;
}

function hashAnnotationContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  let hash = 2166136261;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `note-${(hash >>> 0).toString(36)}`;
}

function findLatestNodeForObject(
  state: RevisionRepositoryState,
  objectType: RevisionObjectType,
  objectId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === objectType &&
        node.targetObjectId === objectId &&
        node.status === "active"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function findScopeNode(
  state: RevisionRepositoryState,
  scopeType: AnnotationScopeType,
  scopeId: string
) {
  const objectType = objectTypeForScope(scopeType);

  return objectType
    ? findLatestNodeForObject(state, objectType, scopeId)
    : undefined;
}

function eventPayload(annotation: AnnotationModel): FlexiblePayload {
  const scopeType = annotation.scopeType ?? "project";
  const scopeId = annotation.scopeId ?? annotation.scopeObjectId;
  const sourceId =
    annotation.sourceId ??
    annotation.sourceLocalSelectionId ??
    annotation.sourceMessageId ??
    annotation.sourceSelectionId ??
    annotation.sourceLocalThreadId ??
    annotation.sourceBranchId ??
    annotation.sourceDocumentVersionId ??
    scopeId;
  const contentHash = hashAnnotationContent(annotation.content);

  return {
    annotationId: annotation.id,
    conversationId: annotation.conversationId,
    content_hash: contentHash,
    contentHash,
    scopeType,
    scopeId,
    scope_type: scopeType,
    scope_id: scopeId,
    sourceType: annotation.sourceType,
    sourceId,
    source_type: annotation.sourceType,
    source_id: sourceId,
    sourceMessageId: annotation.sourceMessageId,
    sourceSelectionId: annotation.sourceSelectionId,
    sourceLocalSelectionId: annotation.sourceLocalSelectionId,
    sourceLocalThreadId: annotation.sourceLocalThreadId,
    sourceBranchId: annotation.sourceBranchId,
    sourceDocumentVersionId: annotation.sourceDocumentVersionId,
    selection_id: annotation.sourceSelectionId,
    local_selection_id: annotation.sourceLocalSelectionId,
    local_thread_id: annotation.sourceLocalThreadId,
    branch_id: annotation.sourceBranchId,
    document_version_id:
      annotation.sourceDocumentVersionId ??
      (scopeType === "document" ? scopeId : undefined),
    memoryPolicy: annotation.memoryPolicy,
    memory_policy: annotation.memoryPolicy,
    status: annotation.status
  };
}

function sourceObjectFromAnnotation(
  annotation: AnnotationModel,
  sourceNode?: RevisionTimelineNode
): {
  sourceObjectType?: RevisionObjectType;
  sourceObjectId?: string;
} {
  if (sourceNode) {
    return {
      sourceObjectType: sourceNode.targetObjectType,
      sourceObjectId: sourceNode.targetObjectId
    };
  }

  if (annotation.sourceLocalSelectionId) {
    return {
      sourceObjectType: "local_selection",
      sourceObjectId: annotation.sourceLocalSelectionId
    };
  }

  if (annotation.sourceMessageId) {
    return {
      sourceObjectType: "message",
      sourceObjectId: annotation.sourceMessageId
    };
  }

  if (annotation.sourceSelectionId) {
    return {
      sourceObjectType: "text_selection",
      sourceObjectId: annotation.sourceSelectionId
    };
  }

  if (annotation.sourceLocalThreadId) {
    return {
      sourceObjectType: "local_thread",
      sourceObjectId: annotation.sourceLocalThreadId
    };
  }

  if (annotation.sourceBranchId) {
    return {
      sourceObjectType: "revision_branch",
      sourceObjectId: annotation.sourceBranchId
    };
  }

  if (annotation.sourceDocumentVersionId) {
    return {
      sourceObjectType: "document_version",
      sourceObjectId: annotation.sourceDocumentVersionId
    };
  }

  return {
    sourceObjectType: annotation.scopeType
      ? objectTypeForScope(annotation.scopeType)
      : undefined,
    sourceObjectId: annotation.scopeId ?? annotation.scopeObjectId
  };
}

function applyAnnotationEvent(params: {
  state: RevisionRepositoryState;
  annotation: AnnotationModel;
  eventType: RevisionEventType;
  actor?: "user" | "assistant" | "system";
  now: string;
  suffix: string;
  label: string;
  memoryEffect: MemoryEffect;
  sourceNode?: RevisionTimelineNode;
  payload?: FlexiblePayload;
}) {
  const eventId = `event-${params.eventType.replaceAll(".", "-")}-${params.suffix}`;
  const timelineNodeId = `timeline-${params.eventType.replaceAll(".", "-")}-${params.suffix}`;
  const actorType = params.actor ?? "user";
  const actorId = params.annotation.createdBy ?? actorType;
  const sourceObject = sourceObjectFromAnnotation(
    params.annotation,
    params.sourceNode
  );
  const basePayload = eventPayload(params.annotation);
  const scopeType = params.annotation.scopeType ?? "project";
  const scopeId = params.annotation.scopeId ?? params.annotation.scopeObjectId;
  const sourceId = basePayload.source_id as string | undefined;
  const memoryPolicy = params.annotation.memoryPolicy;
  const annotationPayload = {
    content_hash: basePayload.content_hash,
    scope_type: scopeType,
    scope_id: scopeId,
    source_type: params.annotation.sourceType,
    source_id: sourceId,
    memory_policy: memoryPolicy
  };
  const auditPayload = {
    ...basePayload,
    source_object_type: sourceObject.sourceObjectType,
    source_object_id: sourceObject.sourceObjectId,
    actor_type: actorType,
    actor_id: actorId,
    ...params.payload
  };
  const eventResult = EventService.createEventWithTimelineNode(
    params.state,
    {
      id: eventId,
      projectId: params.annotation.projectId,
      eventType: params.eventType,
      objectType: "annotation",
      objectId: params.annotation.id,
      actor: actorType,
      timestamp: params.now,
      payload: auditPayload
    },
    {
      id: timelineNodeId,
      conversationId: params.annotation.conversationId,
      parentNodeId: params.sourceNode?.id,
      label: params.label,
      memoryScope: "annotation",
      memoryEffect: params.memoryEffect,
      status: params.annotation.status,
      createdContentRef: params.annotation.id,
      payload: {
        node_id: timelineNodeId,
        project_id: params.annotation.projectId,
        conversation_id: params.annotation.conversationId,
        event_id: eventId,
        event_type: params.eventType,
        target_object_type: "annotation",
        target_object_id: params.annotation.id,
        source_object_type: sourceObject.sourceObjectType,
        source_object_id: sourceObject.sourceObjectId,
        selection_id: params.annotation.sourceSelectionId,
        local_selection_id: params.annotation.sourceLocalSelectionId,
        local_thread_id: params.annotation.sourceLocalThreadId,
        branch_id: params.annotation.sourceBranchId,
        document_version_id:
          params.annotation.sourceDocumentVersionId ??
          (scopeType === "document" ? scopeId : undefined),
        scope_type: scopeType,
        scope_id: scopeId,
        memory_scope: "annotation",
        memory_effect: params.memoryEffect,
        status: params.annotation.status,
        created_at: params.now,
        actor_type: actorType,
        actor_id: actorId,
        payload: {
          ...annotationPayload,
          ...params.payload
        },
        ...basePayload
      }
    },
    params.sourceNode
      ? {
          id: `timeline-edge-${params.sourceNode.id}-timeline-${params.eventType.replaceAll(".", "-")}-${params.suffix}`,
          sourceNodeId: params.sourceNode.id,
          edgeType: "annotation_attach",
          label: "annotation memory"
        }
      : undefined
  );

  return {
    event: eventResult.event,
    timelineNode: eventResult.timelineNode,
    timelineEdge: eventResult.timelineEdge,
    state: {
      ...params.state,
      eventLogs: eventResult.eventLogs,
      timelineNodes: eventResult.timelineNodes,
      timelineEdges: eventResult.timelineEdges
    }
  };
}

export class AnnotationService {
  static createAnnotation(input: CreateAnnotationInput): {
    state: RevisionRepositoryState;
    annotation: AnnotationModel;
    timelineNode: RevisionTimelineNode;
    created: true;
  } {
    const memoryPolicy = input.memoryPolicy ?? "auto_by_scope";
    const annotation: AnnotationModel = {
      id: `annotation-${input.suffix}`,
      annotationId: `annotation-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      content: input.content,
      title: input.title,
      scope: memoryScopeForAnnotation(input.scopeType),
      scopeObjectId: input.scopeId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceText: input.sourceText,
      sourceMessageId: input.sourceMessageId,
      sourceSelectionId: input.sourceSelectionId,
      sourceLocalSelectionId: input.sourceLocalSelectionId,
      sourceLocalThreadId: input.sourceLocalThreadId,
      sourceBranchId: input.sourceBranchId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      memoryPolicy,
      status: "active",
      includeInContext: includeByDefault(memoryPolicy),
      createdBy: input.createdBy ?? "user",
      createdAt: input.now,
      updatedAt: input.now,
      discardedAt: null,
      deletedAt: null,
      payload: {
        metadata: {},
        content_hash: hashAnnotationContent(input.content),
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        source_type: input.sourceType,
        source_id: input.sourceId,
        memory_policy: memoryPolicy
      }
    };
    const scopeNode = input.sourceTimelineNodeId
      ? input.state.timelineNodes[input.sourceTimelineNodeId]
      : findScopeNode(input.state, input.scopeType, input.scopeId);
    const eventResult = applyAnnotationEvent({
      state: input.state,
      annotation,
      eventType: input.eventType ?? "annotation.created",
      now: input.now,
      suffix: input.suffix,
      label:
        input.eventType === "annotation.kept_from_answer"
          ? "Kept answer as note"
          : input.eventType === "annotation.kept_from_selection"
            ? "Kept selection as note"
            : "Annotation created",
      memoryEffect: "adds_annotation_memory",
      sourceNode: scopeNode
    });

    return {
      state: {
        ...eventResult.state,
        annotations: {
          ...input.state.annotations,
          [annotation.id]: annotation
        }
      },
      annotation,
      timelineNode: eventResult.timelineNode,
      created: true
    };
  }

  static createAnnotationFromManualNote(
    input: Omit<CreateAnnotationInput, "sourceType" | "eventType"> &
      Partial<Pick<CreateAnnotationInput, "sourceType">>
  ) {
    return AnnotationService.createAnnotation({
      ...input,
      sourceType: input.sourceType ?? "manual_note",
      eventType: "annotation.created"
    });
  }

  static createAnnotationFromAnswer(
    input: Omit<CreateAnnotationInput, "sourceType" | "eventType"> & {
      sourceType?: Extract<
        AnnotationSourceType,
        | "keep_as_note"
        | "assistant_answer"
        | "local_answer"
        | "nested_local_answer"
        | "branch_draft"
      >;
    }
  ) {
    return AnnotationService.createAnnotation({
      ...input,
      sourceType: input.sourceType ?? "keep_as_note",
      eventType: "annotation.kept_from_answer"
    });
  }

  static createAnnotationFromLocalSelection(
    input: Omit<CreateAnnotationInput, "sourceType" | "eventType"> &
      Partial<Pick<CreateAnnotationInput, "sourceType">>
  ) {
    return AnnotationService.createAnnotation({
      ...input,
      sourceType: input.sourceType ?? "selected_fragment",
      eventType: "annotation.kept_from_selection"
    });
  }

  static updateAnnotation(input: {
    state: RevisionRepositoryState;
    annotationId: string;
    patch: UpdateAnnotationPatch;
    now: string;
    suffix: string;
  }) {
    const current = input.state.annotations[input.annotationId];

    if (!current) {
      throw new Error("Annotation not found");
    }

    const scopeChanged =
      (input.patch.scopeType && input.patch.scopeType !== current.scopeType) ||
      (input.patch.scopeId && input.patch.scopeId !== current.scopeId);
    const oldScopeType = current.scopeType ?? "project";
    const oldScopeId = current.scopeId ?? current.scopeObjectId;
    const nextScopeType = input.patch.scopeType ?? current.scopeType ?? "project";
    const nextScopeId = input.patch.scopeId ?? current.scopeId ?? current.projectId;
    const updated: AnnotationModel = {
      ...current,
      ...input.patch,
      scope: memoryScopeForAnnotation(nextScopeType),
      scopeObjectId: nextScopeId,
      scopeType: nextScopeType,
      scopeId: nextScopeId,
      includeInContext:
        input.patch.includeInContext ??
        includeByDefault(input.patch.memoryPolicy ?? current.memoryPolicy ?? "auto_by_scope"),
      updatedAt: input.now,
      payload: {
        ...current.payload,
        ...input.patch.payload,
        content_hash: hashAnnotationContent(input.patch.content ?? current.content),
        scope_type: nextScopeType,
        scope_id: nextScopeId,
        source_type: current.sourceType,
        source_id: current.sourceId,
        memory_policy: input.patch.memoryPolicy ?? current.memoryPolicy
      }
    };
    const sourceNode = findLatestNodeForObject(
      input.state,
      "annotation",
      current.id
    );
    const eventResult = applyAnnotationEvent({
      state: input.state,
      annotation: updated,
      eventType: scopeChanged ? "annotation.scope_changed" : "annotation.updated",
      now: input.now,
      suffix: input.suffix,
      label: scopeChanged ? "Annotation scope changed" : "Annotation updated",
      memoryEffect: "adds_annotation_memory",
      sourceNode,
      payload: {
        old_content_hash: hashAnnotationContent(current.content),
        new_content_hash: hashAnnotationContent(updated.content),
        old_scope_type: oldScopeType,
        old_scope_id: oldScopeId,
        new_scope_type: nextScopeType,
        new_scope_id: nextScopeId,
        changed_fields: Object.keys(input.patch),
        patch: input.patch
      }
    });

    return {
      state: {
        ...eventResult.state,
        annotations: {
          ...input.state.annotations,
          [updated.id]: updated
        }
      },
      annotation: updated,
      timelineNode: eventResult.timelineNode
    };
  }

  static discardAnnotation(input: {
    state: RevisionRepositoryState;
    annotationId: string;
    now: string;
    suffix: string;
  }) {
    return AnnotationService.changeAnnotationStatus({
      ...input,
      status: "discarded",
      memoryPolicy: "excluded_by_default",
      eventType: "annotation.discarded",
      label: "Annotation discarded",
      memoryEffect: "excluded_by_default",
      discardedAt: input.now
    });
  }

  static deleteAnnotation(input: {
    state: RevisionRepositoryState;
    annotationId: string;
    now: string;
    suffix: string;
  }) {
    return AnnotationService.changeAnnotationStatus({
      ...input,
      status: "deleted",
      memoryPolicy: "never_include",
      eventType: "annotation.deleted",
      label: "Annotation deleted",
      memoryEffect: "permanently_excluded",
      deletedAt: input.now
    });
  }

  static restoreAnnotation(input: {
    state: RevisionRepositoryState;
    annotationId: string;
    now: string;
    suffix: string;
  }) {
    return AnnotationService.changeAnnotationStatus({
      ...input,
      status: "active",
      memoryPolicy: "auto_by_scope",
      eventType: "annotation.restored",
      label: "Annotation restored",
      memoryEffect: "adds_annotation_memory",
      discardedAt: null,
      deletedAt: null
    });
  }

  private static changeAnnotationStatus(input: {
    state: RevisionRepositoryState;
    annotationId: string;
    status: ObjectStatus;
    memoryPolicy: AnnotationMemoryPolicy;
    eventType: RevisionEventType;
    label: string;
    memoryEffect: MemoryEffect;
    discardedAt?: string | null;
    deletedAt?: string | null;
    now: string;
    suffix: string;
  }) {
    const current = input.state.annotations[input.annotationId];

    if (!current) {
      throw new Error("Annotation not found");
    }

    const updated: AnnotationModel = {
      ...current,
      status: input.status,
      memoryPolicy: input.memoryPolicy,
      includeInContext: includeByDefault(input.memoryPolicy),
      updatedAt: input.now,
      discardedAt:
        input.discardedAt === undefined
          ? current.discardedAt
          : input.discardedAt,
      deletedAt:
        input.deletedAt === undefined ? current.deletedAt : input.deletedAt,
      payload: {
        ...current.payload,
        content_hash: hashAnnotationContent(current.content),
        scope_type: current.scopeType ?? "project",
        scope_id: current.scopeId ?? current.scopeObjectId,
        source_type: current.sourceType,
        source_id: current.sourceId,
        memory_policy: input.memoryPolicy,
        status: input.status
      }
    };
    const sourceNode = findLatestNodeForObject(
      input.state,
      "annotation",
      current.id
    );
    const eventResult = applyAnnotationEvent({
      state: input.state,
      annotation: updated,
      eventType: input.eventType,
      now: input.now,
      suffix: input.suffix,
      label: input.label,
      memoryEffect: input.memoryEffect,
      sourceNode
    });

    return {
      state: {
        ...eventResult.state,
        annotations: {
          ...input.state.annotations,
          [updated.id]: updated
        }
      },
      annotation: updated,
      timelineNode: eventResult.timelineNode
    };
  }

  static getAnnotation(
    state: Pick<RevisionRepositoryState, "annotations">,
    annotationId: string
  ) {
    return state.annotations[annotationId];
  }

  static getAnnotationsByScope(
    state: Pick<RevisionRepositoryState, "annotations">,
    scopeType: AnnotationScopeType,
    scopeId: string
  ) {
    return Object.values(state.annotations).filter(
      (annotation) =>
        (annotation.scopeType ?? annotation.scope) === scopeType &&
        (annotation.scopeId ?? annotation.scopeObjectId) === scopeId
    );
  }

  static getRelatedAnnotations(input: {
    state: Pick<RevisionRepositoryState, "annotations">;
    scopeType?: AnnotationScopeType;
    scopeId?: string;
    sourceType?: AnnotationSourceType;
    sourceId?: string;
  }) {
    return Object.values(input.state.annotations).filter((annotation) => {
      if (
        input.scopeType &&
        (annotation.scopeType ?? annotation.scope) !== input.scopeType
      ) {
        return false;
      }

      if (
        input.scopeId &&
        (annotation.scopeId ?? annotation.scopeObjectId) !== input.scopeId
      ) {
        return false;
      }

      if (input.sourceType && annotation.sourceType !== input.sourceType) {
        return false;
      }

      if (input.sourceId && annotation.sourceId !== input.sourceId) {
        return false;
      }

      return true;
    });
  }
}
