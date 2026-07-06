export function conversationMessageIdFromSource(sourceMessageId?: string | null) {
  if (!sourceMessageId) {
    return null;
  }

  if (sourceMessageId.startsWith("conv-assistant-")) {
    return sourceMessageId;
  }

  if (sourceMessageId.startsWith("conv-user-")) {
    return sourceMessageId;
  }

  if (sourceMessageId.startsWith("rev-message-assistant-")) {
    return sourceMessageId.replace("rev-message-assistant-", "conv-assistant-");
  }

  if (sourceMessageId.startsWith("rev-message-user-")) {
    return sourceMessageId.replace("rev-message-user-", "conv-user-");
  }

  if (sourceMessageId.startsWith("rev-message-regenerated-")) {
    return sourceMessageId.replace("rev-message-regenerated-", "conv-assistant-");
  }

  return null;
}

function flashElement(element: HTMLElement) {
  element.dataset.sourceLocatorFocus = "true";

  window.setTimeout(() => {
    if (element.dataset.sourceLocatorFocus === "true") {
      delete element.dataset.sourceLocatorFocus;
    }
  }, 2200);
}

export function focusElementById(elementId?: string | null) {
  if (!elementId) {
    return false;
  }

  const element = document.getElementById(elementId);

  if (!element) {
    return false;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });
  flashElement(element);

  return true;
}

export function focusMainMessageBySource(sourceMessageId?: string | null) {
  const conversationMessageId = conversationMessageIdFromSource(sourceMessageId);

  return focusElementById(
    conversationMessageId ? `main-message-${conversationMessageId}` : null
  );
}

export function focusMainSelectionByAnchor(anchorId?: string | null) {
  if (!anchorId) {
    return false;
  }

  return focusElementById(`source-anchor-${anchorId}`) || focusElementById(`main-anchor-${anchorId}`);
}

export type SourceFocusRequest = {
  sourceMessageId?: string | null;
  anchorId?: string | null;
};

export function requestSourceFocus(request: SourceFocusRequest) {
  window.dispatchEvent(
    new CustomEvent<SourceFocusRequest>("answer-atlas:focus-source", {
      detail: request
    })
  );
}
