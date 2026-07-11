import { describe, expect, it } from "vitest";
import { buildHumanTimeline } from "@/components/timeline/timelineHumanize";
import type { LogicAssignmentView } from "@/components/timeline/timelineHumanize";
import type { ConversationMessage } from "@/types/conversation";
import type { Anchor } from "@/types/document";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { VersionNode } from "@/types/version";

function node(
  id: string,
  nodeType: VersionNode["nodeType"],
  createdAt: string,
  overrides: Partial<VersionNode> = {}
): VersionNode {
  return {
    id,
    documentId: "doc-test",
    parentId: null,
    childIds: [],
    nodeType,
    label: id,
    isActivePath: true,
    createdAt,
    ...overrides
  };
}

function conversationMessage(
  id: string,
  role: ConversationMessage["role"],
  content: string
): ConversationMessage {
  return {
    id,
    sessionId: "session-main",
    role,
    content,
    contentState: "normal",
    includeInContext: true,
    createdAt: "2026-07-06T00:00:00.000Z"
  };
}

function threadMessage(
  id: string,
  role: ThreadMessage["role"],
  content: string,
  createdAt = "2026-07-06T00:00:00.000Z"
): ThreadMessage {
  return {
    id,
    threadId: "thread-one",
    role,
    content,
    contentState: "normal",
    includeInContext: true,
    createdAt
  };
}

function build(
  nodes: VersionNode[],
  anchors: Record<string, Anchor>,
  options: {
    showRemovedPaths?: boolean;
    conversationMessages?: Record<string, ConversationMessage>;
    threadMessages?: Record<string, ThreadMessage>;
    logicAssignments?: Record<string, LogicAssignmentView>;
  } = {}
) {
  const threads: Record<string, LocalThread> = {
    "thread-one": {
      id: "thread-one",
      documentId: "doc-test",
      anchorId: "anchor-one",
      selectedText: "First selected sentence",
      status: "active",
      visibility: "visible",
      contextPolicy: "include",
      createdInVersionNodeId: "v-selection-one",
      createdAt: "2026-07-06T00:01:00.000Z",
      updatedAt: "2026-07-06T00:02:00.000Z"
    }
  };

  return buildHumanTimeline(
    nodes,
    {
      anchors,
      threads,
      branches: {},
      documents: {
        "doc-test": {
          id: "doc-test",
          title: "Quanzhou overview",
          rawText: "",
          rootVersionNodeId: "v-created-main",
          activeVersionNodeId: "v-created-main",
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      },
      conversationMessages: options.conversationMessages ?? {},
      threadMessages: options.threadMessages ?? {},
      logicAssignments: options.logicAssignments ?? {}
    },
    {
      showInactive: true,
      showMemory: true,
      showRemovedPaths: options.showRemovedPaths ?? true,
      maxVisibleDepth: "all",
      collapseLargeBranches: false
    }
  );
}

describe("timeline humanized logical source layout", () => {
  it("attaches checks to their source answer instead of the latest thread node", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-selection-two", "anchor_selected", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-two"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "First selected sentence",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:01:00.000Z"
        },
        "anchor-two": {
          id: "anchor-two",
          documentId: "doc-test",
          selectedText: "Second selected sentence from main answer",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:03:00.000Z"
        }
      },
      {
        threadMessages: {
          "msg-user-one": threadMessage(
            "msg-user-one",
            "user",
            "Can this sentence be more specific about Quanzhou history?"
          )
        }
      }
    );

    const firstSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-one"
    );

    expect(result.nodes.find((item) => item.id === "v-selection-one")).toBeUndefined();
    expect(result.nodes.find((item) => item.id === "v-selection-two")).toBeUndefined();
    expect(firstSuggestion?.visualParentId).toBe("v-created-main");
    expect(firstSuggestion?.logicalDepth).toBe(1);
    expect(firstSuggestion?.title).toContain("Check: First selected sentence");
    expect(firstSuggestion?.subtitle).toContain("Question: Can this sentence");
  });

  it("projects each persisted local question and answer pair as one visible check", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-local-question-one", "local_question_asked", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-local-question-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-question-two", "local_question_asked", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-two", "local_answer_generated", "2026-07-06T00:04:00.000Z", {
        parentId: "v-local-question-two",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "Main AAAI paper deadline",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:00:30.000Z"
        }
      },
      {
        threadMessages: {
          "msg-user-one": threadMessage("msg-user-one", "user", "Is there a poster deadline?", "2026-07-06T00:01:00.000Z"),
          "msg-assistant-one": threadMessage("msg-assistant-one", "assistant", "The poster deadline follows notification.", "2026-07-06T00:02:00.000Z"),
          "msg-user-two": threadMessage("msg-user-two", "user", "What format is required?", "2026-07-06T00:03:00.000Z"),
          "msg-assistant-two": threadMessage("msg-assistant-two", "assistant", "Use the conference poster template.", "2026-07-06T00:04:00.000Z")
        }
      }
    );

    expect(result.nodes.find((item) => item.id === "v-local-question-one")).toBeUndefined();
    expect(result.nodes.find((item) => item.id === "v-local-question-two")).toBeUndefined();

    const firstCheck = result.nodes.find((item) => item.id === "v-local-answer-one");
    const followUp = result.nodes.find((item) => item.id === "v-local-answer-two");

    expect(firstCheck?.shortTitle).toContain("Check: First selected sentence");
    expect(firstCheck?.subtitle).toContain("Question: Is there a poster");
    expect(followUp?.shortTitle).toContain("Follow-up: What format");
    expect(followUp?.visualParentId).toBe("v-local-answer-one");
    expect(followUp?.laneId).toBe(firstCheck?.laneId);
  });

  it("attaches checks from local answers to the source local answer", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-selection-local", "anchor_selected", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-local"
      })
    ];
    const result = build(nodes, {
      "anchor-one": {
        id: "anchor-one",
        documentId: "doc-test",
        selectedText: "First selected sentence",
        anchorType: "text_selection",
        sourceMessageId: "rev-message-assistant-main",
        createdAt: "2026-07-06T00:01:00.000Z"
      },
      "anchor-local": {
        id: "anchor-local",
        documentId: "doc-test",
        selectedText: "Selected sentence from a local answer",
        anchorType: "text_selection",
        sourceThreadId: "thread-one",
        sourceMessageId: "rev-local-message-assistant-one",
        createdAt: "2026-07-06T00:03:00.000Z"
      }
    });

    const localCheck = result.nodes.find((item) => item.id === "v-selection-local");
    const parentSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-one"
    );

    expect(localCheck?.visualParentId).toBe("v-local-answer-one");
    expect(localCheck?.logicalDepth).toBe(2);
    expect(localCheck?.laneId).not.toBe(parentSuggestion?.laneId);
  });

  it("keeps follow-ups in one Local Window on the selected-text logic branch", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-two", "local_answer_generated", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "Quanzhou was one of the world's busiest ports.",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:01:00.000Z"
        }
      },
      {
        threadMessages: {
          "msg-user-one": threadMessage(
            "msg-user-one",
            "user",
            "Can this be less absolute and more cautious?",
            "2026-07-06T00:01:00.000Z"
          ),
          "msg-user-two": threadMessage(
            "msg-user-two",
            "user",
            "Add historical evidence or an example here.",
            "2026-07-06T00:03:00.000Z"
          )
        }
      }
    );

    const toneSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-one"
    );
    const evidenceSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-two"
    );

    expect(toneSuggestion?.visualParentId).toBe("v-created-main");
    expect(evidenceSuggestion?.visualParentId).toBe("v-local-answer-one");
    expect(toneSuggestion?.laneId).toBe(evidenceSuggestion?.laneId);
    expect(toneSuggestion?.logicFocusLabel).toContain("First selected sentence");
    expect(evidenceSuggestion?.logicFocusLabel).toBe(
      toneSuggestion?.logicFocusLabel
    );
    expect(toneSuggestion?.shortTitle).toContain("Check: First selected sentence");
    expect(evidenceSuggestion?.shortTitle).toContain("Follow-up: Add historical");
  });

  it("keeps consecutive follow-ups in the same Local Window on one lane", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-two", "local_answer_generated", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-three", "local_answer_generated", "2026-07-06T00:04:00.000Z", {
        parentId: "v-local-answer-two",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "Quanzhou was one of the world's busiest ports.",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:01:00.000Z"
        }
      },
      {
        threadMessages: {
          "msg-user-one": threadMessage(
            "msg-user-one",
            "user",
            "Can this be less absolute and more cautious?",
            "2026-07-06T00:01:00.000Z"
          ),
          "msg-user-two": threadMessage(
            "msg-user-two",
            "user",
            "Add historical evidence or an example here.",
            "2026-07-06T00:02:30.000Z"
          ),
          "msg-user-three": threadMessage(
            "msg-user-three",
            "user",
            "Make the cautious wording a little clearer.",
            "2026-07-06T00:03:30.000Z"
          )
        }
      }
    );

    const firstToneSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-one"
    );
    const evidenceSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-two"
    );
    const resumedToneSuggestion = result.nodes.find(
      (item) => item.id === "v-local-answer-three"
    );

    expect(evidenceSuggestion?.laneId).toBe(firstToneSuggestion?.laneId);
    expect(resumedToneSuggestion?.laneId).toBe(firstToneSuggestion?.laneId);
    expect(evidenceSuggestion?.visualParentId).toBe("v-local-answer-one");
    expect(resumedToneSuggestion?.visualParentId).toBe("v-local-answer-two");
    expect(resumedToneSuggestion?.resumedFromId).toBeUndefined();
  });

  it("lets a user correction move a node back to an earlier logic focus", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-local-answer-two", "local_answer_generated", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "Quanzhou was one of the world's busiest ports.",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:01:00.000Z"
        }
      },
      {
        threadMessages: {
          "msg-user-one": threadMessage(
            "msg-user-one",
            "user",
            "Can this be less absolute and more cautious?",
            "2026-07-06T00:01:00.000Z"
          ),
          "msg-user-two": threadMessage(
            "msg-user-two",
            "user",
            "Add historical evidence or an example here.",
            "2026-07-06T00:02:30.000Z"
          )
        },
        logicAssignments: {
          "v-local-answer-two": {
            nodeId: "v-local-answer-two",
            logicFocusKey:
              "anchor:anchor-one:focus:selected-first selected sentence",
            logicFocusLabel: "First selected sentence",
            targetNodeId: "v-local-answer-one",
            source: "user",
            reason: "User moved this answer back to the tone check."
          }
        }
      }
    );

    const firstToneAnswer = result.nodes.find(
      (item) => item.id === "v-local-answer-one"
    );
    const correctedAnswer = result.nodes.find(
      (item) => item.id === "v-local-answer-two"
    );

    expect(correctedAnswer?.laneId).toBe(firstToneAnswer?.laneId);
    expect(correctedAnswer?.visualParentId).toBe("v-local-answer-one");
    expect(correctedAnswer?.logicAssignmentSource).toBe("user");
  });

  it("keeps later main answers on the main path after local work", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-main-answer-two", "document_revised", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one"
      })
    ];
    const result = build(
      nodes,
      {
        "anchor-one": {
          id: "anchor-one",
          documentId: "doc-test",
          selectedText: "First selected sentence",
          anchorType: "text_selection",
          sourceMessageId: "rev-message-assistant-main",
          createdAt: "2026-07-06T00:01:00.000Z"
        }
      },
      {
        conversationMessages: {
          "conv-user-main": conversationMessage(
            "conv-user-main",
            "user",
            "What is Quanzhou?"
          ),
          "conv-user-two": conversationMessage(
            "conv-user-two",
            "user",
            "Add more about Quanzhou history"
          )
        }
      }
    );

    const firstMainAnswer = result.nodes.find((item) => item.id === "v-created-main");
    const secondMainAnswer = result.nodes.find(
      (item) => item.id === "v-main-answer-two"
    );
    const localAnswer = result.nodes.find((item) => item.id === "v-local-answer-one");

    expect(secondMainAnswer?.visualParentId).toBe("v-created-main");
    expect(secondMainAnswer?.laneId).toBe(firstMainAnswer?.laneId);
    expect(secondMainAnswer?.laneId).not.toBe(localAnswer?.laneId);
    expect(firstMainAnswer?.title).toBe("Question: What is Quanzhou?");
    expect(secondMainAnswer?.title).toBe(
      "Follow-up question: Add more about Quanzhou history"
    );
  });

  it("starts a new main logic root when consecutive questions are unrelated", () => {
    const nodes = [
      node("v-created-love", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-main-answer-iclr", "document_revised", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-love"
      })
    ];
    const result = build(
      nodes,
      {},
      {
        conversationMessages: {
          "conv-user-love": conversationMessage(
            "conv-user-love",
            "user",
            "说说我爱你"
          ),
          "conv-user-iclr": conversationMessage(
            "conv-user-iclr",
            "user",
            "ICLR截稿日期"
          )
        }
      }
    );

    const iclrQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-iclr"
    );

    expect(iclrQuestion?.visualParentId).toBeNull();
    expect(iclrQuestion?.logicRelationType).toBe("new_root");
    expect(iclrQuestion?.shortTitle).toContain("Q:");
  });

  it("places a returning main topic after its logical parent instead of the latest unrelated root", () => {
    const nodes = [
      node("v-created-love", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-main-answer-iclr", "document_revised", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-love"
      }),
      node("v-main-answer-cvpr", "document_revised", "2026-07-06T00:02:00.000Z", {
        parentId: "v-main-answer-iclr"
      }),
      node("v-main-answer-worldcup", "document_revised", "2026-07-06T00:03:00.000Z", {
        parentId: "v-main-answer-cvpr"
      }),
      node("v-main-answer-aaai", "document_revised", "2026-07-06T00:04:00.000Z", {
        parentId: "v-main-answer-worldcup"
      })
    ];
    const result = build(
      nodes,
      {},
      {
        conversationMessages: {
          "conv-user-love": conversationMessage(
            "conv-user-love",
            "user",
            "Say I love you"
          ),
          "conv-user-iclr": conversationMessage(
            "conv-user-iclr",
            "user",
            "ICLR submission deadline"
          ),
          "conv-user-cvpr": conversationMessage(
            "conv-user-cvpr",
            "user",
            "CVPR submission deadline"
          ),
          "conv-user-worldcup": conversationMessage(
            "conv-user-worldcup",
            "user",
            "Do you know the World Cup?"
          ),
          "conv-user-aaai": conversationMessage(
            "conv-user-aaai",
            "user",
            "AAAI submission deadline"
          )
        }
      }
    );

    const iclrQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-iclr"
    );
    const cvprQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-cvpr"
    );
    const worldCupQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-worldcup"
    );
    const aaaiQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-aaai"
    );

    expect(iclrQuestion?.visualParentId).toBeNull();
    expect(cvprQuestion?.visualParentId).toBe("v-main-answer-iclr");
    expect(worldCupQuestion?.visualParentId).toBeNull();
    expect(aaaiQuestion?.visualParentId).toBe("v-main-answer-cvpr");
    expect(aaaiQuestion?.logicRelationType).toBe("continue");
    expect(aaaiQuestion?.logicColumn).toBeCloseTo(
      (cvprQuestion?.logicColumn ?? 0) + 1
    );
    expect(worldCupQuestion?.logicColumn).toBe(0);
    expect(aaaiQuestion?.stackIndex).toBe(cvprQuestion?.stackIndex);
    expect(worldCupQuestion?.stackIndex).not.toBe(iclrQuestion?.stackIndex);
  });

  it("continues the latest main logic when a deictic follow-up asks about it", () => {
    const nodes = [
      node("v-created-iclr", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-main-answer-format", "document_revised", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-iclr"
      })
    ];
    const result = build(
      nodes,
      {},
      {
        conversationMessages: {
          "conv-user-iclr": conversationMessage(
            "conv-user-iclr",
            "user",
            "ICLR截稿日期"
          ),
          "conv-user-format": conversationMessage(
            "conv-user-format",
            "user",
            "那投稿格式呢？"
          )
        }
      }
    );

    const formatQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-format"
    );

    expect(formatQuestion?.visualParentId).toBe("v-created-iclr");
    expect(formatQuestion?.logicRelationType).toBe("continue");
  });

  it("returns to an earlier main logic node when the user explicitly refers back", () => {
    const nodes = [
      node("v-created-love", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-main-answer-iclr", "document_revised", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-love"
      }),
      node("v-main-answer-format", "document_revised", "2026-07-06T00:02:00.000Z", {
        parentId: "v-main-answer-iclr"
      }),
      node("v-main-answer-poetic", "document_revised", "2026-07-06T00:03:00.000Z", {
        parentId: "v-main-answer-format"
      })
    ];
    const result = build(
      nodes,
      {},
      {
        conversationMessages: {
          "conv-user-love": conversationMessage(
            "conv-user-love",
            "user",
            "说说我爱你"
          ),
          "conv-user-iclr": conversationMessage(
            "conv-user-iclr",
            "user",
            "ICLR截稿日期"
          ),
          "conv-user-format": conversationMessage(
            "conv-user-format",
            "user",
            "那投稿格式呢？"
          ),
          "conv-user-poetic": conversationMessage(
            "conv-user-poetic",
            "user",
            "回到刚才那个我爱你，能不能更诗意？"
          )
        }
      }
    );

    const poeticQuestion = result.nodes.find(
      (item) => item.id === "v-main-answer-poetic"
    );

    expect(poeticQuestion?.visualParentId).toBe("v-created-love");
    expect(poeticQuestion?.logicRelationType).toBe("return_to");
  });

  it("connects the first main question to a follow-up even when timestamps match", () => {
    const sameTime = "2026-07-06T00:00:00.000Z";
    const nodes = [
      node("v-main-answer-two", "document_revised", sameTime, {
        parentId: "v-created-main"
      }),
      node("v-created-main", "document_created", sameTime)
    ];
    const result = build(
      nodes,
      {},
      {
        conversationMessages: {
          "conv-user-main": conversationMessage(
            "conv-user-main",
            "user",
            "What is Quanzhou?"
          ),
          "conv-user-two": conversationMessage(
            "conv-user-two",
            "user",
            "Write more about its maritime history"
          )
        }
      }
    );

    const firstMainAnswer = result.nodes.find((item) => item.id === "v-created-main");
    const secondMainAnswer = result.nodes.find(
      (item) => item.id === "v-main-answer-two"
    );

    expect(result.nodes.map((item) => item.id)).toEqual([
      "v-created-main",
      "v-main-answer-two"
    ]);
    expect(secondMainAnswer?.visualParentId).toBe(firstMainAnswer?.id);
    expect(secondMainAnswer?.laneId).toBe(firstMainAnswer?.laneId);
  });

  it("keeps merge action in the local row but lets the document version merge back", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-merged-one", "merged", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-document-after-merge", "document_revised", "2026-07-06T00:04:00.000Z", {
        parentId: "v-merged-one"
      })
    ];
    const result = build(nodes, {
      "anchor-one": {
        id: "anchor-one",
        documentId: "doc-test",
        selectedText: "First selected sentence",
        anchorType: "text_selection",
        sourceMessageId: "rev-message-assistant-main",
        createdAt: "2026-07-06T00:01:00.000Z"
      }
    });

    const firstMainAnswer = result.nodes.find((item) => item.id === "v-created-main");
    const firstCheck = result.nodes.find((item) => item.id === "v-selection-one");
    const localAnswer = result.nodes.find((item) => item.id === "v-local-answer-one");
    const mergeNode = result.nodes.find((item) => item.id === "v-merged-one");
    const documentAfterMerge = result.nodes.find(
      (item) => item.id === "v-document-after-merge"
    );

    expect(localAnswer?.laneId).not.toBe(firstCheck?.laneId);
    expect(mergeNode?.laneId).toBe(localAnswer?.laneId);
    expect(documentAfterMerge?.visualParentId).toBe("v-merged-one");
    expect(documentAfterMerge?.laneId).toBe(firstMainAnswer?.laneId);
  });

  it("keeps discarded and deleted states attached to the affected local row", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-discarded-one", "discarded", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-deleted-one", "deleted", "2026-07-06T00:04:00.000Z", {
        parentId: "v-discarded-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const result = build(nodes, {
      "anchor-one": {
        id: "anchor-one",
        documentId: "doc-test",
        selectedText: "First selected sentence",
        anchorType: "text_selection",
        sourceMessageId: "rev-message-assistant-main",
        createdAt: "2026-07-06T00:01:00.000Z"
      }
    });

    const firstCheck = result.nodes.find((item) => item.id === "v-selection-one");
    const localAnswer = result.nodes.find((item) => item.id === "v-local-answer-one");
    const discarded = result.nodes.find((item) => item.id === "v-discarded-one");
    const deleted = result.nodes.find((item) => item.id === "v-deleted-one");
    const affectedLane = result.lanes.find((lane) => lane.id === localAnswer?.laneId);

    expect(localAnswer?.laneId).not.toBe(firstCheck?.laneId);
    expect(discarded?.laneId).toBe(localAnswer?.laneId);
    expect(deleted?.laneId).toBe(localAnswer?.laneId);
    expect(discarded?.statusTone).toBe("amber");
    expect(deleted?.statusTone).toBe("red");
    expect(affectedLane?.title).toMatch(/^Deleted - Logic/);
  });

  it("can hide removed local paths from the main timeline view", () => {
    const nodes = [
      node("v-created-main", "document_created", "2026-07-06T00:00:00.000Z"),
      node("v-selection-one", "anchor_selected", "2026-07-06T00:01:00.000Z", {
        parentId: "v-created-main",
        relatedAnchorId: "anchor-one"
      }),
      node("v-local-answer-one", "local_answer_generated", "2026-07-06T00:02:00.000Z", {
        parentId: "v-selection-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      }),
      node("v-deleted-one", "deleted", "2026-07-06T00:03:00.000Z", {
        parentId: "v-local-answer-one",
        relatedAnchorId: "anchor-one",
        relatedThreadId: "thread-one"
      })
    ];
    const anchors = {
      "anchor-one": {
        id: "anchor-one",
        documentId: "doc-test",
        selectedText: "First selected sentence",
        anchorType: "text_selection",
        sourceMessageId: "rev-message-assistant-main",
        createdAt: "2026-07-06T00:01:00.000Z"
      }
    } satisfies Record<string, Anchor>;
    const hidden = build(nodes, anchors, { showRemovedPaths: false });
    const shown = build(nodes, anchors, { showRemovedPaths: true });

    expect(hidden.removedPathCount).toBe(1);
    expect(hidden.nodes.find((item) => item.id === "v-selection-one")).toBeDefined();
    expect(hidden.nodes.find((item) => item.id === "v-local-answer-one")).toBeUndefined();
    expect(hidden.nodes.find((item) => item.id === "v-created-main")).toBeDefined();
    expect(shown.nodes.find((item) => item.id === "v-selection-one")).toBeDefined();
    expect(shown.nodes.find((item) => item.id === "v-deleted-one")).toBeDefined();
  });
});
