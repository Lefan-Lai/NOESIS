import type {
  FlexiblePayload,
  RevisionObjectType,
  RevisionRepositoryState
} from "@/types/revision";
import type {
  ConfirmationRequirement,
  DiffRequirement,
  WorkspaceActionId,
  WorkspaceActionTarget,
  WorkspaceUser
} from "@/types/workspaceActions";
import { DocumentVersionService } from "./DocumentVersionService";
import { TimelineService } from "./TimelineService";
import { WorkspaceActionRegistry } from "./WorkspaceActionRegistry";
import { FeatureFlagService } from "./FeatureFlagService";

type GuardResult = {
  ok: boolean;
  reason?: string;
};

type GuardableObject = {
  id: string;
  projectId?: string;
  conversationId?: string;
  status?: string;
  sourceSelectionId?: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceObjectType?: RevisionObjectType;
  sourceObjectId?: string;
  scopeType?: string;
  scopeId?: string;
  scopeObjectId?: string;
  payload?: FlexiblePayload;
};

function collectionForType(
  state: RevisionRepositoryState,
  objectType?: WorkspaceActionTarget["objectType"]
): Record<string, GuardableObject> | undefined {
  switch (objectType) {
    case "project":
      return state.projects as Record<string, GuardableObject>;
    case "main_conversation":
      return state.mainConversations as Record<string, GuardableObject>;
    case "message":
      return state.revisionMessages as Record<string, GuardableObject>;
    case "document_version":
      return state.documentVersions as Record<string, GuardableObject>;
    case "manual_edit_draft":
      return state.manualEditDrafts as Record<string, GuardableObject>;
    case "text_selection":
      return state.textSelections as Record<string, GuardableObject>;
    case "local_thread":
      return state.localThreads as Record<string, GuardableObject>;
    case "local_selection":
      return state.localSelections as Record<string, GuardableObject>;
    case "annotation":
      return state.annotations as Record<string, GuardableObject>;
    case "revision_branch":
      return state.revisionBranches as Record<string, GuardableObject>;
    case "merge_record":
      return state.mergeRecords as Record<string, GuardableObject>;
    case "comparison_graph":
      return state.comparisonGraphs as Record<string, GuardableObject>;
    case "comparison_run":
      return state.comparisonRuns as Record<string, GuardableObject>;
    case "comparison_export":
      return state.comparisonExports as Record<string, GuardableObject>;
    case "timeline_node":
      return state.timelineNodes as Record<string, GuardableObject>;
    case "timeline_edge":
      return state.timelineEdges as Record<string, GuardableObject>;
    case "llm_call":
      return state.llmCallRecords as unknown as Record<string, GuardableObject>;
    case "context_snapshot":
      return state.contextSnapshots as unknown as Record<string, GuardableObject>;
    default:
      return undefined;
  }
}

export function getActionTargetObject(
  state: RevisionRepositoryState,
  target?: WorkspaceActionTarget
) {
  if (!target?.objectType || !target.objectId || target.objectType === "window") {
    return undefined;
  }

  return collectionForType(state, target.objectType)?.[target.objectId];
}

function targetStatus(
  state: RevisionRepositoryState | undefined,
  target?: WorkspaceActionTarget
) {
  if (!target) {
    return undefined;
  }

  if (state) {
    const object = getActionTargetObject(state, target);
    if (object?.status) {
      return object.status;
    }
  }

  return target.status;
}

function userHasPermissions(user: WorkspaceUser | undefined, required: string[]) {
  if (!required.length) {
    return true;
  }

  if (!user) {
    return false;
  }

  if (user.permissions === "*" || user.role === "owner" || user.role === "admin") {
    return true;
  }

  return required.every((permission) =>
    user.permissions?.includes(permission as never)
  );
}

function projectIsActive(
  state: RevisionRepositoryState,
  target?: WorkspaceActionTarget,
  object?: GuardableObject
) {
  const projectId = target?.projectId ?? object?.projectId;

  if (!projectId) {
    return true;
  }

  const project = state.projects[projectId];

  return !project || project.status === "active";
}

function conversationIsActive(
  state: RevisionRepositoryState,
  target?: WorkspaceActionTarget,
  object?: GuardableObject
) {
  const conversationId = target?.conversationId ?? object?.conversationId;

  if (!conversationId) {
    return true;
  }

  const conversation = state.mainConversations[conversationId];

  return !conversation || conversation.status === "active";
}

function hasDeletedParent(
  state: RevisionRepositoryState,
  object?: GuardableObject
) {
  if (!object) {
    return false;
  }

  const parentSelectionId =
    object.parentSelectionId ??
    object.sourceSelectionId ??
    (object.scopeType === "selected_text"
      ? object.scopeId ?? object.scopeObjectId
      : undefined) ??
    (object.payload?.parent_selection_id as string | undefined) ??
    (object.payload?.source_selection_id as string | undefined);
  const parentLocalSelectionId =
    object.parentLocalSelectionId ??
    (object.payload?.parent_local_selection_id as string | undefined) ??
    (object.payload?.source_local_selection_id as string | undefined);
  const sourceLocalThreadId =
    object.sourceLocalThreadId ??
    (object.payload?.source_local_thread_id as string | undefined);

  if (parentSelectionId && state.textSelections[parentSelectionId]?.status === "deleted") {
    return true;
  }

  if (
    parentLocalSelectionId &&
    state.localSelections[parentLocalSelectionId]?.status === "deleted"
  ) {
    return true;
  }

  if (
    sourceLocalThreadId &&
    state.localThreads[sourceLocalThreadId]?.status === "deleted"
  ) {
    return true;
  }

  return false;
}

function confirmationBody(actionId: WorkspaceActionId) {
  if (actionId === "object.delete") {
    return "The target will be permanently excluded from all future LLM context. Historical event and timeline records remain.";
  }

  if (actionId === "object.discard") {
    return "The target will be retained for history, but excluded from context by default.";
  }

  if (actionId === "timeline.revert_to_node") {
    return "The active path will move to the selected node. Future nodes are preserved but marked inactive.";
  }

  if (actionId === "merge.into_document") {
    return "The confirmed fragment will create a new active DocumentVersion.";
  }

  if (actionId === "document.confirm_edit") {
    return "The confirmed draft will create a new active DocumentVersion.";
  }

  return "This action changes persistent revision state.";
}

export class ActionGuardService {
  static canRunAction(
    actionId: WorkspaceActionId,
    target?: WorkspaceActionTarget,
    user?: WorkspaceUser,
    state?: RevisionRepositoryState
  ): GuardResult {
    const definition = WorkspaceActionRegistry.getAction(actionId);

    if (!definition) {
      return {
        ok: false,
        reason: `Unknown action: ${actionId}`
      };
    }

    if (!userHasPermissions(user, definition.requiredPermissions)) {
      return {
        ok: false,
        reason: "missing_required_permission"
      };
    }

    const acceptsNoTarget = definition.targetObjectTypes.includes("none");
    const targetType = target?.objectType;

    if (!acceptsNoTarget) {
      if (!targetType) {
        return {
          ok: false,
          reason: "target_required"
        };
      }

      if (!definition.targetObjectTypes.includes(targetType)) {
        return {
          ok: false,
          reason: `invalid_target_type:${targetType}`
        };
      }
    }

    if (targetType === "window" || acceptsNoTarget) {
      return {
        ok: true
      };
    }

    const object = state ? getActionTargetObject(state, target) : undefined;

    if (state && !object) {
      return {
        ok: false,
        reason: "target_not_found"
      };
    }

    const status = targetStatus(state, target) ?? "active";

    if (definition.blockedStatuses.includes(status)) {
      return {
        ok: false,
        reason: `${status}_object_blocked`
      };
    }

    if (
      definition.allowedStatuses !== "*" &&
      !definition.allowedStatuses.includes(status)
    ) {
      return {
        ok: false,
        reason: `status_not_allowed:${status}`
      };
    }

    if (definition.readsContent && status === "deleted") {
      return {
        ok: false,
        reason: "deleted_content_cannot_be_used"
      };
    }

    if (
      status === "discarded" &&
      [
        "merge.into_document",
        "message.regenerate",
        "branch.create",
        "annotation.keep_as_note",
        "comparison.regenerate"
      ].includes(actionId)
    ) {
      return {
        ok: false,
        reason: "discarded_object_must_be_restored_first"
      };
    }

    if (
      status === "inactive" &&
      definition.mutatesData &&
      actionId !== "object.restore" &&
      actionId !== "timeline.revert_to_node"
    ) {
      return {
        ok: false,
        reason: "inactive_object_opens_in_history_mode"
      };
    }

    if (state) {
      if (!projectIsActive(state, target, object)) {
        return {
          ok: false,
          reason: "project_not_active"
        };
      }

      if (
        FeatureFlagService.shouldBlockHighRiskAction({
          state,
          actionId,
          projectId: target?.projectId ?? object?.projectId
        })
      ) {
        return {
          ok: false,
          reason: "revision_workspace_backfill_required"
        };
      }

      if (!conversationIsActive(state, target, object)) {
        return {
          ok: false,
          reason: "conversation_not_active"
        };
      }

      if (hasDeletedParent(state, object)) {
        return {
          ok: false,
          reason: "parent_object_deleted"
        };
      }

      if (definition.requiresActiveDocumentVersion) {
        const projectId = target?.projectId ?? object?.projectId;
        const conversationId = target?.conversationId ?? object?.conversationId;
        const activeVersion = projectId
          ? DocumentVersionService.getActiveDocumentVersion(
              state,
              projectId,
              conversationId
            )
          : undefined;

        if (!activeVersion) {
          return {
            ok: false,
            reason: "active_document_version_required"
          };
        }
      }

      if (definition.requiresActiveTimelinePath) {
        const projectId = target?.projectId ?? object?.projectId;
        const conversationId = target?.conversationId ?? object?.conversationId;
        const activePath = projectId
          ? TimelineService.getActivePath(state, projectId, conversationId)
          : undefined;

        if (!activePath) {
          return {
            ok: false,
            reason: "active_timeline_path_required"
          };
        }
      }
    }

    return {
      ok: true
    };
  }

  static assertCanRunAction(
    actionId: WorkspaceActionId,
    target?: WorkspaceActionTarget,
    user?: WorkspaceUser,
    state?: RevisionRepositoryState
  ) {
    const result = ActionGuardService.canRunAction(
      actionId,
      target,
      user,
      state
    );

    if (!result.ok) {
      throw new Error(result.reason ?? "action_blocked");
    }

    return true;
  }

  static getDisabledReason(
    actionId: WorkspaceActionId,
    target?: WorkspaceActionTarget,
    user?: WorkspaceUser,
    state?: RevisionRepositoryState
  ) {
    return ActionGuardService.canRunAction(actionId, target, user, state).reason;
  }

  static getRequiredConfirmation(
    actionId: WorkspaceActionId,
    target?: WorkspaceActionTarget
  ): ConfirmationRequirement | undefined {
    const definition = WorkspaceActionRegistry.getAction(actionId);

    if (!definition?.requiresConfirmation) {
      return undefined;
    }

    const targetLabel = target?.objectType && target.objectId
      ? `${target.objectType}:${target.objectId}`
      : "selected target";

    return {
      title: definition.label,
      body: confirmationBody(actionId),
      riskLevel: actionId === "object.delete" ? "high" : "medium",
      targetObjectPreview: targetLabel,
      memoryConsequence:
        definition.memoryEffect === "permanently_excluded"
          ? "Deleted memory is never included again."
          : definition.memoryEffect === "excluded_by_default"
            ? "Discarded memory is retained but excluded by default."
            : definition.memoryEffect === "updates_document_memory"
              ? "A confirmed document version becomes future document memory."
              : "No direct memory change.",
      confirmLabel:
        actionId === "object.delete"
          ? "Delete"
          : actionId === "timeline.revert_to_node"
            ? "Revert"
            : "Confirm",
      cancelLabel: "Cancel"
    };
  }

  static getRequiredDiffReview(
    actionId: WorkspaceActionId
  ): DiffRequirement | undefined {
    const definition = WorkspaceActionRegistry.getAction(actionId);

    if (!definition?.requiresDiffReview) {
      return undefined;
    }

    return {
      title: "Review diff",
      body: "This action requires reviewing the proposed diff before it can change document or timeline memory.",
      confirmLabel: "Confirm",
      continueLabel: "Continue Editing",
      cancelLabel: "Cancel"
    };
  }
}
