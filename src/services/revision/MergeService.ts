import type {
  DocumentVersionModel,
  MergeConflictStatus,
  MergeMode,
  MergeRecordModel,
  MergeSourceType,
  RevisionBranchModel,
  RevisionObjectType,
  RevisionRepositoryState,
  RevisionTimelineNode,
  TextSelectionModel
} from "@/types/revision";
import {
  DiffService,
  hashContent,
  type TextDiff,
  type TextDiffChangedRange
} from "./DiffService";
import { DocumentVersionService } from "./DocumentVersionService";
import { EventService } from "./EventService";
import { TimelineService } from "./TimelineService";

type ManualTargetRange = {
  start: number;
  end: number;
  selectionId?: string;
};

type ResolvedMergeSource = {
  sourceType: MergeSourceType;
  sourceId: string;
  sourceText: string;
  sourceObjectType: RevisionObjectType;
  sourceObjectId: string;
  sourceMessageId?: string;
  sourceLocalSelectionId?: string;
  sourceSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceBranchId?: string;
  sourceDocumentVersionId?: string;
  conversationId?: string;
};

type ResolvedMergeTarget = {
  resolved: boolean;
  conflictStatus: MergeConflictStatus;
  conflictReason?: string;
  targetDocumentVersion: DocumentVersionModel;
  targetSelection?: TextSelectionModel;
  targetSelectionId?: string;
  targetRangeStart?: number;
  targetRangeEnd?: number;
  targetBeforeContext?: string;
  targetAfterContext?: string;
};

type MergeProposalInput = {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  sourceType: MergeSourceType;
  sourceId: string;
  mergeMode?: MergeMode;
  manualTargetRange?: ManualTargetRange;
  now: string;
  suffix: string;
};

type MergeRecordInput = {
  state: RevisionRepositoryState;
  mergeId: string;
  now: string;
  suffix: string;
};

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

function textRange(content: string, start?: number, end?: number) {
  const safeStart = Math.max(0, Math.min(start ?? 0, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end ?? safeStart, content.length));

  return {
    start: safeStart,
    end: safeEnd,
    before: content.slice(Math.max(0, safeStart - 160), safeStart),
    after: content.slice(safeEnd, Math.min(content.length, safeEnd + 160))
  };
}

function findExactMatches(content: string, selectedText: string) {
  if (!selectedText) {
    return [];
  }

  const matches: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;

  while (searchFrom <= content.length) {
    const index = content.indexOf(selectedText, searchFrom);

    if (index < 0) {
      break;
    }

    matches.push({
      start: index,
      end: index + selectedText.length
    });
    searchFrom = index + Math.max(selectedText.length, 1);
  }

  return matches;
}

function normalizeMergeMode(mode: MergeMode): MergeMode {
  if (mode === "replace_original_selection") {
    return "replace_selection";
  }

  if (mode === "insert_before_original_selection") {
    return "insert_before_selection";
  }

  if (mode === "insert_after_original_selection") {
    return "insert_after_selection";
  }

  if (mode === "merge_as_new_paragraph") {
    return "new_paragraph_after_selection";
  }

  if (mode === "apply_as_patch") {
    return "apply_patch";
  }

  if (mode === "save_as_note_instead") {
    return "save_as_note";
  }

  return mode;
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

function sourceTimelineNode(state: RevisionRepositoryState, source: ResolvedMergeSource) {
  if (source.sourceLocalSelectionId) {
    return latestNodeForObject(state, "local_selection", source.sourceLocalSelectionId);
  }

  if (source.sourceMessageId) {
    return latestNodeForObject(state, "message", source.sourceMessageId);
  }

  if (source.sourceBranchId) {
    return latestNodeForObject(state, "revision_branch", source.sourceBranchId);
  }

  return latestNodeForObject(state, source.sourceObjectType as never, source.sourceObjectId);
}

function eventLabel(eventType: string) {
  if (eventType === "merge.diff_generated") {
    return "Merge diff generated";
  }

  if (eventType === "merge.conflict_detected") {
    return "Merge conflict detected";
  }

  if (eventType === "merge.target_changed") {
    return "Merge target changed";
  }

  if (eventType === "merge.cancelled") {
    return "Merge cancelled";
  }

  if (eventType === "merge.discarded") {
    return "Merge discarded";
  }

  if (eventType === "merge.deleted") {
    return "Merge deleted";
  }

  return "Merge proposed";
}

function createMergeLifecycleEvent(input: {
  state: RevisionRepositoryState;
  record: MergeRecordModel;
  eventType:
    | "merge.proposed"
    | "merge.diff_generated"
    | "merge.conflict_detected"
    | "merge.target_changed"
    | "merge.cancelled"
    | "merge.discarded"
    | "merge.deleted";
  now: string;
  suffix: string;
  sourceNode?: RevisionTimelineNode;
  payload?: Record<string, unknown>;
}) {
  const eventName = input.eventType.replaceAll(".", "-");
  const eventId = `event-${eventName}-${input.suffix}`;
  const nodeId = `timeline-${eventName}-${input.suffix}`;
  const memoryEffect =
    input.eventType === "merge.deleted"
      ? "permanently_excluded"
      : input.eventType === "merge.cancelled" ||
          input.eventType === "merge.discarded"
        ? "excluded_by_default"
        : "none";
  const sourceNode =
    input.sourceNode ??
    latestNodeForObject(input.state, "merge_record", input.record.id) ??
    (input.record.sourceLocalSelectionId
      ? latestNodeForObject(
          input.state,
          "local_selection",
          input.record.sourceLocalSelectionId
        )
      : undefined);

  return EventService.createEventWithTimelineNode(
    input.state,
    {
      id: eventId,
      projectId: input.record.projectId,
      eventType: input.eventType,
      objectType: "merge_record",
      objectId: input.record.id,
      actor: input.eventType === "merge.diff_generated" ? "system" : "user",
      timestamp: input.now,
      payload: {
        node_id: nodeId,
        project_id: input.record.projectId,
        conversation_id: input.record.conversationId,
        event_id: eventId,
        event_type: input.eventType,
        target_object_type: "merge_record",
        target_object_id: input.record.id,
        merge_id: input.record.id,
        source_object_type: input.record.sourceObjectType,
        source_object_id: input.record.sourceObjectId,
        source_type: input.record.sourceType,
        source_id: input.record.sourceId,
        source_text_hash: hashContent(input.record.sourceText ?? ""),
        selection_id: input.record.sourceSelectionId,
        local_selection_id: input.record.sourceLocalSelectionId,
        local_thread_id: input.record.sourceLocalThreadId,
        branch_id: input.record.sourceBranchId,
        merge_mode: input.record.mergeMode,
        target_selection_id: input.record.targetSelectionId,
        target_range_start: input.record.targetRangeStart,
        target_range_end: input.record.targetRangeEnd,
        target_document_version_id: input.record.targetDocumentVersionId,
        result_document_version_id: input.record.resultDocumentVersionId,
        document_version_before_id: input.record.targetDocumentVersionId,
        document_version_after_id: input.record.resultDocumentVersionId,
        memory_scope: "merge",
        memory_effect: memoryEffect,
        status: input.record.status,
        conflict_status: input.record.conflictStatus,
        conflict_reason: input.record.conflictReason,
        diff_summary: input.record.diffSummary,
        changed_ranges: input.record.payload?.changed_ranges,
        actor_type: input.eventType === "merge.diff_generated" ? "system" : "user",
        actor_id: input.eventType === "merge.diff_generated" ? "system" : "user",
        created_at: input.now,
        ...input.payload
      }
    },
    {
      id: nodeId,
      conversationId: input.record.conversationId,
      parentNodeId: sourceNode?.id,
      label: eventLabel(input.eventType),
      memoryScope: "merge",
      memoryEffect,
      status: input.record.status,
      createdContentRef: input.record.id,
      payload: {
        node_id: nodeId,
        project_id: input.record.projectId,
        conversation_id: input.record.conversationId,
        event_id: eventId,
        event_type: input.eventType,
        target_object_type: "merge_record",
        target_object_id: input.record.id,
        source_type: input.record.sourceType,
        source_id: input.record.sourceId,
        source_text_hash: hashContent(input.record.sourceText ?? ""),
        merge_mode: input.record.mergeMode,
        source_object_type: input.record.sourceObjectType,
        source_object_id: input.record.sourceObjectId,
        selection_id: input.record.sourceSelectionId,
        local_selection_id: input.record.sourceLocalSelectionId,
        local_thread_id: input.record.sourceLocalThreadId,
        branch_id: input.record.sourceBranchId,
        target_selection_id: input.record.targetSelectionId,
        target_range_start: input.record.targetRangeStart,
        target_range_end: input.record.targetRangeEnd,
        target_document_version_id: input.record.targetDocumentVersionId,
        result_document_version_id: input.record.resultDocumentVersionId,
        document_version_before_id: input.record.targetDocumentVersionId,
        document_version_after_id: input.record.resultDocumentVersionId,
        memory_scope: "merge",
        memory_effect: memoryEffect,
        conflict_status: input.record.conflictStatus,
        conflict_reason: input.record.conflictReason,
        status: input.record.status,
        actor_type: input.eventType === "merge.diff_generated" ? "system" : "user",
        actor_id: input.eventType === "merge.diff_generated" ? "system" : "user",
        created_at: input.now,
        diff_summary: input.record.diffSummary,
        changed_ranges: input.record.payload?.changed_ranges,
        ...input.payload
      }
    },
    sourceNode
      ? {
          id: `timeline-edge-${sourceNode.id}-timeline-${eventName}-${input.suffix}`,
          sourceNodeId: sourceNode.id,
          edgeType:
            input.eventType === "merge.proposed"
              ? "merge_proposal"
              : "sequence",
          label:
            input.eventType === "merge.proposed"
              ? "merge proposal"
              : input.eventType
        }
      : undefined
  );
}

function projectWithActiveVersion(params: {
  state: RevisionRepositoryState;
  projectId: string;
  activeDocumentVersionId: string;
  now: string;
}) {
  const current = params.state.projects[params.projectId];

  return {
    ...(current ?? {
      id: params.projectId,
      name: "Default",
      status: "active" as const,
      createdAt: params.now,
      updatedAt: params.now
    }),
    activeDocumentVersionId: params.activeDocumentVersionId,
    updatedAt: params.now
  };
}

function conversationWithActiveVersion(params: {
  state: RevisionRepositoryState;
  projectId: string;
  conversationId?: string;
  activeDocumentVersionId: string;
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
      title: "Main Conversation",
      status: "active" as const,
      createdAt: params.now,
      updatedAt: params.now
    }),
    activeDocumentVersionId: params.activeDocumentVersionId,
    updatedAt: params.now
  };
}

export class MergeService {
  static resolveMergeSource(input: {
    state: RevisionRepositoryState;
    sourceType: MergeSourceType;
    sourceId: string;
  }): ResolvedMergeSource {
    if (
      input.sourceType === "local_selection" ||
      input.sourceType === "nested_local_selection"
    ) {
      const localSelection = input.state.localSelections[input.sourceId];

      if (!localSelection) {
        throw new Error("LocalSelection merge source not found");
      }

      return {
        sourceType: input.sourceType,
        sourceId: localSelection.id,
        sourceText: localSelection.selectedText,
        sourceObjectType: "local_selection",
        sourceObjectId: localSelection.id,
        sourceLocalSelectionId: localSelection.id,
        sourceSelectionId: localSelection.parentSelectionId,
        sourceLocalThreadId: localSelection.sourceLocalThreadId,
        sourceDocumentVersionId: localSelection.sourceDocumentVersionId,
        conversationId: localSelection.conversationId
      };
    }

    if (
      input.sourceType === "local_answer" ||
      input.sourceType === "nested_local_answer"
    ) {
      const message = input.state.revisionMessages[input.sourceId];

      if (!message) {
        throw new Error("Message merge source not found");
      }

      const localThread = message.threadId
        ? input.state.localThreads[message.threadId]
        : undefined;

      return {
        sourceType: input.sourceType,
        sourceId: message.id,
        sourceText: message.content,
        sourceObjectType: "message",
        sourceObjectId: message.id,
        sourceMessageId: message.id,
        sourceSelectionId: localThread?.sourceSelectionId,
        sourceLocalThreadId: message.threadId,
        sourceDocumentVersionId: localThread?.sourceDocumentVersionId,
        conversationId: message.conversationId
      };
    }

    const branch = input.state.revisionBranches[input.sourceId];

    if (!branch) {
      throw new Error("RevisionBranch merge source not found");
    }

    return {
      sourceType: input.sourceType,
      sourceId: branch.id,
      sourceText: branch.draftContent ?? branch.content ?? "",
      sourceObjectType: "revision_branch",
      sourceObjectId: branch.id,
      sourceBranchId: branch.id,
      sourceSelectionId: branch.parentSelectionId,
      sourceLocalSelectionId: branch.parentLocalSelectionId,
      sourceLocalThreadId: branch.sourceLocalThreadId,
      sourceDocumentVersionId: branch.baseDocumentVersionId,
      conversationId: undefined
    };
  }

  static resolveMergeTarget(input: {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    source: ResolvedMergeSource;
    manualTargetRange?: ManualTargetRange;
  }): ResolvedMergeTarget {
    const activeDocumentVersion = DocumentVersionService.getActiveDocumentVersion(
      input.state,
      input.projectId,
      input.conversationId
    );

    if (!activeDocumentVersion) {
      throw new Error("Active DocumentVersion not found");
    }

    const content = activeDocumentVersion.content;
    const manualRange = input.manualTargetRange;
    const targetSelectionId =
      manualRange?.selectionId ?? input.source.sourceSelectionId;
    const targetSelection = targetSelectionId
      ? input.state.textSelections[targetSelectionId]
      : undefined;

    if (manualRange) {
      const range = textRange(content, manualRange.start, manualRange.end);

      return {
        resolved: true,
        conflictStatus: "none",
        targetDocumentVersion: activeDocumentVersion,
        targetSelection,
        targetSelectionId,
        targetRangeStart: range.start,
        targetRangeEnd: range.end,
        targetBeforeContext: range.before,
        targetAfterContext: range.after
      };
    }

    if (!targetSelection) {
      return {
        resolved: false,
        conflictStatus: "needs_manual_target",
        conflictReason: "No parent target selection could be resolved.",
        targetDocumentVersion: activeDocumentVersion
      };
    }

    if (targetSelection.anchorStatus === "needs_review") {
      return {
        resolved: false,
        conflictStatus: "needs_manual_target",
        conflictReason:
          "Target selection is marked as needs_review after a document edit.",
        targetDocumentVersion: activeDocumentVersion,
        targetSelection,
        targetSelectionId: targetSelection.id
      };
    }

    if (
      targetSelection.sourceDocumentVersionId === activeDocumentVersion.id &&
      targetSelection.startOffset !== undefined &&
      targetSelection.endOffset !== undefined &&
      (!targetSelection.anchorStatus ||
        targetSelection.anchorStatus === "active")
    ) {
      const range = textRange(
        content,
        targetSelection.startOffset,
        targetSelection.endOffset
      );

      return {
        resolved: true,
        conflictStatus: "none",
        targetDocumentVersion: activeDocumentVersion,
        targetSelection,
        targetSelectionId: targetSelection.id,
        targetRangeStart: range.start,
        targetRangeEnd: range.end,
        targetBeforeContext: range.before,
        targetAfterContext: range.after
      };
    }

    const matches = findExactMatches(content, targetSelection.selectedText);

    if (matches.length === 1) {
      const range = textRange(content, matches[0].start, matches[0].end);

      return {
        resolved: true,
        conflictStatus: "none",
        targetDocumentVersion: activeDocumentVersion,
        targetSelection,
        targetSelectionId: targetSelection.id,
        targetRangeStart: range.start,
        targetRangeEnd: range.end,
        targetBeforeContext: range.before,
        targetAfterContext: range.after
      };
    }

    return {
      resolved: false,
      conflictStatus: "needs_manual_target",
      conflictReason:
        matches.length === 0
          ? "Target selection text no longer appears in the active document."
          : "Target selection text appears multiple times in the active document.",
      targetDocumentVersion: activeDocumentVersion,
      targetSelection,
      targetSelectionId: targetSelection.id
    };
  }

  static applyMergeMode(
    oldContent: string,
    targetRange: { start: number; end: number },
    sourceText: string,
    mergeMode: MergeMode
  ) {
    const mode = normalizeMergeMode(mergeMode);
    const start = Math.max(0, Math.min(targetRange.start, oldContent.length));
    const end = Math.max(start, Math.min(targetRange.end, oldContent.length));

    if (mode === "insert_before_selection") {
      return `${oldContent.slice(0, start)}${sourceText}${oldContent.slice(start)}`;
    }

    if (mode === "insert_after_selection") {
      return `${oldContent.slice(0, end)}${sourceText}${oldContent.slice(end)}`;
    }

    if (mode === "append_to_paragraph") {
      const paragraphEndCandidate = oldContent.indexOf("\n\n", end);
      const paragraphEnd =
        paragraphEndCandidate >= 0 ? paragraphEndCandidate : oldContent.length;
      const needsSpace =
        paragraphEnd > 0 && !/\s$/.test(oldContent.slice(0, paragraphEnd));

      return `${oldContent.slice(0, paragraphEnd)}${needsSpace ? " " : ""}${sourceText}${oldContent.slice(paragraphEnd)}`;
    }

    if (mode === "new_paragraph_after_selection") {
      return `${oldContent.slice(0, end)}\n\n${sourceText}${oldContent.slice(end)}`;
    }

    if (mode === "replace_custom_range" || mode === "replace_selection") {
      return `${oldContent.slice(0, start)}${sourceText}${oldContent.slice(end)}`;
    }

    if (mode === "apply_patch") {
      return `${oldContent.slice(0, start)}${sourceText}${oldContent.slice(end)}`;
    }

    return oldContent;
  }

  static createMergeProposal(input: MergeProposalInput): {
    state: RevisionRepositoryState;
    mergeRecord: MergeRecordModel;
    diff?: TextDiff;
    conflict?: {
      status: MergeConflictStatus;
      reason?: string;
    };
  } {
    const source = MergeService.resolveMergeSource(input);
    const target = MergeService.resolveMergeTarget({
      state: input.state,
      projectId: input.projectId,
      conversationId: input.conversationId ?? source.conversationId,
      source,
      manualTargetRange: input.manualTargetRange
    });
    const mergeId = `merge-record-${input.suffix}`;
    const status = target.resolved ? "pending" : "conflict";
    const record: MergeRecordModel = {
      id: mergeId,
      mergeId,
      projectId: input.projectId,
      conversationId: input.conversationId ?? source.conversationId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceText: source.sourceText,
      sourceMessageId: source.sourceMessageId,
      sourceLocalSelectionId: source.sourceLocalSelectionId,
      sourceSelectionId: source.sourceSelectionId,
      sourceLocalThreadId: source.sourceLocalThreadId,
      sourceBranchId: source.sourceBranchId,
      sourceDocumentVersionId: source.sourceDocumentVersionId,
      sourceObjectType: source.sourceObjectType,
      sourceObjectId: source.sourceObjectId,
      targetDocumentVersionId: target.targetDocumentVersion.id,
      targetDocumentVersionHash:
        target.targetDocumentVersion.contentHash ??
        hashContent(target.targetDocumentVersion.content),
      targetSelectionId: target.targetSelectionId,
      targetRangeStart: target.targetRangeStart,
      targetRangeEnd: target.targetRangeEnd,
      targetBeforeContext: target.targetBeforeContext,
      targetAfterContext: target.targetAfterContext,
      mergeMode: input.mergeMode ?? "replace_selection",
      status,
      conflictStatus: target.conflictStatus,
      conflictReason: target.conflictReason,
      createdBy: "user",
      createdAt: input.now,
      updatedAt: input.now,
      payload: {
        source_type: source.sourceType,
        source_id: source.sourceId,
        source_text_hash: hashContent(source.sourceText),
        target_selection_id: target.targetSelectionId,
        target_range_start: target.targetRangeStart,
        target_range_end: target.targetRangeEnd,
        target_document_version_id: target.targetDocumentVersion.id,
        target_document_version_hash:
          target.targetDocumentVersion.contentHash ??
          hashContent(target.targetDocumentVersion.content),
        conflict_status: target.conflictStatus
      }
    };
    const sourceNode = sourceTimelineNode(input.state, source);
    const proposedEvent = createMergeLifecycleEvent({
      state: input.state,
      record,
      eventType: "merge.proposed",
      now: input.now,
      suffix: input.suffix,
      sourceNode
    });
    let nextState: RevisionRepositoryState = {
      ...input.state,
      mergeRecords: {
        ...input.state.mergeRecords,
        [record.id]: record
      },
      eventLogs: proposedEvent.eventLogs,
      timelineNodes: proposedEvent.timelineNodes,
      timelineEdges: proposedEvent.timelineEdges
    };

    if (input.manualTargetRange && target.resolved) {
      const targetChangedEvent = createMergeLifecycleEvent({
        state: nextState,
        record,
        eventType: "merge.target_changed",
        now: input.now,
        suffix: `${input.suffix}-target-changed`,
        payload: {
          target_range_start: target.targetRangeStart,
          target_range_end: target.targetRangeEnd,
          target_selection_id: target.targetSelectionId,
          target_before_context: target.targetBeforeContext,
          target_after_context: target.targetAfterContext
        }
      });

      nextState = {
        ...nextState,
        eventLogs: targetChangedEvent.eventLogs,
        timelineNodes: targetChangedEvent.timelineNodes,
        timelineEdges: targetChangedEvent.timelineEdges
      };
    }

    if (!target.resolved) {
      const conflictEvent = createMergeLifecycleEvent({
        state: nextState,
        record,
        eventType: "merge.conflict_detected",
        now: input.now,
        suffix: `${input.suffix}-conflict`,
        payload: {
          conflict_status: target.conflictStatus,
          conflict_reason: target.conflictReason
        }
      });

      nextState = {
        ...nextState,
        eventLogs: conflictEvent.eventLogs,
        timelineNodes: conflictEvent.timelineNodes,
        timelineEdges: conflictEvent.timelineEdges
      };

      return {
        state: nextState,
        mergeRecord: record,
        conflict: {
          status: target.conflictStatus,
          reason: target.conflictReason
        }
      };
    }

    return MergeService.generateMergeDiff({
      state: nextState,
      mergeId: record.id,
      now: input.now,
      suffix: `${input.suffix}-diff`
    });
  }

  static generateMergeDiff(input: MergeRecordInput): {
    state: RevisionRepositoryState;
    mergeRecord: MergeRecordModel;
    diff: TextDiff;
  } {
    const record = input.state.mergeRecords[input.mergeId];

    if (!record) {
      throw new Error("MergeRecord not found");
    }

    const targetDocumentVersion =
      input.state.documentVersions[record.targetDocumentVersionId];

    if (!targetDocumentVersion) {
      throw new Error("Merge target DocumentVersion not found");
    }

    if (
      record.targetRangeStart === undefined ||
      record.targetRangeEnd === undefined
    ) {
      throw new Error("Merge target range is not resolved");
    }

    const proposedContent = MergeService.applyMergeMode(
      targetDocumentVersion.content,
      {
        start: record.targetRangeStart,
        end: record.targetRangeEnd
      },
      record.sourceText ?? "",
      record.mergeMode
    );
    const diff = DiffService.createTextDiff(
      targetDocumentVersion.content,
      proposedContent
    );
    const updatedRecord: MergeRecordModel = {
      ...record,
      status: "diff_ready",
      conflictStatus: "none",
      proposedContent,
      resultContentPreview: proposedContent,
      diff: diff as unknown as Record<string, unknown>,
      diffSummary: diff.summary as unknown as Record<string, unknown>,
      updatedAt: input.now,
      payload: {
        ...record.payload,
        proposed_content_hash: hashContent(proposedContent),
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      }
    };
    const eventResult = createMergeLifecycleEvent({
      state: input.state,
      record: updatedRecord,
      eventType: "merge.diff_generated",
      now: input.now,
      suffix: input.suffix,
      payload: {
        proposed_content_hash: hashContent(proposedContent),
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      }
    });

    return {
      state: {
        ...input.state,
        mergeRecords: {
          ...input.state.mergeRecords,
          [updatedRecord.id]: updatedRecord
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      mergeRecord: updatedRecord,
      diff
    };
  }

  static confirmMerge(input: MergeRecordInput): {
    ok: true;
    conflict: false;
    state: RevisionRepositoryState;
    mergeRecord: MergeRecordModel;
    documentVersion: DocumentVersionModel;
    previousDocumentVersion: DocumentVersionModel;
    diff: TextDiff;
  } | {
    ok: false;
    conflict: true;
    state: RevisionRepositoryState;
    mergeRecord: MergeRecordModel;
    conflictStatus: MergeConflictStatus;
    conflictReason?: string;
  } {
    const record = input.state.mergeRecords[input.mergeId];

    if (!record) {
      throw new Error("MergeRecord not found");
    }

    if (record.status !== "diff_ready") {
      throw new Error("MergeRecord must be diff_ready before confirmation");
    }

    const targetVersion = input.state.documentVersions[record.targetDocumentVersionId];
    const activeVersion = DocumentVersionService.getActiveDocumentVersion(
      input.state,
      record.projectId,
      record.conversationId
    );

    if (!targetVersion || !activeVersion) {
      throw new Error("Merge target or active DocumentVersion not found");
    }

    const activeHash = activeVersion.contentHash ?? hashContent(activeVersion.content);

    if (
      activeVersion.id !== record.targetDocumentVersionId ||
      activeHash !== record.targetDocumentVersionHash
    ) {
      const conflictRecord: MergeRecordModel = {
        ...record,
        status: "conflict",
        conflictStatus: "active_document_changed",
        conflictReason:
          "The active document changed after this merge proposal was created.",
        updatedAt: input.now
      };
      const eventResult = createMergeLifecycleEvent({
        state: input.state,
        record: conflictRecord,
        eventType: "merge.conflict_detected",
        now: input.now,
        suffix: `${input.suffix}-active-document-changed`,
        payload: {
          conflict_status: "active_document_changed",
          conflict_reason: conflictRecord.conflictReason,
          proposal_target_document_version_id: record.targetDocumentVersionId,
          active_document_version_id: activeVersion.id
        }
      });

      return {
        ok: false,
        conflict: true,
        state: {
          ...input.state,
          mergeRecords: {
            ...input.state.mergeRecords,
            [conflictRecord.id]: conflictRecord
          },
          eventLogs: eventResult.eventLogs,
          timelineNodes: eventResult.timelineNodes,
          timelineEdges: eventResult.timelineEdges
        },
        mergeRecord: conflictRecord,
        conflictStatus: "active_document_changed",
        conflictReason: conflictRecord.conflictReason
      };
    }

    if (
      record.targetRangeStart === undefined ||
      record.targetRangeEnd === undefined
    ) {
      throw new Error("Merge target range is not resolved");
    }

    const resultContent = MergeService.applyMergeMode(
      activeVersion.content,
      {
        start: record.targetRangeStart,
        end: record.targetRangeEnd
      },
      record.sourceText ?? "",
      record.mergeMode
    );
    const diff = DiffService.createTextDiff(activeVersion.content, resultContent);
    const documentVersionId = `document-version-${input.suffix}`;
    const mergeConfirmedEventId = `event-merge-confirmed-${input.suffix}`;
    const mergeConfirmedNodeId = `timeline-merge-confirmed-${input.suffix}`;
    const nextVersion: DocumentVersionModel = {
      id: documentVersionId,
      documentVersionId,
      projectId: record.projectId,
      conversationId: record.conversationId,
      documentId: activeVersion.documentId,
      parentDocumentVersionId: activeVersion.id,
      parentVersionId: activeVersion.id,
      versionNumber: versionNumber(activeVersion) + 1,
      content: resultContent,
      contentHash: hashContent(resultContent),
      createdFromEventId: mergeConfirmedEventId,
      createdFromTimelineNodeId: mergeConfirmedNodeId,
      sourceType: "merge",
      sourceId: record.id,
      createdBy: "user",
      sourceEventId: mergeConfirmedEventId,
      status: "active",
      title: activeVersion.title,
      createdAt: input.now,
      metadata: {
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges,
        merge_id: record.id,
        merge_mode: record.mergeMode,
        source_type: record.sourceType
      },
      payload: {
        parent_document_version_id: activeVersion.id,
        version_number: versionNumber(activeVersion) + 1,
        content_hash: hashContent(resultContent),
        source_type: "merge",
        source_id: record.id,
        merge_mode: record.mergeMode
      }
    };
    const confirmedRecord: MergeRecordModel = {
      ...record,
      status: "confirmed",
      conflictStatus: "none",
      confirmedAt: input.now,
      confirmedBy: "user",
      updatedAt: input.now,
      resultDocumentVersionId: nextVersion.id,
      resultContentPreview: resultContent,
      diff: diff as unknown as Record<string, unknown>,
      diffSummary: diff.summary as unknown as Record<string, unknown>,
      payload: {
        ...record.payload,
        result_document_version_id: nextVersion.id,
        result_content_hash: nextVersion.contentHash,
        diff_summary: diff.summary,
        changed_ranges: diff.changedRanges
      }
    };
    const sourceNode =
      sourceTimelineNode(input.state, {
        sourceType: confirmedRecord.sourceType ?? "local_answer",
        sourceId: confirmedRecord.sourceId ?? confirmedRecord.sourceObjectId,
        sourceText: confirmedRecord.sourceText ?? "",
        sourceObjectType: confirmedRecord.sourceObjectType,
        sourceObjectId: confirmedRecord.sourceObjectId,
        sourceMessageId: confirmedRecord.sourceMessageId,
        sourceLocalSelectionId: confirmedRecord.sourceLocalSelectionId,
        sourceSelectionId: confirmedRecord.sourceSelectionId,
        sourceLocalThreadId: confirmedRecord.sourceLocalThreadId,
        sourceBranchId: confirmedRecord.sourceBranchId,
        sourceDocumentVersionId: confirmedRecord.sourceDocumentVersionId,
        conversationId: confirmedRecord.conversationId
      }) ?? latestNodeForObject(input.state, "merge_record", confirmedRecord.id);
    const confirmedEventResult = EventService.createEventWithTimelineNode(
      input.state,
      {
        id: mergeConfirmedEventId,
        projectId: confirmedRecord.projectId,
        eventType: "merge.confirmed",
        objectType: "merge_record",
        objectId: confirmedRecord.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          node_id: mergeConfirmedNodeId,
          project_id: confirmedRecord.projectId,
          conversation_id: confirmedRecord.conversationId,
          event_id: mergeConfirmedEventId,
          event_type: "merge.confirmed",
          target_object_type: "merge_record",
          target_object_id: confirmedRecord.id,
          merge_id: confirmedRecord.id,
          source_object_type: confirmedRecord.sourceObjectType,
          source_object_id: confirmedRecord.sourceObjectId,
          source_type: confirmedRecord.sourceType,
          source_id: confirmedRecord.sourceId,
          selection_id: confirmedRecord.sourceSelectionId,
          local_selection_id: confirmedRecord.sourceLocalSelectionId,
          local_thread_id: confirmedRecord.sourceLocalThreadId,
          branch_id: confirmedRecord.sourceBranchId,
          merge_mode: confirmedRecord.mergeMode,
          target_selection_id: confirmedRecord.targetSelectionId,
          target_range_start: confirmedRecord.targetRangeStart,
          target_range_end: confirmedRecord.targetRangeEnd,
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          target_document_version_id: confirmedRecord.targetDocumentVersionId,
          result_document_version_id: nextVersion.id,
          memory_scope: "document",
          memory_effect: "updates_document_memory",
          status: "active",
          conflict_status: confirmedRecord.conflictStatus,
          conflict_reason: confirmedRecord.conflictReason,
          actor_type: "user",
          actor_id: "user",
          created_at: input.now,
          source_text_hash: hashContent(confirmedRecord.sourceText ?? ""),
          diff_summary: diff.summary,
          changed_ranges: diff.changedRanges
        }
      },
      {
        id: mergeConfirmedNodeId,
        conversationId: confirmedRecord.conversationId,
        parentNodeId: sourceNode?.id,
        label: "Merge confirmed",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: confirmedRecord.id,
        payload: {
          node_id: mergeConfirmedNodeId,
          project_id: confirmedRecord.projectId,
          conversation_id: confirmedRecord.conversationId,
          event_id: mergeConfirmedEventId,
          event_type: "merge.confirmed",
          target_object_type: "merge_record",
          target_object_id: confirmedRecord.id,
          source_type: confirmedRecord.sourceType,
          source_id: confirmedRecord.sourceId,
          source_object_type: confirmedRecord.sourceObjectType,
          source_object_id: confirmedRecord.sourceObjectId,
          merge_mode: confirmedRecord.mergeMode,
          target_selection_id: confirmedRecord.targetSelectionId,
          target_range_start: confirmedRecord.targetRangeStart,
          target_range_end: confirmedRecord.targetRangeEnd,
          target_document_version_id: confirmedRecord.targetDocumentVersionId,
          result_document_version_id: nextVersion.id,
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          selection_id: confirmedRecord.sourceSelectionId,
          local_selection_id: confirmedRecord.sourceLocalSelectionId,
          local_thread_id: confirmedRecord.sourceLocalThreadId,
          branch_id: confirmedRecord.sourceBranchId,
          memory_scope: "document",
          memory_effect: "updates_document_memory",
          status: "active",
          conflict_status: confirmedRecord.conflictStatus,
          conflict_reason: confirmedRecord.conflictReason,
          actor_type: "user",
          actor_id: "user",
          created_at: input.now,
          diff_summary: diff.summary,
          changed_ranges: diff.changedRanges,
          source_text_hash: hashContent(confirmedRecord.sourceText ?? ""),
        }
      },
      sourceNode
        ? {
            id: `timeline-edge-${sourceNode.id}-${mergeConfirmedNodeId}`,
            sourceNodeId: sourceNode.id,
            edgeType: "merge_back",
            label: "merge back"
          }
        : undefined
    );
    const previousVersionNode = latestNodeForObject(
      {
        ...input.state,
        eventLogs: confirmedEventResult.eventLogs,
        timelineNodes: confirmedEventResult.timelineNodes,
        timelineEdges: confirmedEventResult.timelineEdges
      },
      "document_version",
      activeVersion.id
    );
    const versionCreatedResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: confirmedEventResult.eventLogs,
        timelineNodes: confirmedEventResult.timelineNodes,
        timelineEdges: confirmedEventResult.timelineEdges
      },
      {
        id: `event-document-version-created-${input.suffix}`,
        projectId: confirmedRecord.projectId,
        eventType: "document.version.created",
        objectType: "document_version",
        objectId: nextVersion.id,
        actor: "user",
        timestamp: input.now,
        payload: {
          document_version_id: nextVersion.id,
          parent_document_version_id: activeVersion.id,
          source_type: "merge",
          source_id: confirmedRecord.id,
          merge_mode: confirmedRecord.mergeMode,
          content_hash: nextVersion.contentHash
        }
      },
      {
        id: `timeline-document-version-created-${input.suffix}`,
        conversationId: confirmedRecord.conversationId,
        parentNodeId: previousVersionNode?.id,
        label: "Document version created from merge",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: nextVersion.id,
        payload: {
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          result_document_version_id: nextVersion.id,
          source_type: "merge",
          source_id: confirmedRecord.id,
          merge_mode: confirmedRecord.mergeMode,
          memory_effect: "updates_document_memory"
        }
      },
      previousVersionNode
        ? {
            id: `timeline-edge-${previousVersionNode.id}-timeline-document-version-created-${input.suffix}`,
            sourceNodeId: previousVersionNode.id,
            edgeType: "sequence",
            label: "new document version"
          }
        : undefined
    );
    const mergeToVersionEdge = TimelineService.createTimelineEdge(
      {
        timelineEdges: versionCreatedResult.timelineEdges
      },
      {
        id: `timeline-edge-${mergeConfirmedNodeId}-timeline-document-version-created-${input.suffix}`,
        projectId: confirmedRecord.projectId,
        sourceNodeId: mergeConfirmedNodeId,
        targetNodeId: `timeline-document-version-created-${input.suffix}`,
        edgeType: "merge_back",
        label: "merge created document version",
        status: "active",
        timestamp: input.now,
        payload: {
          merge_id: confirmedRecord.id,
          result_document_version_id: nextVersion.id
        }
      }
    );
    const activatedEventResult = EventService.createEventWithTimelineNode(
      {
        ...input.state,
        eventLogs: versionCreatedResult.eventLogs,
        timelineNodes: versionCreatedResult.timelineNodes,
        timelineEdges: mergeToVersionEdge.timelineEdges
      },
      {
        id: `event-document-version-activated-${input.suffix}`,
        projectId: confirmedRecord.projectId,
        eventType: "document.version.activated",
        objectType: "document_version",
        objectId: nextVersion.id,
        actor: "system",
        timestamp: input.now,
        payload: {
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          active_document_version_id: nextVersion.id,
          source_type: "merge",
          source_id: confirmedRecord.id,
          merge_id: confirmedRecord.id
        }
      },
      {
        id: `timeline-document-version-activated-${input.suffix}`,
        conversationId: confirmedRecord.conversationId,
        parentNodeId: `timeline-document-version-created-${input.suffix}`,
        label: "Document version activated",
        memoryScope: "document",
        memoryEffect: "updates_document_memory",
        status: "active",
        createdContentRef: nextVersion.id,
        payload: {
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          active_document_version_id: nextVersion.id,
          source_type: "merge",
          source_id: confirmedRecord.id,
          merge_id: confirmedRecord.id,
          memory_effect: "updates_document_memory"
        }
      },
      {
        id: `timeline-edge-timeline-document-version-created-${input.suffix}-timeline-document-version-activated-${input.suffix}`,
        sourceNodeId: `timeline-document-version-created-${input.suffix}`,
        edgeType: "sequence",
        label: "activate document version"
      }
    );
    const project = projectWithActiveVersion({
      state: input.state,
      projectId: confirmedRecord.projectId,
      activeDocumentVersionId: nextVersion.id,
      now: input.now
    });
    const conversation = conversationWithActiveVersion({
      state: input.state,
      projectId: confirmedRecord.projectId,
      conversationId: confirmedRecord.conversationId,
      activeDocumentVersionId: nextVersion.id,
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
        [activeVersion.id]: {
          ...activeVersion,
          status: "superseded"
        },
        [nextVersion.id]: nextVersion
      },
      mergeRecords: {
        ...input.state.mergeRecords,
        [confirmedRecord.id]: confirmedRecord
      },
      eventLogs: activatedEventResult.eventLogs,
      timelineNodes: activatedEventResult.timelineNodes,
      timelineEdges: activatedEventResult.timelineEdges
    };

    if (confirmedRecord.sourceBranchId) {
      const branch = nextState.revisionBranches[confirmedRecord.sourceBranchId];

      if (branch) {
        const mergedBranch: RevisionBranchModel = {
          ...branch,
          status: "merged",
          memoryEffect: "branch_only",
          updatedAt: input.now,
          payload: {
            ...branch.payload,
            merged_at: input.now,
            result_document_version_id: nextVersion.id,
            merge_id: confirmedRecord.id
          }
        };
        const branchNode = latestNodeForObject(nextState, "revision_branch", branch.id);
        const branchEvent = EventService.createEventWithTimelineNode(
          nextState,
          {
            id: `event-branch-merged-${input.suffix}`,
            projectId: confirmedRecord.projectId,
            eventType: "branch.merged",
            objectType: "revision_branch",
            objectId: branch.id,
            actor: "system",
            timestamp: input.now,
            payload: {
              branch_id: branch.id,
              merge_id: confirmedRecord.id,
              result_document_version_id: nextVersion.id
            }
          },
          {
            id: `timeline-branch-merged-${input.suffix}`,
            conversationId: confirmedRecord.conversationId,
            parentNodeId: branchNode?.id,
            label: "Branch marked merged",
            memoryScope: "branch",
            memoryEffect: "branch_only",
            status: "merged",
            createdContentRef: branch.id,
            payload: {
              branch_id: branch.id,
              merge_id: confirmedRecord.id,
              result_document_version_id: nextVersion.id
            }
          },
          branchNode
            ? {
                id: `timeline-edge-${branchNode.id}-timeline-branch-merged-${input.suffix}`,
                sourceNodeId: branchNode.id,
                edgeType: "branch_status",
                label: "branch merged"
              }
            : undefined
        );

        nextState = {
          ...nextState,
          revisionBranches: {
            ...nextState.revisionBranches,
            [mergedBranch.id]: mergedBranch
          },
          eventLogs: branchEvent.eventLogs,
          timelineNodes: branchEvent.timelineNodes,
          timelineEdges: branchEvent.timelineEdges
        };
      }
    }

    for (const selection of Object.values(nextState.textSelections).filter(
      (candidate) => candidate.sourceDocumentVersionId === activeVersion.id
    )) {
      const overlapWithChangedRange = rangesOverlap(selection, diff.changedRanges);
      const nextAnchorStatus = overlapWithChangedRange
        ? "needs_review"
        : "previous_version";
      const updatedSelection: TextSelectionModel = {
        ...selection,
        anchorStatus: nextAnchorStatus,
        payload: {
          ...selection.payload,
          previous_anchor_status: selection.anchorStatus ?? "active",
          anchor_status: nextAnchorStatus,
          document_version_before_id: activeVersion.id,
          document_version_after_id: nextVersion.id,
          reason: overlapWithChangedRange
            ? "selection_range_overlaps_changed_range"
            : "selection_from_previous_version_not_overlapping_change",
          overlap_with_changed_range: overlapWithChangedRange
        }
      };
      const selectionEvent = EventService.createEventWithTimelineNode(
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
            document_version_before_id: activeVersion.id,
            document_version_after_id: nextVersion.id,
            reason: updatedSelection.payload?.reason,
            overlap_with_changed_range: overlapWithChangedRange
          }
        },
        {
          id: `timeline-selection-anchor-status-${selection.id}-${input.suffix}`,
          conversationId: selection.conversationId,
          parentNodeId: mergeConfirmedNodeId,
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
            document_version_before_id: activeVersion.id,
            document_version_after_id: nextVersion.id,
            reason: updatedSelection.payload?.reason,
            overlap_with_changed_range: overlapWithChangedRange
          }
        },
        {
          id: `timeline-edge-${mergeConfirmedNodeId}-timeline-selection-anchor-status-${selection.id}-${input.suffix}`,
          sourceNodeId: mergeConfirmedNodeId,
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
        eventLogs: selectionEvent.eventLogs,
        timelineNodes: selectionEvent.timelineNodes,
        timelineEdges: selectionEvent.timelineEdges
      };
    }

    return {
      ok: true,
      conflict: false,
      state: nextState,
      mergeRecord: confirmedRecord,
      documentVersion: nextVersion,
      previousDocumentVersion: activeVersion,
      diff
    };
  }

  static cancelMerge(input: MergeRecordInput) {
    return MergeService.updateMergeStatus(input, "cancelled", "merge.cancelled");
  }

  static discardMerge(input: MergeRecordInput) {
    return MergeService.updateMergeStatus(input, "discarded", "merge.discarded");
  }

  static deleteMerge(input: MergeRecordInput) {
    return MergeService.updateMergeStatus(input, "deleted", "merge.deleted");
  }

  private static updateMergeStatus(
    input: MergeRecordInput,
    status: "cancelled" | "discarded" | "deleted",
    eventType: "merge.cancelled" | "merge.discarded" | "merge.deleted"
  ): {
    state: RevisionRepositoryState;
    mergeRecord: MergeRecordModel;
  } {
    const record = input.state.mergeRecords[input.mergeId];

    if (!record) {
      throw new Error("MergeRecord not found");
    }

    const updatedRecord: MergeRecordModel = {
      ...record,
      status,
      updatedAt: input.now,
      cancelledAt: status === "cancelled" ? input.now : record.cancelledAt,
      discardedAt: status === "discarded" ? input.now : record.discardedAt,
      deletedAt: status === "deleted" ? input.now : record.deletedAt
    };
    const eventResult = createMergeLifecycleEvent({
      state: input.state,
      record: updatedRecord,
      eventType,
      now: input.now,
      suffix: input.suffix
    });

    return {
      state: {
        ...input.state,
        mergeRecords: {
          ...input.state.mergeRecords,
          [updatedRecord.id]: updatedRecord
        },
        eventLogs: eventResult.eventLogs,
        timelineNodes: eventResult.timelineNodes,
        timelineEdges: eventResult.timelineEdges
      },
      mergeRecord: updatedRecord
    };
  }

  static getMergeRecord(
    state: Pick<RevisionRepositoryState, "mergeRecords">,
    mergeId: string
  ) {
    return state.mergeRecords[mergeId];
  }

  static getMergeRecordsForSelection(
    state: Pick<RevisionRepositoryState, "mergeRecords">,
    selectionId: string
  ) {
    return Object.values(state.mergeRecords).filter(
      (record) =>
        record.sourceSelectionId === selectionId ||
        record.targetSelectionId === selectionId
    );
  }

  static getMergeRecordsForLocalThread(
    state: Pick<RevisionRepositoryState, "mergeRecords">,
    localThreadId: string
  ) {
    return Object.values(state.mergeRecords).filter(
      (record) => record.sourceLocalThreadId === localThreadId
    );
  }

  static getMergeRecordsForBranch(
    state: Pick<RevisionRepositoryState, "mergeRecords">,
    branchId: string
  ) {
    return Object.values(state.mergeRecords).filter(
      (record) => record.sourceBranchId === branchId || record.sourceId === branchId
    );
  }
}
