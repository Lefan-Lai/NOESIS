import type {
  DocumentVersionModel,
  EventLogRecord,
  ManualEditDraftModel,
  RevisionRepositoryState,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";
import {
  DiffService,
  hashContent,
  type TextDiff,
  type TextDiffChangedRange
} from "./DiffService";
import { DocumentChunkService } from "./DocumentChunkService";
import { EventService } from "./EventService";

type ServiceResult = {
  state: RevisionRepositoryState;
};

type InitialVersionInput = {
  state: RevisionRepositoryState;
  projectId: string;
  projectName?: string;
  conversationId?: string;
  conversationTitle?: string;
  documentId: string;
  messageId: string;
  content: string;
  title?: string;
  sourceTimelineNodeId?: string;
  now: string;
  suffix: string;
};

type ManualEditDraftInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  baseDocumentVersionId?: string;
  draftContent?: string;
  editedRangeStart?: number;
  editedRangeEnd?: number;
  now: string;
  suffix: string;
};

type ConfirmManualEditSuccess = ServiceResult & {
  ok: true;
  conflict: false;
  draft: ManualEditDraftModel;
  documentVersion: DocumentVersionModel;
  previousDocumentVersion: DocumentVersionModel;
  diff: TextDiff;
  event: EventLogRecord;
  timelineNode: RevisionTimelineNode;
  timelineEdge?: RevisionTimelineEdge;
  affectedSelections: TextSelectionModel[];
};

type ConfirmManualEditConflict = {
  ok: false;
  conflict: true;
  baseDocumentVersionId: string;
  activeDocumentVersionId?: string;
  baseContentHash: string;
  activeContentHash?: string;
  diffAgainstCurrent?: TextDiff;
};

function activeConversationIdMatches(
  version: DocumentVersionModel,
  conversationId?: string
) {
  return !conversationId || version.conversationId === conversationId;
}

function versionNumber(version: DocumentVersionModel) {
  return version.versionNumber ?? 1;
}

function latestNodeForObject(
  state: RevisionRepositoryState,
  objectType: RevisionTimelineNode["targetObjectType"],
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

function rangesOverlap(
  selection: TextSelectionModel,
  ranges: TextDiffChangedRange[]
) {
  if (
    selection.startOffset === undefined ||
    selection.endOffset === undefined
  ) {
    return false;
  }

  return ranges.some(
    (range) =>
      selection.startOffset! < range.oldEnd &&
      selection.endOffset! > range.oldStart
  );
}

function projectWithActiveVersion(params: {
  state: RevisionRepositoryState;
  projectId: string;
  projectName?: string;
  activeDocumentVersionId: string;
  activeTimelineNodeId?: string;
  now: string;
}) {
  const current = params.state.projects[params.projectId];

  return {
    ...(current ?? {
      id: params.projectId,
      name: params.projectName ?? "Default",
      status: "active" as const,
      createdAt: params.now,
      updatedAt: params.now
    }),
    activeDocumentVersionId: params.activeDocumentVersionId,
    activeTimelineNodeId:
      params.activeTimelineNodeId ??
      current?.activeTimelineNodeId,
    updatedAt: params.now
  };
}

function conversationWithActiveVersion(params: {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  conversationTitle?: string;
  activeDocumentVersionId: string;
  activeTimelineNodeId?: string;
  now: string;
}) {
  if (!params.conversationId) {
    return undefined;
  }

  const current = params.state.mainConversations[params.conversationId];

  return {
    ...(current ?? {
      id: params.conversationId,
      projectId: params.projectId,
      title: params.conversationTitle ?? "Main Conversation",
      status: "active" as const,
      createdAt: params.now,
      updatedAt: params.now
    }),
    activeDocumentVersionId: params.activeDocumentVersionId,
    activeTimelineNodeId:
      params.activeTimelineNodeId ??
      current?.activeTimelineNodeId,
    updatedAt: params.now
  };
}

function draftEventLabel(eventType: string) {
  if (eventType === "document.edit_draft.created") {
    return "Manual edit draft created";
  }

  if (eventType === "document.edit_draft.updated") {
    return "Manual edit draft updated";
  }

  if (eventType === "document.edit_draft.cancelled") {
    return "Manual edit draft cancelled";
  }

  return "Manual edit diff generated";
}

function createDraftEventWithTimeline(input: {
  state: RevisionRepositoryState;
  draft: ManualEditDraftModel;
  eventType:
    | "document.edit_draft.created"
    | "document.edit_draft.updated"
    | "document.edit_draft.cancelled"
    | "document.manual_edit.diff_generated";
  now: string;
  suffix: string;
  payload?: Record<string, unknown>;
}) {
  const baseNode = latestNodeForObject(
    input.state,
    "document_version",
    input.draft.baseDocumentVersionId
  );
  const latestDraftNode = latestNodeForObject(
    input.state,
    "manual_edit_draft",
    input.draft.id
  );
  const sourceNode = latestDraftNode ?? baseNode;
  const eventName = input.eventType.replaceAll(".", "-");

  return EventService.createEventWithTimelineNode(
    input.state,
    {
      id: `event-${eventName}-${input.suffix}`,
      projectId: input.draft.projectId,
      eventType: input.eventType,
      objectType: "manual_edit_draft",
      objectId: input.draft.id,
      actor: input.eventType === "document.manual_edit.diff_generated"
        ? "system"
        : "user",
      timestamp: input.now,
      payload: {
        edit_draft_id: input.draft.id,
        base_document_version_id: input.draft.baseDocumentVersionId,
        base_content_hash: input.draft.baseContentHash,
        draft_content_hash: input.draft.draftContentHash,
        status: input.draft.status,
        memory_effect: "excluded_by_default",
        ...input.payload
      }
    },
    {
      id: `timeline-${eventName}-${input.suffix}`,
      conversationId: input.draft.conversationId,
      parentNodeId: sourceNode?.id,
      label: draftEventLabel(input.eventType),
      memoryScope: "document",
      memoryEffect: input.eventType === "document.edit_draft.cancelled"
        ? "none"
        : "excluded_by_default",
      status: "draft",
      createdContentRef: input.draft.id,
      payload: {
        target_object_type: "manual_edit_draft",
        target_object_id: input.draft.id,
        source_object_type: sourceNode?.targetObjectType ?? "document_version",
        source_object_id: sourceNode?.targetObjectId ?? input.draft.baseDocumentVersionId,
        edit_draft_id: input.draft.id,
        base_document_version_id: input.draft.baseDocumentVersionId,
        base_content_hash: input.draft.baseContentHash,
        draft_content_hash: input.draft.draftContentHash,
        status: input.draft.status,
        memory_effect: input.eventType === "document.edit_draft.cancelled"
          ? "none"
          : "excluded_by_default",
        ...input.payload
      }
    },
    sourceNode
      ? {
          id: `timeline-edge-${sourceNode.id}-timeline-${eventName}-${input.suffix}`,
          sourceNodeId: sourceNode.id,
          edgeType: "sequence",
          label: "manual edit draft"
        }
      : undefined
  );
}

export class DocumentVersionService {
  static getActiveDocumentVersion(
    state: Pick<
      RevisionRepositoryState,
      "projects" | "mainConversations" | "documentVersions"
    >,
    projectId: string,
    conversationId?: string
  ) {
    const conversationActiveId = conversationId
      ? state.mainConversations[conversationId]?.activeDocumentVersionId
      : undefined;
    const projectActiveId = state.projects[projectId]?.activeDocumentVersionId;
    const explicitId = conversationActiveId ?? projectActiveId;
    const explicitVersion = explicitId
      ? state.documentVersions[explicitId]
      : undefined;

    if (
      explicitVersion &&
      explicitVersion.status === "active" &&
      explicitVersion.projectId === projectId &&
      activeConversationIdMatches(explicitVersion, conversationId)
    ) {
      return explicitVersion;
    }

    return Object.values(state.documentVersions)
      .filter(
        (version) =>
          version.projectId === projectId &&
          version.status === "active" &&
          activeConversationIdMatches(version, conversationId)
      )
      .sort((a, b) => versionNumber(b) - versionNumber(a))[0];
  }

  static createInitialDocumentVersionFromAnswer(
    input: InitialVersionInput
  ): ServiceResult & {
    documentVersion: DocumentVersionModel;
    event?: EventLogRecord;
    timelineNode?: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
    created: boolean;
  } {
    const existing = Object.values(input.state.documentVersions).find(
      (version) =>
        version.projectId === input.projectId &&
        version.sourceType === "initial_answer" &&
        version.sourceId === input.messageId
    );

    if (existing) {
      return {
        state: input.state,
        documentVersion: existing,
        created: false
      };
    }

    const previousActive = DocumentVersionService.getActiveDocumentVersion(
      input.state,
      input.projectId,
      input.conversationId
    );
    const eventId = `event-document-version-created-${input.suffix}`;
    const timelineNodeId = `timeline-document-version-created-${input.suffix}`;
    const documentVersion: DocumentVersionModel = {
      id: `document-version-${input.suffix}`,
      documentVersionId: `document-version-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      documentId: input.documentId,
      parentDocumentVersionId: previousActive?.id ?? null,
      parentVersionId: previousActive?.id ?? null,
      versionNumber: previousActive ? versionNumber(previousActive) + 1 : 1,
      content: input.content,
      contentHash: hashContent(input.content),
      createdFromEventId: eventId,
      createdFromTimelineNodeId: timelineNodeId,
      sourceType: "initial_answer",
      sourceId: input.messageId,
      createdBy: "assistant",
      sourceEventId: eventId,
      status: "active",
      title: input.title,
      createdAt: input.now,
      metadata: {
        memory_policy: "active_document_version"
      },
      payload: {
        content_hash: hashContent(input.content),
        source_type: "initial_answer",
        source_id: input.messageId,
        version_number: previousActive ? versionNumber(previousActive) + 1 : 1
      }
    };
    const sourceNode =
      (input.sourceTimelineNodeId &&
        input.state.timelineNodes[input.sourceTimelineNodeId]) ||
      (previousActive
        ? latestNodeForObject(input.state, "document_version", previousActive.id)
        : undefined);
    const eventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: eventId,
        projectId: input.projectId,
        eventType: "document.version.created",
        objectType: "document_version",
        objectId: documentVersion.id,
        actor: "assistant",
        timestamp: input.now,
        payload: {
          document_version_id: documentVersion.id,
          parent_document_version_id: previousActive?.id ?? null,
          version_number: documentVersion.versionNumber,
          content_hash: documentVersion.contentHash,
          source_type: "initial_answer",
          source_id: input.messageId
        }
      },
      {
        id: timelineNodeId,
        conversationId: input.conversationId,
        parentNodeId: sourceNode?.id,
        label: "Document version created",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: documentVersion.id,
        payload: {
          document_version_id: documentVersion.id,
          document_version_after_id: documentVersion.id,
          parent_document_version_id: previousActive?.id ?? null,
          version_number: documentVersion.versionNumber,
          content_hash: documentVersion.contentHash,
          source_type: "initial_answer",
          source_id: input.messageId,
          memory_effect: "updates_document_memory"
        }
      },
      sourceNode
        ? {
            id: `timeline-edge-${sourceNode.id}-${timelineNodeId}`,
            sourceNodeId: sourceNode.id,
            edgeType: "sequence",
            label: previousActive ? "next document version" : "answer to document"
          }
        : undefined
    );
    const project = projectWithActiveVersion({
      state: input.state,
      projectId: input.projectId,
      projectName: input.projectName,
      activeDocumentVersionId: documentVersion.id,
      activeTimelineNodeId: eventResult.timelineNode.id,
      now: input.now
    });
    const conversation = conversationWithActiveVersion({
      state: input.state,
      projectId: input.projectId,
      conversationId: input.conversationId,
      conversationTitle: input.conversationTitle,
      activeDocumentVersionId: documentVersion.id,
      activeTimelineNodeId: eventResult.timelineNode.id,
      now: input.now
    });
    const documentVersions = {
      ...input.state.documentVersions,
      ...(previousActive
        ? {
            [previousActive.id]: {
              ...previousActive,
              status: "superseded" as const
            }
          }
        : {}),
      [documentVersion.id]: documentVersion
    };

    let nextState: RevisionRepositoryState = {
        ...input.state,
        projects: {
          ...input.state.projects,
          [project.id]: project
        },
        mainConversations: conversation
          ? {
              ...input.state.mainConversations,
              [conversation.id]: conversation
            }
          : input.state.mainConversations,
        documentVersions,
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
    };
    nextState = DocumentChunkService.createChunksForDocumentVersion({
      state: nextState,
      documentVersionId: documentVersion.id,
      now: input.now
    }).state;

    return {
      state: nextState,
      documentVersion,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge,
      created: true
    };
  }

  static createManualEditDraft(input: ManualEditDraftInput): ServiceResult & {
    draft: ManualEditDraftModel;
    event?: EventLogRecord;
    timelineNode?: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
  } {
    const baseDocumentVersionId =
      input.baseDocumentVersionId ??
      DocumentVersionService.getActiveDocumentVersion(
        input.state,
        input.projectId,
        input.conversationId
      )?.id;
    const base = baseDocumentVersionId
      ? input.state.documentVersions[baseDocumentVersionId]
      : undefined;

    if (!base || base.status === "deleted") {
      throw new Error("Active base document version not found");
    }

    const existingDraft = Object.values(input.state.manualEditDrafts).find(
      (draft) =>
        draft.projectId === input.projectId &&
        draft.conversationId === input.conversationId &&
        draft.baseDocumentVersionId === base.id &&
        (draft.status === "draft" || draft.status === "ready_for_review")
    );

    if (existingDraft) {
      return {
        state: input.state,
        draft: existingDraft
      };
    }

    const draftContent = input.draftContent ?? base.content;
    const draft: ManualEditDraftModel = {
      id: `manual-edit-draft-${input.suffix}`,
      editDraftId: `manual-edit-draft-${input.suffix}`,
      projectId: input.projectId,
      conversationId: input.conversationId,
      baseDocumentVersionId: base.id,
      baseContentHash: base.contentHash ?? hashContent(base.content),
      draftContent,
      draftContentHash: hashContent(draftContent),
      editedRangeStart: input.editedRangeStart,
      editedRangeEnd: input.editedRangeEnd,
      status: "draft",
      createdBy: "user",
      createdAt: input.now,
      updatedAt: input.now,
      metadata: {
        memory_policy: "draft_not_confirmed"
      },
      payload: {
        base_document_version_id: base.id,
        base_content_hash: base.contentHash ?? hashContent(base.content),
        draft_content_hash: hashContent(draftContent),
        memory_effect: "excluded_by_default"
      }
    };

    const eventResult = createDraftEventWithTimeline({
      state: input.state,
      draft,
      eventType: "document.edit_draft.created",
      now: input.now,
      suffix: input.suffix
    });

    return {
      state: {
        ...input.state,
        manualEditDrafts: {
          ...input.state.manualEditDrafts,
          [draft.id]: draft
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      draft,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge
    };
  }

  static updateManualEditDraft(input: {
    state: RevisionRepositoryState;
    draftId: string;
    content: string;
    editedRangeStart?: number;
    editedRangeEnd?: number;
    now: string;
    suffix?: string;
  }): ServiceResult & {
    draft: ManualEditDraftModel;
    event?: EventLogRecord;
    timelineNode?: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
  } {
    const current = input.state.manualEditDrafts[input.draftId];

    if (!current || current.status === "confirmed") {
      throw new Error("Editable manual edit draft not found");
    }

    const draft: ManualEditDraftModel = {
      ...current,
      draftContent: input.content,
      draftContentHash: hashContent(input.content),
      editedRangeStart: input.editedRangeStart ?? current.editedRangeStart,
      editedRangeEnd: input.editedRangeEnd ?? current.editedRangeEnd,
      updatedAt: input.now,
      payload: {
        ...current.payload,
        draft_content_hash: hashContent(input.content)
      }
    };
    const suffix =
      input.suffix ??
      `${draft.id}-${input.now.replaceAll(":", "-").replaceAll(".", "-")}`;
    const eventResult = createDraftEventWithTimeline({
      state: input.state,
      draft,
      eventType: "document.edit_draft.updated",
      now: input.now,
      suffix,
      payload: {
        old_draft_content_hash: current.draftContentHash,
        new_draft_content_hash: draft.draftContentHash,
        changed_fields: ["draftContent"]
      }
    });

    return {
      state: {
        ...input.state,
        manualEditDrafts: {
          ...input.state.manualEditDrafts,
          [draft.id]: draft
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      draft,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge
    };
  }

  static generateDiffForDraft(input: {
    state: RevisionRepositoryState;
    draftId: string;
    now?: string;
    suffix?: string;
  }): ServiceResult & {
    draft: ManualEditDraftModel;
    diff: TextDiff;
    event?: EventLogRecord;
    timelineNode?: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
  } {
    const draft = input.state.manualEditDrafts[input.draftId];
    const base = draft
      ? input.state.documentVersions[draft.baseDocumentVersionId]
      : undefined;

    if (!draft || !base) {
      throw new Error("Manual edit draft or base version not found");
    }

    const diff = DiffService.createTextDiff(base.content, draft.draftContent);
    const readyDraft: ManualEditDraftModel = {
      ...draft,
      status: "ready_for_review",
      updatedAt: input.now ?? draft.updatedAt,
      metadata: {
        ...draft.metadata,
        last_diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      }
    };
    const now = input.now ?? draft.updatedAt;
    const suffix =
      input.suffix ??
      `${readyDraft.id}-${now.replaceAll(":", "-").replaceAll(".", "-")}`;
    const eventResult = createDraftEventWithTimeline({
      state: input.state,
      draft: readyDraft,
      eventType: "document.manual_edit.diff_generated",
      now,
      suffix,
      payload: {
        old_content_hash: diff.oldContentHash,
        new_content_hash: diff.newContentHash,
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      }
    });

    return {
      state: {
        ...input.state,
        manualEditDrafts: {
          ...input.state.manualEditDrafts,
          [readyDraft.id]: readyDraft
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      draft: readyDraft,
      diff,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge
    };
  }

  static cancelManualEditDraft(input: {
    state: RevisionRepositoryState;
    draftId: string;
    now: string;
    suffix: string;
  }): ServiceResult & {
    draft: ManualEditDraftModel;
    event: EventLogRecord;
    timelineNode: RevisionTimelineNode;
    timelineEdge?: RevisionTimelineEdge;
  } {
    const current = input.state.manualEditDrafts[input.draftId];

    if (!current || current.status === "confirmed") {
      throw new Error("Cancellable manual edit draft not found");
    }

    const draft: ManualEditDraftModel = {
      ...current,
      status: "cancelled",
      updatedAt: input.now,
      metadata: {
        ...current.metadata,
        cancelled_at: input.now
      }
    };
    const eventResult = createDraftEventWithTimeline({
      state: input.state,
      draft,
      eventType: "document.edit_draft.cancelled",
      now: input.now,
      suffix: input.suffix
    });

    return {
      state: {
        ...input.state,
        manualEditDrafts: {
          ...input.state.manualEditDrafts,
          [draft.id]: draft
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      draft,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge
    };
  }

  static confirmManualEdit(input: {
    state: RevisionRepositoryState;
    draftId: string;
    now: string;
    suffix: string;
  }): ConfirmManualEditSuccess | ConfirmManualEditConflict {
    const draft = input.state.manualEditDrafts[input.draftId];
    const base = draft
      ? input.state.documentVersions[draft.baseDocumentVersionId]
      : undefined;

    if (!draft || !base) {
      throw new Error("Manual edit draft or base version not found");
    }

    const active = DocumentVersionService.getActiveDocumentVersion(
      input.state,
      draft.projectId,
      draft.conversationId
    );
    const baseHash = base.contentHash ?? hashContent(base.content);
    const activeHash = active
      ? active.contentHash ?? hashContent(active.content)
      : undefined;

    if (!active || active.id !== base.id || draft.baseContentHash !== baseHash) {
      return {
        ok: false,
        conflict: true,
        baseDocumentVersionId: base.id,
        activeDocumentVersionId: active?.id,
        baseContentHash: draft.baseContentHash,
        activeContentHash: activeHash,
        diffAgainstCurrent: active
          ? DiffService.createTextDiff(active.content, draft.draftContent)
          : undefined
      };
    }

    const diff = DiffService.createTextDiff(base.content, draft.draftContent);
    const eventId = `event-document-manual-edited-${input.suffix}`;
    const timelineNodeId = `timeline-document-manual-edited-${input.suffix}`;
    const nextVersion: DocumentVersionModel = {
      id: `document-version-${input.suffix}`,
      documentVersionId: `document-version-${input.suffix}`,
      projectId: draft.projectId,
      conversationId: draft.conversationId,
      documentId: base.documentId,
      parentDocumentVersionId: base.id,
      parentVersionId: base.id,
      versionNumber: versionNumber(base) + 1,
      content: draft.draftContent,
      contentHash: hashContent(draft.draftContent),
      createdFromEventId: eventId,
      createdFromTimelineNodeId: timelineNodeId,
      sourceType: "manual_edit",
      sourceId: draft.id,
      createdBy: "user",
      sourceEventId: eventId,
      status: "active",
      title: base.title,
      createdAt: input.now,
      metadata: {
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      },
      payload: {
        parent_document_version_id: base.id,
        version_number: versionNumber(base) + 1,
        content_hash: hashContent(draft.draftContent),
        source_type: "manual_edit",
        source_id: draft.id
      }
    };
    const affectedSelectionPlans = Object.values(input.state.textSelections)
      .filter((selection) => selection.sourceDocumentVersionId === base.id)
      .map((selection) => {
        const overlapWithChangedRange = rangesOverlap(
          selection,
          diff.changedRanges
        );
        const nextAnchorStatus: NonNullable<TextSelectionModel["anchorStatus"]> = overlapWithChangedRange
          ? "needs_review"
          : "previous_version";

        return {
          selection,
          nextAnchorStatus,
          overlapWithChangedRange,
          reason: overlapWithChangedRange
            ? "selection_range_overlaps_changed_range"
            : "selection_from_previous_version_not_overlapping_change"
        };
      });
    const affectedSelectionIds = affectedSelectionPlans.map(
      (plan) => plan.selection.id
    );
    const previousNode = latestNodeForObject(
      input.state,
      "document_version",
      base.id
    );
    const versionCreatedResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: `event-document-version-created-${input.suffix}`,
        projectId: draft.projectId,
        eventType: "document.version.created",
        objectType: "document_version",
        objectId: nextVersion.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          document_version_id: nextVersion.id,
          parent_document_version_id: base.id,
          version_number: nextVersion.versionNumber,
          content_hash: nextVersion.contentHash,
          source_type: "manual_edit",
          source_id: draft.id
        }
      },
      {
        id: `timeline-document-version-created-${input.suffix}`,
        conversationId: draft.conversationId,
        parentNodeId: previousNode?.id,
        label: "Document version created",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: nextVersion.id,
        payload: {
          document_version_id: nextVersion.id,
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          parent_document_version_id: base.id,
          version_number: nextVersion.versionNumber,
          content_hash: nextVersion.contentHash,
          source_type: "manual_edit",
          source_id: draft.id,
          memory_effect: "updates_document_memory"
        }
      },
      previousNode
        ? {
            id: `timeline-edge-${previousNode.id}-timeline-document-version-created-${input.suffix}`,
            sourceNodeId: previousNode.id,
            edgeType: "sequence",
            label: "new document version"
          }
        : undefined
    );
    const eventResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: versionCreatedResult.eventLogs,
        timelineNodes: versionCreatedResult.timelineNodes,
        timelineEdges: versionCreatedResult.timelineEdges
      },
      {
        id: eventId,
        projectId: draft.projectId,
        eventType: "document.manual_edited",
        objectType: "document_version",
        objectId: nextVersion.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          source_object_type: "manual_edit_draft",
          source_object_id: draft.id,
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          old_content_hash: baseHash,
          new_content_hash: nextVersion.contentHash,
          diff_summary: diff.summary,
          changed_ranges: diff.changedRanges,
          affected_selection_ids: affectedSelectionIds
        }
      },
      {
        id: timelineNodeId,
        conversationId: draft.conversationId,
        parentNodeId: previousNode?.id,
        label: "Manual document edit confirmed",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: nextVersion.id,
        payload: {
          node_id: timelineNodeId,
          project_id: draft.projectId,
          conversation_id: draft.conversationId,
          event_id: eventId,
          event_type: "document.manual_edited",
          target_object_type: "document_version",
          target_object_id: nextVersion.id,
          source_object_type: "manual_edit_draft",
          source_object_id: draft.id,
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          actor_type: "user",
          actor_id: "user",
          memory_scope: "document",
          memory_effect: "updates_document_memory",
          status: "active",
          created_at: input.now,
          old_content_hash: baseHash,
          new_content_hash: nextVersion.contentHash,
          diff_summary: diff.summary,
          changed_ranges: diff.changedRanges,
          affected_selection_ids: affectedSelectionIds
        }
      },
      previousNode
        ? {
            id: `timeline-edge-${previousNode.id}-${timelineNodeId}`,
            sourceNodeId: previousNode.id,
            edgeType: "sequence",
            label: "manual edit"
          }
        : undefined
    );
    const activatedEventResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      {
        id: `event-document-version-activated-${input.suffix}`,
        projectId: draft.projectId,
        eventType: "document.version.activated",
        objectType: "document_version",
        objectId: nextVersion.id,
        actor: "system",
        timestamp: input.now,
        payload: {
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          active_document_version_id: nextVersion.id
        }
      },
      {
        id: `timeline-document-version-activated-${input.suffix}`,
        conversationId: draft.conversationId,
        parentNodeId: eventResult.timelineNode.id,
        label: "Document version activated",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: nextVersion.id,
        payload: {
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          active_document_version_id: nextVersion.id,
          memory_effect: "updates_document_memory"
        }
      },
      {
        id: `timeline-edge-${eventResult.timelineNode.id}-timeline-document-version-activated-${input.suffix}`,
        sourceNodeId: eventResult.timelineNode.id,
        edgeType: "sequence",
        label: "activate document version"
      }
    );
    const confirmedDraft: ManualEditDraftModel = {
      ...draft,
      status: "confirmed",
      updatedAt: input.now,
      metadata: {
        ...draft.metadata,
        confirmed_document_version_id: nextVersion.id,
        diff_summary: diff.summary
      }
    };
    const project = projectWithActiveVersion({
      state: input.state,
      projectId: draft.projectId,
      activeDocumentVersionId: nextVersion.id,
      activeTimelineNodeId: timelineNodeId,
      now: input.now
    });
    const conversation = conversationWithActiveVersion({
      state: input.state,
      projectId: draft.projectId,
      conversationId: draft.conversationId,
      activeDocumentVersionId: nextVersion.id,
      activeTimelineNodeId: timelineNodeId,
      now: input.now
    });
    let nextState: RevisionRepositoryState = {
      ...input.state,
      projects: {
        ...input.state.projects,
        [project.id]: project
      },
      mainConversations: conversation
        ? {
            ...input.state.mainConversations,
            [conversation.id]: conversation
          }
        : input.state.mainConversations,
      documentVersions: {
        ...input.state.documentVersions,
        [base.id]: {
          ...base,
          status: "superseded"
        },
        [nextVersion.id]: nextVersion
      },
      manualEditDrafts: {
        ...input.state.manualEditDrafts,
        [confirmedDraft.id]: confirmedDraft
      },
      eventLogs: activatedEventResult.eventLogs,
      timelineNodes: activatedEventResult.timelineNodes,
      timelineEdges: activatedEventResult.timelineEdges
    };
    nextState = DocumentChunkService.createChunksForDocumentVersion({
      state: nextState,
      documentVersionId: nextVersion.id,
      now: input.now
    }).state;
    const affectedSelections: TextSelectionModel[] = [];

    for (const plan of affectedSelectionPlans) {
      const { selection, nextAnchorStatus, overlapWithChangedRange, reason } = plan;
      const updatedSelection: TextSelectionModel = {
        ...selection,
        anchorStatus: nextAnchorStatus,
        payload: {
          ...selection.payload,
          previous_anchor_status: selection.anchorStatus ?? "active",
          anchor_status: nextAnchorStatus,
          document_version_before_id: base.id,
          document_version_after_id: nextVersion.id,
          reason,
          overlap_with_changed_range: overlapWithChangedRange
        }
      };
      const selectionEventResult = EventService.createEventWithTimelineNode(
        nextState,
        {
          id: `event-selection-anchor-status-${selection.id}-${input.suffix}`,
          projectId: selection.projectId,
          eventType: "selection.anchor_status_changed",
          objectType: "text_selection",
          objectId: selection.id,
          actor: "system",
          timestamp: input.now,
          payload: {
            source_object_type: "document_version",
            source_object_id: nextVersion.id,
            selection_id: selection.id,
            old_anchor_status: selection.anchorStatus ?? "active",
            new_anchor_status: nextAnchorStatus,
            document_version_before_id: base.id,
            document_version_after_id: nextVersion.id,
            reason,
            overlap_with_changed_range: overlapWithChangedRange
          }
        },
        {
          id: `timeline-selection-anchor-status-${selection.id}-${input.suffix}`,
          conversationId: selection.conversationId,
          parentNodeId: eventResult.timelineNode.id,
          label: "Selection anchor status changed",
          memoryScope: "selected_text",
          memoryEffect: "none",
          status: selection.status,
          createdContentRef: selection.id,
          payload: {
            source_object_type: "document_version",
            source_object_id: nextVersion.id,
            selection_id: selection.id,
            old_anchor_status: selection.anchorStatus ?? "active",
            new_anchor_status: nextAnchorStatus,
            document_version_before_id: base.id,
            document_version_after_id: nextVersion.id,
            reason,
            overlap_with_changed_range: overlapWithChangedRange
          }
        },
        {
          id: `timeline-edge-${eventResult.timelineNode.id}-timeline-selection-anchor-status-${selection.id}-${input.suffix}`,
          sourceNodeId: eventResult.timelineNode.id,
          edgeType: "selection",
          label: "selection status"
        }
      );

      nextState = {
        ...nextState,
        textSelections: {
          ...nextState.textSelections,
          [updatedSelection.id]: updatedSelection
        },
        eventLogs: selectionEventResult.eventLogs,
        timelineNodes: selectionEventResult.timelineNodes,
        timelineEdges: selectionEventResult.timelineEdges
      };
      affectedSelections.push(updatedSelection);
    }

    return {
      ok: true,
      conflict: false,
      state: nextState,
      draft: confirmedDraft,
      documentVersion: nextVersion,
      previousDocumentVersion: base,
      diff,
      event: eventResult.event,
      timelineNode: eventResult.timelineNode,
      timelineEdge: eventResult.timelineEdge,
      affectedSelections
    };
  }

  static getDocumentVersion(
    state: Pick<RevisionRepositoryState, "documentVersions">,
    versionId: string
  ) {
    return state.documentVersions[versionId];
  }

  static getDocumentVersionHistory(
    state: Pick<RevisionRepositoryState, "documentVersions">,
    projectId: string,
    conversationId?: string
  ) {
    return Object.values(state.documentVersions)
      .filter(
        (version) =>
          version.projectId === projectId &&
          activeConversationIdMatches(version, conversationId)
      )
      .sort((a, b) => versionNumber(a) - versionNumber(b));
  }

  static compareDocumentVersions(input: {
    state: RevisionRepositoryState;
    fromVersionId: string;
    toVersionId: string;
  }) {
    const from = input.state.documentVersions[input.fromVersionId];
    const to = input.state.documentVersions[input.toVersionId];

    if (!from || !to) {
      throw new Error("Document version not found");
    }

    return DiffService.createTextDiff(from.content, to.content);
  }
}
