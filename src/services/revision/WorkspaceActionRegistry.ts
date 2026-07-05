import type {
  ActionTimelineMapping,
  WorkspaceActionDefinition,
  WorkspaceActionId
} from "@/types/workspaceActions";

const allActiveLikeStatuses = [
  "active",
  "active_marker",
  "draft",
  "pending",
  "diff_ready",
  "confirmed",
  "conflict",
  "merged",
  "cleared",
  "superseded"
];

const readOnlyStatuses = [
  ...allActiveLikeStatuses,
  "inactive",
  "discarded",
  "deleted",
  "cancelled",
  "failed"
];

export const WORKSPACE_ACTION_DEFINITIONS: Record<
  WorkspaceActionId,
  WorkspaceActionDefinition
> = {
  "message.send": {
    actionId: "message.send",
    label: "Send message",
    targetObjectTypes: ["main_conversation", "local_thread", "comparison_graph"],
    requiredPermissions: ["message:send"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted", "discarded", "inactive"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "included",
    serviceHandler: "message.send",
    successEventType: "message.user.created",
    failureEventType: "llm.call.failed",
    timelineEventType: "message.assistant.created",
    readsContent: true
  },
  "message.regenerate": {
    actionId: "message.regenerate",
    label: "Regenerate answer",
    targetObjectTypes: ["message", "comparison_run"],
    requiredPermissions: ["message:regenerate"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted", "discarded", "inactive", "failed"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "included",
    serviceHandler: "message.regenerate",
    successEventType: "message.regenerated",
    failureEventType: "llm.call.failed",
    timelineEventType: "message.regenerated",
    readsContent: true
  },
  "revise.open": {
    actionId: "revise.open",
    label: "Open revision workspace",
    targetObjectTypes: ["text_selection", "local_selection"],
    requiredPermissions: ["revision:open"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "local_only",
    serviceHandler: "revise.open",
    successEventType: "local_thread.created",
    timelineEventType: "local_thread.created",
    readsContent: true
  },
  "branch.create": {
    actionId: "branch.create",
    label: "Create branch",
    targetObjectTypes: ["local_selection"],
    requiredPermissions: ["branch:create"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted", "discarded", "inactive"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "branch_only",
    serviceHandler: "branch.create",
    successEventType: "branch.created",
    timelineEventType: "branch.created",
    readsContent: true
  },
  "note.open_editor": {
    actionId: "note.open_editor",
    label: "Open note editor",
    targetObjectTypes: ["text_selection", "local_thread", "local_selection", "message"],
    requiredPermissions: ["annotation:write"],
    allowedStatuses: readOnlyStatuses,
    blockedStatuses: ["deleted"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "note.open_editor",
    readsContent: true
  },
  "annotation.add_context_note": {
    actionId: "annotation.add_context_note",
    label: "Add context note",
    targetObjectTypes: ["project", "main_conversation", "document_version", "text_selection", "local_thread", "local_selection", "revision_branch", "comparison_graph"],
    requiredPermissions: ["annotation:write"],
    allowedStatuses: ["active", "merged"],
    blockedStatuses: ["deleted", "discarded", "inactive"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "adds_annotation_memory",
    serviceHandler: "annotation.add_context_note",
    successEventType: "annotation.created",
    timelineEventType: "annotation.created",
    readsContent: true
  },
  "annotation.keep_as_note": {
    actionId: "annotation.keep_as_note",
    label: "Keep as note",
    targetObjectTypes: ["message", "local_selection", "revision_branch", "comparison_run"],
    requiredPermissions: ["annotation:write"],
    allowedStatuses: ["active", "merged"],
    blockedStatuses: ["deleted", "discarded", "inactive", "superseded"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "adds_annotation_memory",
    serviceHandler: "annotation.keep_as_note",
    successEventType: "annotation.kept_from_answer",
    timelineEventType: "annotation.kept_from_answer",
    readsContent: true
  },
  "merge.into_document": {
    actionId: "merge.into_document",
    label: "Merge into document",
    targetObjectTypes: ["local_selection", "message", "revision_branch", "merge_record"],
    requiredPermissions: ["merge:write"],
    allowedStatuses: ["active", "diff_ready", "conflict"],
    blockedStatuses: ["deleted", "discarded", "inactive", "cancelled", "failed"],
    requiresConfirmation: true,
    requiresDiffReview: true,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "updates_document_memory",
    serviceHandler: "merge.into_document",
    successEventType: "merge.confirmed",
    timelineEventType: "merge.confirmed",
    readsContent: true,
    requiresActiveDocumentVersion: true
  },
  "merge.cancel": {
    actionId: "merge.cancel",
    label: "Cancel merge",
    targetObjectTypes: ["merge_record"],
    requiredPermissions: ["merge:write"],
    allowedStatuses: ["pending", "diff_ready", "conflict"],
    blockedStatuses: ["deleted", "discarded", "cancelled", "confirmed"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "excluded_by_default",
    serviceHandler: "merge.cancel",
    successEventType: "merge.cancelled",
    timelineEventType: "merge.cancelled"
  },
  "object.discard": {
    actionId: "object.discard",
    label: "Discard",
    targetObjectTypes: ["message", "annotation", "revision_branch", "local_thread", "merge_record", "comparison_graph"],
    requiredPermissions: ["object:discard"],
    allowedStatuses: ["active", "pending", "diff_ready", "conflict", "cleared"],
    blockedStatuses: ["deleted", "discarded"],
    requiresConfirmation: true,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "excluded_by_default",
    serviceHandler: "object.discard",
    successEventType: "object.discarded",
    timelineEventType: "object.discarded"
  },
  "object.delete": {
    actionId: "object.delete",
    label: "Delete",
    targetObjectTypes: ["message", "annotation", "revision_branch", "local_thread", "merge_record", "comparison_graph", "comparison_run", "comparison_export"],
    requiredPermissions: ["object:delete"],
    allowedStatuses: ["active", "pending", "diff_ready", "conflict", "discarded", "cleared", "failed", "cancelled"],
    blockedStatuses: ["deleted"],
    requiresConfirmation: true,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "permanently_excluded",
    serviceHandler: "object.delete",
    successEventType: "object.deleted",
    timelineEventType: "object.deleted"
  },
  "object.restore": {
    actionId: "object.restore",
    label: "Restore",
    targetObjectTypes: ["message", "annotation", "revision_branch", "local_thread", "merge_record", "comparison_graph"],
    requiredPermissions: ["object:restore"],
    allowedStatuses: ["discarded"],
    blockedStatuses: ["deleted", "active"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "restored_to_scope",
    serviceHandler: "object.restore",
    successEventType: "object.restored",
    timelineEventType: "object.restored"
  },
  "window.minimize": {
    actionId: "window.minimize",
    label: "Minimize window",
    targetObjectTypes: ["window"],
    requiredPermissions: ["window:manage"],
    allowedStatuses: "*",
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "window.minimize"
  },
  "window.close": {
    actionId: "window.close",
    label: "Close window",
    targetObjectTypes: ["window"],
    requiredPermissions: ["window:manage"],
    allowedStatuses: "*",
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "window.close"
  },
  "thread.new": {
    actionId: "thread.new",
    label: "New thread",
    targetObjectTypes: ["project"],
    requiredPermissions: ["thread:create"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "thread.new"
  },
  "project.new": {
    actionId: "project.new",
    label: "New project",
    targetObjectTypes: ["none"],
    requiredPermissions: ["project:create"],
    allowedStatuses: "*",
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "project.new",
    successEventType: "project.created"
  },
  "context.preview": {
    actionId: "context.preview",
    label: "Preview context",
    targetObjectTypes: ["project", "main_conversation", "local_thread", "comparison_graph", "llm_call"],
    requiredPermissions: ["context:read"],
    allowedStatuses: readOnlyStatuses,
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "context.preview"
  },
  "context.review": {
    actionId: "context.review",
    label: "Review context",
    targetObjectTypes: ["context_snapshot", "llm_call"],
    requiredPermissions: ["context:read"],
    allowedStatuses: readOnlyStatuses,
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "context.review"
  },
  "comparison.regenerate": {
    actionId: "comparison.regenerate",
    label: "Regenerate comparison",
    targetObjectTypes: ["comparison_graph"],
    requiredPermissions: ["comparison:write"],
    allowedStatuses: ["active", "cleared"],
    blockedStatuses: ["deleted", "discarded", "inactive"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "none",
    serviceHandler: "comparison.regenerate",
    successEventType: "comparison.regenerated",
    timelineEventType: "comparison.regenerated",
    readsContent: true
  },
  "comparison.clear": {
    actionId: "comparison.clear",
    label: "Clear comparison",
    targetObjectTypes: ["comparison_graph"],
    requiredPermissions: ["comparison:write"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted", "discarded"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "excluded_by_default",
    serviceHandler: "comparison.clear",
    successEventType: "comparison.cleared",
    timelineEventType: "comparison.cleared"
  },
  "map.export": {
    actionId: "map.export",
    label: "Export map",
    targetObjectTypes: ["comparison_graph"],
    requiredPermissions: ["map:export"],
    allowedStatuses: ["active", "cleared"],
    blockedStatuses: ["deleted", "discarded"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "none",
    serviceHandler: "map.export",
    successEventType: "comparison.exported",
    timelineEventType: "comparison.exported",
    readsContent: true
  },
  "timeline.revert_to_node": {
    actionId: "timeline.revert_to_node",
    label: "Revert to this node",
    targetObjectTypes: ["timeline_node"],
    requiredPermissions: ["timeline:revert"],
    allowedStatuses: ["active", "inactive", "active_marker"],
    blockedStatuses: ["deleted"],
    requiresConfirmation: true,
    requiresDiffReview: true,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "changes_active_path",
    serviceHandler: "timeline.revert_to_node",
    successEventType: "timeline.reverted",
    timelineEventType: "timeline.reverted"
  },
  "diff.view": {
    actionId: "diff.view",
    label: "View diff",
    targetObjectTypes: ["manual_edit_draft", "merge_record", "document_version", "timeline_node"],
    requiredPermissions: ["diff:read"],
    allowedStatuses: readOnlyStatuses,
    blockedStatuses: [],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "diff.view"
  },
  "related_thread.open": {
    actionId: "related_thread.open",
    label: "Open related thread",
    targetObjectTypes: ["local_thread", "text_selection", "local_selection"],
    requiredPermissions: ["revision:open"],
    allowedStatuses: readOnlyStatuses,
    blockedStatuses: ["deleted"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: false,
    createsEvent: false,
    createsTimelineNode: false,
    memoryEffect: "none",
    serviceHandler: "related_thread.open",
    readsContent: true
  },
  "document.edit": {
    actionId: "document.edit",
    label: "Edit document",
    targetObjectTypes: ["document_version"],
    requiredPermissions: ["document:edit"],
    allowedStatuses: ["active"],
    blockedStatuses: ["deleted", "discarded", "inactive", "superseded"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "excluded_by_default",
    serviceHandler: "document.edit",
    successEventType: "document.edit_draft.created",
    timelineEventType: "document.edit_draft.created",
    readsContent: true,
    requiresActiveDocumentVersion: true
  },
  "document.preview_diff": {
    actionId: "document.preview_diff",
    label: "Preview diff",
    targetObjectTypes: ["manual_edit_draft"],
    requiredPermissions: ["document:edit"],
    allowedStatuses: ["draft", "ready_for_review"],
    blockedStatuses: ["deleted", "cancelled", "confirmed"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "excluded_by_default",
    serviceHandler: "document.preview_diff",
    successEventType: "document.manual_edit.diff_generated",
    timelineEventType: "document.manual_edit.diff_generated",
    readsContent: true
  },
  "document.confirm_edit": {
    actionId: "document.confirm_edit",
    label: "Confirm edit",
    targetObjectTypes: ["manual_edit_draft"],
    requiredPermissions: ["document:edit"],
    allowedStatuses: ["ready_for_review"],
    blockedStatuses: ["deleted", "cancelled", "confirmed"],
    requiresConfirmation: true,
    requiresDiffReview: true,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "updates_document_memory",
    serviceHandler: "document.confirm_edit",
    successEventType: "document.manual_edited",
    timelineEventType: "document.manual_edited",
    readsContent: true,
    requiresActiveDocumentVersion: true
  },
  "document.cancel_edit": {
    actionId: "document.cancel_edit",
    label: "Cancel edit",
    targetObjectTypes: ["manual_edit_draft"],
    requiredPermissions: ["document:edit"],
    allowedStatuses: ["draft", "ready_for_review"],
    blockedStatuses: ["deleted", "confirmed", "cancelled"],
    requiresConfirmation: false,
    requiresDiffReview: false,
    mutatesData: true,
    createsEvent: true,
    createsTimelineNode: true,
    memoryEffect: "none",
    serviceHandler: "document.cancel_edit",
    successEventType: "document.edit_draft.cancelled",
    timelineEventType: "document.edit_draft.cancelled"
  }
};

export const ACTION_TIMELINE_MAPPINGS: Record<
  WorkspaceActionId,
  ActionTimelineMapping
> = Object.fromEntries(
  Object.values(WORKSPACE_ACTION_DEFINITIONS).map((definition) => [
    definition.actionId,
    {
      actionId: definition.actionId,
      eventType: definition.successEventType,
      targetObjectType:
        definition.targetObjectTypes[0] === "window" ||
        definition.targetObjectTypes[0] === "none"
          ? undefined
          : definition.targetObjectTypes[0],
      memoryScope:
        definition.memoryEffect === "updates_document_memory"
          ? "document"
          : definition.memoryEffect === "branch_only"
            ? "branch"
            : definition.memoryEffect === "local_only"
              ? "local_thread"
              : definition.actionId.startsWith("comparison") ||
                  definition.actionId === "map.export"
                ? "comparison"
                : definition.actionId.startsWith("timeline")
                  ? "timeline"
                  : "conversation",
      memoryEffect: definition.memoryEffect,
      defaultEdgeType:
        definition.actionId === "comparison.regenerate"
          ? "supersede"
          : definition.actionId === "map.export"
            ? "export"
            : definition.actionId === "merge.into_document"
              ? "merge_back"
              : definition.actionId === "timeline.revert_to_node"
                ? "revert"
                : "sequence",
      displayPolicy: definition.createsTimelineNode
        ? definition.actionId.includes("context")
          ? "hidden"
          : definition.actionId.includes("preview")
            ? "collapsed"
            : "visible"
        : "hidden"
    }
  ])
) as Record<WorkspaceActionId, ActionTimelineMapping>;

export class WorkspaceActionRegistry {
  static getAction(actionId: WorkspaceActionId) {
    return WORKSPACE_ACTION_DEFINITIONS[actionId];
  }

  static listActions() {
    return Object.values(WORKSPACE_ACTION_DEFINITIONS);
  }

  static getTimelineMapping(actionId: WorkspaceActionId) {
    return ACTION_TIMELINE_MAPPINGS[actionId];
  }
}
