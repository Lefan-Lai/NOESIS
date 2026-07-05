import type {
  MemoryEffect,
  MemoryScope,
  ObjectStatus,
  RevisionEventType,
  RevisionObjectType,
  TimelineEdgeType
} from "./revision";

export const WORKSPACE_ACTION_IDS = [
  "message.send",
  "message.regenerate",
  "revise.open",
  "branch.create",
  "note.open_editor",
  "annotation.add_context_note",
  "annotation.keep_as_note",
  "merge.into_document",
  "merge.cancel",
  "object.discard",
  "object.delete",
  "object.restore",
  "window.minimize",
  "window.close",
  "thread.new",
  "project.new",
  "context.preview",
  "context.review",
  "comparison.regenerate",
  "comparison.clear",
  "map.export",
  "timeline.revert_to_node",
  "diff.view",
  "related_thread.open",
  "document.edit",
  "document.preview_diff",
  "document.confirm_edit",
  "document.cancel_edit"
] as const;

export type WorkspaceActionId = (typeof WORKSPACE_ACTION_IDS)[number];

export type WorkspacePermission =
  | "message:send"
  | "message:regenerate"
  | "revision:open"
  | "branch:create"
  | "annotation:write"
  | "merge:write"
  | "object:discard"
  | "object:delete"
  | "object:restore"
  | "window:manage"
  | "thread:create"
  | "project:create"
  | "context:read"
  | "comparison:write"
  | "map:export"
  | "timeline:revert"
  | "diff:read"
  | "document:edit";

export type WorkspaceUser = {
  id: string;
  role?: "owner" | "admin" | "editor" | "viewer";
  permissions?: WorkspacePermission[] | "*";
};

export type WorkspaceActionTarget = {
  objectType?: RevisionObjectType | "window";
  objectId?: string;
  projectId?: string;
  conversationId?: string;
  status?: ObjectStatus | string;
};

export type WorkspaceActionDefinition = {
  actionId: WorkspaceActionId;
  label: string;
  targetObjectTypes: Array<RevisionObjectType | "window" | "none">;
  requiredPermissions: WorkspacePermission[];
  allowedStatuses: Array<ObjectStatus | string> | "*";
  blockedStatuses: Array<ObjectStatus | string>;
  requiresConfirmation: boolean;
  requiresDiffReview: boolean;
  mutatesData: boolean;
  createsEvent: boolean;
  createsTimelineNode: boolean;
  memoryEffect: MemoryEffect;
  serviceHandler: string;
  successEventType?: RevisionEventType;
  failureEventType?: RevisionEventType;
  timelineEventType?: RevisionEventType;
  readsContent?: boolean;
  requiresActiveDocumentVersion?: boolean;
  requiresActiveTimelinePath?: boolean;
};

export type ActionTimelineMapping = {
  actionId: WorkspaceActionId;
  eventType?: RevisionEventType;
  targetObjectType?: RevisionObjectType;
  sourceObjectType?: RevisionObjectType;
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  defaultEdgeType?: TimelineEdgeType;
  displayPolicy: "visible" | "collapsed" | "hidden";
};

export type ButtonState = {
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
  requiresConfirmation: boolean;
  requiresDiffReview: boolean;
  badge?: string;
};

export type ConfirmationRequirement = {
  title: string;
  body: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  targetObjectPreview?: string;
  memoryConsequence: string;
  confirmLabel: string;
  cancelLabel: string;
};

export type DiffRequirement = {
  title: string;
  body: string;
  diff?: unknown;
  confirmLabel: string;
  continueLabel: string;
  cancelLabel: string;
};

export type ExecuteWorkspaceActionPayload = {
  target?: WorkspaceActionTarget;
  projectId?: string;
  conversationId?: string;
  idempotencyKey?: string;
  confirmed?: boolean;
  diffAccepted?: boolean;
  now?: string;
  suffix?: string;
  [key: string]: unknown;
};

export type ExecuteWorkspaceActionResult =
  | {
      status: "success";
      actionId: WorkspaceActionId;
      result: unknown;
      refreshHints: string[];
      stateChanged: boolean;
      state?: unknown;
    }
  | {
      status: "confirmation_required";
      actionId: WorkspaceActionId;
      confirmation: ConfirmationRequirement;
    }
  | {
      status: "diff_required";
      actionId: WorkspaceActionId;
      diff: DiffRequirement;
      result?: unknown;
      state?: unknown;
    }
  | {
      status: "in_progress";
      actionId: WorkspaceActionId;
      resultReference?: unknown;
    }
  | {
      status: "blocked";
      actionId: WorkspaceActionId;
      reason: string;
    }
  | {
      status: "error";
      actionId: WorkspaceActionId;
      error: string;
      rolledBack: boolean;
      state?: unknown;
    };
