import type {
  RevisionRepositoryState,
  RevisionTimelineEdge
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceBackfillService } from "./WorkspaceBackfillService";

export type RepairWorkspaceIntegrityOptions = {
  dryRun?: boolean;
  apply?: boolean;
  projectId?: string;
  conversationId?: string;
  migrationJobId?: string;
  now?: string;
};

export type RepairWorkspaceIntegrityResult = {
  state: RevisionRepositoryState;
  repaired: string[];
  skipped: string[];
  dryRun: boolean;
};

function sortedConversationMessages(
  state: RevisionRepositoryState,
  conversationId: string
) {
  return Object.values(state.revisionMessages)
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export class WorkspaceRepairService {
  static repairWorkspaceIntegrity(
    state: RevisionRepositoryState,
    options: RepairWorkspaceIntegrityOptions = {}
  ): RepairWorkspaceIntegrityResult {
    const dryRun = options.dryRun ?? !options.apply;
    const now = options.now ?? new Date().toISOString();
    const job = WorkspaceBackfillService.ensureMigrationJob({
      state,
      migrationJobId: options.migrationJobId,
      now
    });
    let nextState = job.state;
    const repaired: string[] = [];
    const skipped: string[] = [];
    const conversations = Object.values(nextState.mainConversations).filter(
      (conversation) =>
        (!options.projectId || conversation.projectId === options.projectId) &&
        (!options.conversationId || conversation.id === options.conversationId)
    );

    const mutate = (label: string, apply: () => void) => {
      repaired.push(label);
      if (!dryRun) {
        apply();
      }
    };

    for (const version of Object.values(nextState.documentVersions).filter(
      (item) =>
        (!options.projectId || item.projectId === options.projectId) &&
        (!options.conversationId || item.conversationId === options.conversationId)
    )) {
      if (!version.contentHash || version.contentHash !== hashContent(version.content)) {
        mutate(`content_hash:${version.id}`, () => {
          nextState = {
            ...nextState,
            documentVersions: {
              ...nextState.documentVersions,
              [version.id]: {
                ...nextState.documentVersions[version.id],
                contentHash: hashContent(version.content),
                payload: {
                  ...(nextState.documentVersions[version.id].payload ?? {}),
                  content_hash: hashContent(version.content)
                }
              }
            }
          };
        });
      }
    }

    for (const conversation of conversations) {
      const messages = sortedConversationMessages(nextState, conversation.id);
      const assistantMessages = messages.filter(
        (message) => message.role === "assistant" && message.status !== "deleted"
      );
      const activeVersions = Object.values(nextState.documentVersions).filter(
        (version) =>
          version.conversationId === conversation.id && version.status === "active"
      );

      if (activeVersions.length > 1) {
        skipped.push(`multiple_active_document_versions:${conversation.id}`);
      } else if (assistantMessages.length > 0 && activeVersions.length === 0) {
        mutate(`missing_document_version:${conversation.id}`, () => {
          nextState = WorkspaceBackfillService.backfillDocumentVersions({
            state: nextState,
            conversationId: conversation.id,
            migrationJobId: job.migrationJobId,
            now
          }).state;
        });
      }

      const activePath = conversation.activeTimelinePathId
        ? nextState.timelinePaths[conversation.activeTimelinePathId]
        : undefined;

      if (!activePath && messages.length > 0) {
        mutate(`missing_active_path:${conversation.id}`, () => {
          nextState = WorkspaceBackfillService.backfillTimeline({
            state: nextState,
            conversationId: conversation.id,
            migrationJobId: job.migrationJobId,
            now
          }).state;
        });
      }

      const messageNodes = messages
        .map((message) =>
          Object.values(nextState.timelineNodes).find(
            (node) =>
              node.targetObjectType === "message" &&
              node.targetObjectId === message.id
          )
        )
        .filter(Boolean);

      for (let index = 1; index < messageNodes.length; index += 1) {
        const previous = messageNodes[index - 1]!;
        const current = messageNodes[index]!;
        const hasEdge = Object.values(nextState.timelineEdges).some(
          (edge) =>
            edge.sourceNodeId === previous.id && edge.targetNodeId === current.id
        );

        if (!hasEdge) {
          mutate(`missing_sequence_edge:${previous.id}->${current.id}`, () => {
            const edge: RevisionTimelineEdge = {
              id: `timeline-edge-repair-${previous.id}-${current.id}`,
              projectId: previous.projectId,
              sourceNodeId: previous.id,
              targetNodeId: current.id,
              edgeType: "sequence",
              status: "active",
              timestamp: now,
              payload: {
                repaired: true,
                migration_job_id: job.migrationJobId
              }
            };
            nextState = {
              ...nextState,
              timelineEdges: {
                ...nextState.timelineEdges,
                [edge.id]: edge
              }
            };
          });
        }
      }
    }

    if (!dryRun) {
      nextState = MigrationTrackingService.createSystemEvent({
        state: nextState,
        eventType: "integrity.repair.applied",
        objectType: "migration_job",
        objectId: job.migrationJobId,
        projectId: options.projectId,
        now,
        payload: {
          repaired,
          skipped,
          conversation_id: options.conversationId
        }
      });
      nextState = MigrationTrackingService.finishJob({
        state: nextState,
        migrationJobId: job.migrationJobId,
        status: "completed",
        now,
        metadata: {
          repair_applied: repaired
        }
      });
    }

    return {
      state: nextState,
      repaired,
      skipped,
      dryRun
    };
  }
}

export const repairWorkspaceIntegrity =
  WorkspaceRepairService.repairWorkspaceIntegrity;
