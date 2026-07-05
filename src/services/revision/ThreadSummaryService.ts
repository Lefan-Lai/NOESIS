import type { ContextSnapshot, LLMCallRecord } from "@/types/context";
import type {
  MessageModel,
  RevisionRepositoryState,
  RevisionThreadType,
  ThreadSummaryModel
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";

const MESSAGE_COUNT_THRESHOLD = 50;
const TOKEN_THRESHOLD = 6000;
const RECENT_RAW_MESSAGES = 12;

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

function messagesForThread(
  state: Pick<RevisionRepositoryState, "revisionMessages">,
  threadType: RevisionThreadType,
  threadId: string
) {
  return Object.values(state.revisionMessages)
    .filter(
      (message) =>
        (message.threadType ?? "main") === threadType &&
        (message.threadId ?? message.conversationId) === threadId &&
        message.status !== "deleted"
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

function compactSummary(messages: MessageModel[]) {
  return messages
    .map((message) => {
      const content = message.status === "deleted" ? "" : message.content;
      const normalized = content.replace(/\s+/g, " ").trim();
      return `${message.role}: ${normalized.slice(0, 220)}`;
    })
    .join("\n");
}

export class ThreadSummaryService {
  static summarizeMessages(
    messages: MessageModel[],
    options: {
      maxMessages?: number;
    } = {}
  ) {
    const covered = messages.slice(0, options.maxMessages ?? messages.length);
    const summaryText = compactSummary(covered);

    return {
      summaryText,
      tokenEstimate: tokenEstimate(summaryText),
      coveredMessageIds: covered.map((message) => message.id)
    };
  }

  static getOrCreateThreadSummary(input: {
    state: RevisionRepositoryState;
    projectId: string;
    conversationId?: string;
    threadType: RevisionThreadType;
    threadId: string;
    model?: string;
    useLLM?: boolean;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const existing = Object.values(input.state.threadSummaries).find(
      (summary) =>
        summary.threadType === input.threadType &&
        summary.threadId === input.threadId &&
        summary.status === "active"
    );

    if (existing) {
      return {
        state: input.state,
        summary: existing,
        created: false
      };
    }

    const messages = messagesForThread(
      input.state,
      input.threadType,
      input.threadId
    );
    const totalTokens = messages.reduce(
      (total, message) => total + tokenEstimate(message.content),
      0
    );
    const shouldSummarize =
      messages.length > MESSAGE_COUNT_THRESHOLD || totalTokens > TOKEN_THRESHOLD;
    const coveredMessages = shouldSummarize
      ? messages.slice(0, Math.max(0, messages.length - RECENT_RAW_MESSAGES))
      : messages;
    const deterministic = ThreadSummaryService.summarizeMessages(coveredMessages);
    const summaryId = `thread-summary-${input.threadType}-${input.threadId}-${hashContent(deterministic.coveredMessageIds.join(","))}`;
    let llmCallRecord: LLMCallRecord | undefined;
    let contextSnapshot: ContextSnapshot | undefined;

    if (input.useLLM) {
      const contextSnapshotId = `context-snapshot-${summaryId}`;
      const llmCallId = `llm-call-${summaryId}`;
      contextSnapshot = {
        id: contextSnapshotId,
        llmCallId,
        projectId: input.projectId,
        callType: input.threadType === "main" ? "main_conversation" : "local_window",
        purpose: "general_followup",
        model: input.model ?? "summary-model",
        sessionId: input.conversationId,
        threadId: input.threadId,
        threadType: input.threadType,
        includedItems: coveredMessages.map((message) => ({
          id: `summary-source-${message.id}`,
          type: "thread_message",
          sourceId: message.id,
          text: message.status === "deleted" ? "" : message.content,
          reason: "thread_summary_source",
          included: message.status !== "deleted"
        })),
        excludedItems: [],
        tokenEstimate: totalTokens,
        contextBuildStrategy: "legacy",
        contextRulesVersion: "phase-11",
        createdAt: now
      };
      llmCallRecord = {
        id: llmCallId,
        projectId: input.projectId,
        callType: contextSnapshot.callType,
        purpose: contextSnapshot.purpose,
        model: input.model ?? "summary-model",
        modelProvider: "mock",
        status: "completed",
        prompt: "Summarize older thread messages.",
        contextSnapshotId,
        sessionId: input.conversationId,
        threadId: input.threadId,
        threadType: input.threadType,
        outputObjectId: summaryId,
        createdAt: now,
        completedAt: now,
        metadata: {
          summary_generation: true
        }
      };
    }

    const summary: ThreadSummaryModel = {
      id: summaryId,
      threadSummaryId: summaryId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      threadType: input.threadType,
      threadId: input.threadId,
      summaryType: shouldSummarize ? "older_messages" : "rolling",
      summaryText: deterministic.summaryText,
      coveredMessageIds: deterministic.coveredMessageIds,
      coveredNodeIds: [],
      startMessageId: coveredMessages[0]?.id,
      endMessageId: coveredMessages.at(-1)?.id,
      tokenEstimate: deterministic.tokenEstimate,
      model: input.model,
      llmCallId: llmCallRecord?.id,
      contextSnapshotId: contextSnapshot?.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        message_count: messages.length,
        covered_message_count: coveredMessages.length,
        recent_raw_messages_kept: shouldSummarize ? RECENT_RAW_MESSAGES : messages.length,
        should_summarize: shouldSummarize
      }
    };

    const stateWithSummary: RevisionRepositoryState = {
      ...input.state,
      threadSummaries: {
        ...input.state.threadSummaries,
        [summary.id]: summary
      },
      contextSnapshots: contextSnapshot
        ? {
            ...input.state.contextSnapshots,
            [contextSnapshot.id]: contextSnapshot
          }
        : input.state.contextSnapshots,
      llmCallRecords: llmCallRecord
        ? {
            ...input.state.llmCallRecords,
            [llmCallRecord.id]: llmCallRecord
          }
        : input.state.llmCallRecords
    };

    return {
      state: MigrationTrackingService.createSystemEvent({
        state: stateWithSummary,
        eventType: "thread.summary.created",
        objectType: "thread_summary",
        objectId: summary.id,
        projectId: input.projectId,
        now,
        payload: {
          conversation_id: input.conversationId,
          thread_type: input.threadType,
          thread_id: input.threadId,
          summary_type: summary.summaryType,
          covered_message_count: summary.coveredMessageIds.length,
          token_estimate: summary.tokenEstimate,
          llm_call_id: llmCallRecord?.id,
          context_snapshot_id: contextSnapshot?.id
        }
      }),
      summary,
      created: true
    };
  }

  static updateThreadSummaryIfNeeded(input: Parameters<typeof ThreadSummaryService.getOrCreateThreadSummary>[0]) {
    const messages = messagesForThread(input.state, input.threadType, input.threadId);
    const active = Object.values(input.state.threadSummaries).find(
      (summary) =>
        summary.threadType === input.threadType &&
        summary.threadId === input.threadId &&
        summary.status === "active"
    );
    const messageIds = messages.map((message) => message.id);

    if (
      active &&
      active.coveredMessageIds.every((id) => messageIds.includes(id)) &&
      active.coveredMessageIds.length === Math.min(
        messageIds.length,
        Math.max(0, messageIds.length - RECENT_RAW_MESSAGES) || messageIds.length
      )
    ) {
      return {
        state: input.state,
        summary: active,
        updated: false
      };
    }

    const now = input.now ?? new Date().toISOString();
    const staleSummaryIds = Object.values(input.state.threadSummaries)
      .filter(
        (summary) =>
          summary.threadType === input.threadType &&
          summary.threadId === input.threadId &&
          summary.status === "active"
      )
      .map((summary) => summary.id);
    const staleSummaries = Object.fromEntries(
      Object.entries(input.state.threadSummaries).map(([id, summary]) => [
        id,
        summary.threadType === input.threadType &&
        summary.threadId === input.threadId &&
        summary.status === "active"
          ? {
              ...summary,
              status: "stale" as const,
              updatedAt: now,
              metadata: {
                ...(summary.metadata ?? {}),
                stale_reason: "thread_summary_updated"
              }
            }
          : summary
      ])
    );
    const result = ThreadSummaryService.getOrCreateThreadSummary({
      ...input,
      now,
      state: {
        ...input.state,
        threadSummaries: staleSummaries
      }
    });

    return {
      ...result,
      state: MigrationTrackingService.createSystemEvent({
        state: result.state,
        eventType: "thread.summary.updated",
        objectType: "thread_summary",
        objectId: result.summary.id,
        projectId: input.projectId,
        now,
        payload: {
          conversation_id: input.conversationId,
          thread_type: input.threadType,
          thread_id: input.threadId,
          stale_summary_ids: staleSummaryIds,
          covered_message_count: result.summary.coveredMessageIds.length,
          token_estimate: result.summary.tokenEstimate
        }
      }),
      updated: true
    };
  }

  static markThreadSummaryStale(input: {
    state: RevisionRepositoryState;
    threadType: RevisionThreadType;
    threadId: string;
    reason: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();

    const staleSummaryIds = Object.values(input.state.threadSummaries)
      .filter(
        (summary) =>
          summary.threadType === input.threadType &&
          summary.threadId === input.threadId &&
          summary.status !== "stale"
      )
      .map((summary) => summary.id);
    const stateWithStaleSummaries: RevisionRepositoryState = {
      ...input.state,
      threadSummaries: Object.fromEntries(
        Object.entries(input.state.threadSummaries).map(([id, summary]) => [
          id,
          summary.threadType === input.threadType && summary.threadId === input.threadId
            ? {
                ...summary,
                status: "stale" as const,
                updatedAt: now,
                metadata: {
                  ...(summary.metadata ?? {}),
                  stale_reason: input.reason
                }
              }
            : summary
        ])
      )
    };

    return staleSummaryIds.reduce(
      (state, summaryId) =>
        MigrationTrackingService.createSystemEvent({
          state,
          eventType: "thread.summary.invalidated",
          objectType: "thread_summary",
          objectId: summaryId,
          projectId: state.threadSummaries[summaryId]?.projectId,
          now,
          payload: {
            reason: input.reason,
            thread_type: input.threadType,
            thread_id: input.threadId
          }
        }),
      stateWithStaleSummaries
    );
  }
}
