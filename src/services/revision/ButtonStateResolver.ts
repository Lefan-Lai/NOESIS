import type { RevisionRepositoryState } from "@/types/revision";
import type {
  ButtonState,
  WorkspaceActionId,
  WorkspaceActionTarget,
  WorkspaceUser
} from "@/types/workspaceActions";
import { ActionGuardService } from "./ActionGuardService";
import { WorkspaceActionRegistry } from "./WorkspaceActionRegistry";

function badgeForReason(reason?: string) {
  if (!reason) {
    return undefined;
  }

  if (reason.includes("deleted")) {
    return "Deleted";
  }

  if (reason.includes("discarded")) {
    return "Restore first";
  }

  if (reason.includes("inactive")) {
    return "History mode";
  }

  if (reason.includes("permission")) {
    return "No access";
  }

  if (reason.includes("diff")) {
    return "Diff required";
  }

  return "Unavailable";
}

export class ButtonStateResolver {
  static getButtonState(
    actionId: WorkspaceActionId,
    target?: WorkspaceActionTarget,
    user?: WorkspaceUser,
    state?: RevisionRepositoryState
  ): ButtonState {
    const definition = WorkspaceActionRegistry.getAction(actionId);

    if (!definition) {
      return {
        visible: false,
        enabled: false,
        disabledReason: "unknown_action",
        requiresConfirmation: false,
        requiresDiffReview: false,
        badge: "Unknown"
      };
    }

    const guard = ActionGuardService.canRunAction(
      actionId,
      target,
      user,
      state
    );
    const disabledReason = guard.ok ? undefined : guard.reason;

    return {
      visible: true,
      enabled: guard.ok,
      disabledReason,
      requiresConfirmation: definition.requiresConfirmation,
      requiresDiffReview: definition.requiresDiffReview,
      badge:
        disabledReason && target?.status === "inactive"
          ? "History mode"
          : badgeForReason(disabledReason)
    };
  }
}
