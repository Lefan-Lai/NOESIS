import type { RevisionRepositoryState } from "@/types/revision";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";
import { WorkspaceProjectionService } from "./WorkspaceProjectionService";

function sortMessages(state: RevisionRepositoryState, threadId: string) {
  return Object.values(state.revisionMessages)
    .filter((message) => message.threadId === threadId && message.status !== "deleted")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export class LocalThreadQueryService {
  static getMessagePage(input: {
    state: RevisionRepositoryState;
    threadId: string;
    before?: string;
    after?: string;
    limit?: number;
    now?: string;
  }) {
    const start = performance.now();
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const messages = sortMessages(input.state, input.threadId);
    let startIndex = 0;

    if (input.after) {
      startIndex = messages.findIndex((message) => message.id === input.after) + 1;
    } else if (input.before) {
      const beforeIndex = messages.findIndex((message) => message.id === input.before);
      startIndex = Math.max(0, beforeIndex - limit);
    } else {
      startIndex = Math.max(0, messages.length - limit);
    }

    if (startIndex < 0) {
      startIndex = 0;
    }

    const endIndex = input.before
      ? messages.findIndex((message) => message.id === input.before)
      : startIndex + limit;
    const page = messages.slice(startIndex, Math.max(startIndex, endIndex));
    WorkspaceObservabilityService.recordMetric({
      state: input.state,
      name: "local_thread_message_page_latency_ms",
      value: performance.now() - start,
      unit: "ms",
      projectId: messages[0]?.projectId,
      conversationId: messages[0]?.conversationId,
      now: input.now
    });

    return {
      messages: page,
      hasMoreBefore: startIndex > 0,
      hasMoreAfter: startIndex + page.length < messages.length,
      beforeCursor: page[0]?.id,
      afterCursor: page.at(-1)?.id,
      totalKnownMessages: messages.length
    };
  }

  static openLocalThread(input: {
    state: RevisionRepositoryState;
    threadId: string;
    limit?: number;
    now?: string;
  }) {
    const start = performance.now();
    const relationReadyState = Object.keys(input.state.objectRelationIndex).length
      ? input.state
      : WorkspaceProjectionService.rebuildObjectRelationIndex({
          state: input.state,
          now: input.now
        });
    const thread = relationReadyState.localThreads[input.threadId];

    if (!thread) {
      throw new Error("LocalThread not found");
    }

    const selection = relationReadyState.textSelections[thread.sourceSelectionId];
    const messagePage = LocalThreadQueryService.getMessagePage({
      state: relationReadyState,
      threadId: input.threadId,
      limit: input.limit ?? 20,
      now: input.now
    });
    const counts = WorkspaceProjectionService.relatedObjectCounts(
      relationReadyState,
      "local_thread",
      input.threadId
    );
    const latestNotes = Object.values(relationReadyState.annotations)
      .filter(
        (annotation) =>
          annotation.status === "active" &&
          ((annotation.scopeType === "local_thread" && annotation.scopeId === input.threadId) ||
            annotation.sourceLocalThreadId === input.threadId)
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5)
      .map((annotation) => ({
        id: annotation.id,
        title: annotation.title,
        preview: annotation.content.slice(0, 180),
        updatedAt: annotation.updatedAt
      }));
    const mergeHistorySummary = Object.values(relationReadyState.mergeRecords)
      .filter((merge) => merge.sourceLocalThreadId === input.threadId)
      .reduce<Record<string, number>>((countsByStatus, merge) => {
        countsByStatus[merge.status] = (countsByStatus[merge.status] ?? 0) + 1;
        return countsByStatus;
      }, {});
    WorkspaceObservabilityService.recordMetric({
      state: relationReadyState,
      name: "local_thread_open_latency_ms",
      value: performance.now() - start,
      unit: "ms",
      projectId: thread.projectId,
      conversationId: thread.conversationId,
      now: input.now
    });

    return {
      state: relationReadyState,
      thread,
      parentSelectedText: selection
        ? {
            selectionId: selection.id,
            selectedText: selection.selectedText,
            anchorStatus: selection.anchorStatus,
            sourceDocumentVersionId: selection.sourceDocumentVersionId
          }
        : null,
      messages: messagePage.messages,
      pageInfo: {
        hasMoreBefore: messagePage.hasMoreBefore,
        hasMoreAfter: messagePage.hasMoreAfter,
        beforeCursor: messagePage.beforeCursor,
        afterCursor: messagePage.afterCursor,
        totalKnownMessages: messagePage.totalKnownMessages
      },
      relatedObjectCounts: counts,
      latestRelatedNotesPreview: latestNotes,
      mergeHistorySummary
    };
  }
}
