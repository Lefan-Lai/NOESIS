import type { LocalThread, ThreadMessage } from "@/types/thread";

export function discardThread(
  thread: LocalThread,
  messages: ThreadMessage[],
  now = new Date().toISOString()
) {
  return {
    thread: {
      ...thread,
      status: "discarded" as const,
      visibility: "hidden" as const,
      contextPolicy: "include" as const,
      discardedAt: now,
      updatedAt: now
    },
    messages: messages.map((message) => ({
      ...message,
      contentState: "discarded_but_contextual" as const,
      includeInContext: true
    }))
  };
}
