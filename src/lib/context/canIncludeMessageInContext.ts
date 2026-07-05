import type { LocalThread, ThreadMessage } from "@/types/thread";

export function canIncludeMessageInContext(
  message: ThreadMessage,
  thread: LocalThread,
  activePath: string[]
): boolean {
  if (!activePath.includes(thread.createdInVersionNodeId)) {
    return false;
  }

  if (thread.status === "deleted") {
    return false;
  }

  if (thread.status === "discarded") {
    return false;
  }

  if (thread.contextPolicy === "exclude") {
    return false;
  }

  if (message.contentState === "deleted") {
    return false;
  }

  if (message.includeInContext === false) {
    return false;
  }

  return true;
}
