import type { DeletedAnswerTombstone, LocalThread, ThreadMessage } from "@/types/thread";

export function deleteLocalAnswerPermanently(
  thread: LocalThread,
  messages: ThreadMessage[],
  now = new Date().toISOString()
) {
  const tombstone: DeletedAnswerTombstone = {
    id: `tombstone-${thread.id}-${Date.parse(now)}`,
    threadId: thread.id,
    anchorId: thread.anchorId,
    deletedAt: now,
    deletedBy: "user"
  };

  return {
    thread: {
      ...thread,
      status: "deleted" as const,
      visibility: "hidden" as const,
      contextPolicy: "exclude" as const,
      deletedAt: now,
      updatedAt: now
    },
    messages: messages.map((message) => ({
      ...message,
      content: "",
      contentState: "deleted" as const,
      includeInContext: false
    })),
    tombstone
  };
}
