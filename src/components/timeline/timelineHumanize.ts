import type { Anchor, Document } from "@/types/document";
import type { ConversationMessage } from "@/types/conversation";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { Branch, VersionNode } from "@/types/version";

export type TimelineLaneId = string;

const MAIN_ROW_ID = "row-main";
const MAIN_ROW_PREFIX = `${MAIN_ROW_ID}-`;
const MEMORY_ROW_ID = "row-memory";
const INACTIVE_ROW_ID = "row-inactive";

export type HumanTimelineNode = {
  id: string;
  laneId: TimelineLaneId;
  logicalDepth: number;
  logicColumn: number;
  stackIndex: number;
  branchGroupId: string;
  logicFocusKey?: string;
  logicFocusLabel?: string;
  isLogicStart?: boolean;
  resumedFromId?: string;
  visualParentId?: string | null;
  hubKey?: string;
  isAnchorHub?: boolean;
  actionCount?: number;
  folded: boolean;
  foldReason?: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  statusLabel: string;
  statusTone: "blue" | "green" | "purple" | "amber" | "red" | "slate";
  relationLabel: string;
  logicAssignmentSource?: "auto" | "user";
  logicRelationType?:
    | "new_root"
    | "continue"
    | "return_to"
    | "branch_from"
    | "merge_back"
    | "unassigned";
  logicRouterConfidence?: number;
  logicRouterReason?: string;
  node: VersionNode;
};

export type TimelineLane = {
  id: TimelineLaneId;
  title: string;
  description: string;
  logicalDepth: number;
};

export type TimelineViewMode = "compact" | "detailed";

export type LogicAssignmentView = {
  nodeId: string;
  logicFocusKey: string;
  logicFocusLabel: string;
  targetNodeId?: string | null;
  source: "auto" | "user";
  reason?: string;
};

export type HumanTimelineBuildOptions = {
  showInactive: boolean;
  showMemory: boolean;
  showRemovedPaths: boolean;
  showMain?: boolean;
  showLocal?: boolean;
  showDrafts?: boolean;
  maxVisibleDepth: number | "all";
  collapseLargeBranches: boolean;
};

export type HumanTimelineBuildResult = {
  nodes: HumanTimelineNode[];
  lanes: TimelineLane[];
  inactiveCount: number;
  removedPathCount: number;
  foldedBranchCount: number;
};

type HumanTimelineContext = {
  anchors: Record<string, Anchor>;
  threads: Record<string, LocalThread>;
  branches: Record<string, Branch>;
  documents?: Record<string, Document>;
  conversationMessages?: Record<string, ConversationMessage>;
  threadMessages?: Record<string, ThreadMessage>;
  logicAssignments?: Record<string, LogicAssignmentView>;
};

function excerpt(value?: string | null, limit = 66) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > limit
    ? `${normalized.slice(0, limit - 3)}...`
    : normalized;
}

function normalizeKey(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function stableHash(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash.toString(36);
}

function rowSafeId(value: string) {
  return stableHash(value);
}

function mainRowIdForRoot(rootId: string) {
  return `${MAIN_ROW_PREFIX}${rowSafeId(rootId)}`;
}

function isMainReasoningRow(rowId: TimelineLaneId) {
  return rowId === MAIN_ROW_ID || rowId.startsWith(MAIN_ROW_PREFIX);
}

function scopedRowIdForMain(rowId: TimelineLaneId, mainRootId?: string) {
  if (
    !mainRootId ||
    isMainReasoningRow(rowId) ||
    rowId === MEMORY_ROW_ID ||
    rowId === INACTIVE_ROW_ID
  ) {
    return rowId;
  }

  return `${rowId}-main-${rowSafeId(mainRootId)}`;
}

const LOGIC_FOCUS_PATTERNS = [
  {
    key: "certainty-tone",
    label: "tone / certainty",
    pattern: /(?:\u7edd\u5bf9|\u8c28\u614e|\u8bed\u6c14|\u4fdd\u5b88|\u5938\u5927|\u8fc7\u5ea6|\u80af\u5b9a|\u4e0d\u786e\u5b9a|tone|cautious|absolute|hedg|overclaim|certainty|confidence)/i
  },
  {
    key: "evidence-examples",
    label: "evidence / examples",
    pattern: /(?:\u4f8b\u5b50|\u6848\u4f8b|\u8bc1\u636e|\u5f15\u7528|\u6765\u6e90|\u652f\u6491|\u8bc1\u660e|example|evidence|support|source|citation|cite)/i
  },
  {
    key: "context-background",
    label: "context / background",
    pattern: /(?:\u80cc\u666f|\u5386\u53f2|\u4e0a\u4e0b\u6587|\u539f\u56e0|\u4e3a\u4ec0\u4e48|\u6765\u9f99\u53bb\u8109|context|background|history|why|reason)/i
  },
  {
    key: "precision-clarity",
    label: "precision / clarity",
    pattern: /(?:\u6e05\u695a|\u660e\u786e|\u7cbe\u51c6|\u7cbe\u786e|\u5177\u4f53|\u6a21\u7cca|clarify|clear|specific|precise|precision)/i
  },
  {
    key: "structure-flow",
    label: "structure / flow",
    pattern: /(?:\u7ed3\u6784|\u987a\u5e8f|\u7ec4\u7ec7|\u6bb5\u843d|\u5206\u70b9|\u903b\u8f91|structure|organize|flow|paragraph|outline)/i
  },
  {
    key: "wording-rewrite",
    label: "wording / rewrite",
    pattern: /(?:\u63aa\u8f9e|\u6539\u5199|\u8868\u8fbe|\u6da6\u8272|\u8bf4\u6cd5|wording|rewrite|phrase|rephrase|polish)/i
  },
  {
    key: "brevity",
    label: "brevity",
    pattern: /(?:\u7b80\u6d01|\u7f29\u77ed|\u592a\u957f|\u5197\u957f|\u7cbe\u7b80|shorten|concise|brief|too long)/i
  },
  {
    key: "certainty-tone",
    label: "tone / certainty",
    pattern: /绝对|谨慎|语气|保守|夸大|过度|肯定|不确定|tone|cautious|absolute|hedg|overclaim|certainty|confidence/i
  },
  {
    key: "evidence-examples",
    label: "evidence / examples",
    pattern: /例子|案例|证据|引用|来源|支撑|证明|example|evidence|support|source|citation|cite/i
  },
  {
    key: "context-background",
    label: "context / background",
    pattern: /背景|历史|上下文|原因|为什么|来龙去脉|context|background|history|why|reason/i
  },
  {
    key: "precision-clarity",
    label: "precision / clarity",
    pattern: /清楚|明确|精准|精确|具体|模糊|clarify|clear|specific|precise|precision/i
  },
  {
    key: "structure-flow",
    label: "structure / flow",
    pattern: /结构|顺序|组织|段落|分点|逻辑|structure|organize|flow|paragraph|outline/i
  },
  {
    key: "wording-rewrite",
    label: "wording / rewrite",
    pattern: /措辞|改写|表达|润色|说法|wording|rewrite|phrase|rephrase|polish/i
  },
  {
    key: "brevity",
    label: "brevity",
    pattern: /简洁|缩短|太长|冗长|精简|shorten|concise|brief|too long/i
  }
];

function logicFocusFromText(value?: string | null) {
  const normalized = normalizeKey(value);

  if (!normalized) {
    return undefined;
  }

  const matched = LOGIC_FOCUS_PATTERNS.find(({ pattern }) => pattern.test(normalized));

  if (matched) {
    return {
      key: matched.key,
      label: matched.label
    };
  }

  const compact = normalized
    .replace(
      /\b(can|could|would|should|please|make|this|that|the|a|an|and|or|to|of|for|about|with|it|is|are|be|more|less)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  const signature = compact || normalized;
  const label = timelineTopic(value, 30) || "local issue";

  return {
    key: `topic-${stableHash(signature.slice(0, 120))}`,
    label
  };
}

function timelineTopic(value?: string | null, limit = 36) {
  const compact = excerpt(value, limit)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return compact;
}

function actionTitle(action: string, topic?: string | null, fallback = action) {
  const compactTopic = timelineTopic(topic);

  return compactTopic ? `${action}: ${compactTopic}` : fallback;
}

function actionShortTitle(action: string, topic?: string | null, fallback = action) {
  const compactTopic = timelineTopic(topic, 24);

  return compactTopic ? `${action}: ${compactTopic}` : fallback;
}

function getNodeSuffix(nodeId: string) {
  const prefixes = [
    "v-created-",
    "v-main-answer-",
    "v-local-question-",
    "v-local-answer-",
    "v-selection-",
    "v-local-selection-",
    "v-branch-created-",
    "v-revision-",
    "v-merged-",
    "v-discarded-",
    "v-deleted-",
    "v-annotation-added-",
    "v-annotation-deleted-"
  ];
  const prefix = prefixes.find((item) => nodeId.startsWith(item));

  return prefix ? nodeId.slice(prefix.length) : undefined;
}

function findThreadMessageBySuffix(
  context: HumanTimelineContext,
  suffix: string | undefined,
  role: ThreadMessage["role"]
) {
  if (!suffix || !context.threadMessages) {
    return undefined;
  }

  return (
    context.threadMessages[`msg-${role}-${suffix}`] ??
    Object.values(context.threadMessages).find(
      (message) =>
        message.role === role &&
        (message.id.endsWith(suffix) || message.revisionMessageId?.endsWith(suffix))
    )
  );
}

function findConversationMessageBySuffix(
  context: HumanTimelineContext,
  suffix: string | undefined,
  role: ConversationMessage["role"]
) {
  if (!suffix || !context.conversationMessages) {
    return undefined;
  }

  return (
    context.conversationMessages[`conv-${role}-${suffix}`] ??
    Object.values(context.conversationMessages).find(
      (message) => message.role === role && message.id.endsWith(suffix)
    )
  );
}

function getMainPromptForNode(node: VersionNode, context: HumanTimelineContext) {
  const suffix = getNodeSuffix(node.id);
  const directPrompt = findConversationMessageBySuffix(context, suffix, "user")
    ?.content;

  if (directPrompt) {
    return directPrompt;
  }

  return context.documents?.[node.documentId]?.title;
}

type MainLogicRoute = {
  parentId: string | null;
  relationType: HumanTimelineNode["logicRelationType"];
  confidence: number;
  reason: string;
};

const CHINESE_STOP_BIGRAMS = new Set([
  "\u8bf4\u8bf4",
  "\u90a3\u4e2a",
  "\u8fd9\u4e2a",
  "\u521a\u624d",
  "\u4e4b\u524d",
  "\u524d\u9762",
  "\u4e0a\u9762",
  "\u56de\u5230",
  "\u7ee7\u7eed",
  "\u53ef\u4ee5",
  "\u4e0d\u80fd",
  "\u80fd\u4e0d"
]);

const ENGLISH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "about",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "how",
  "is",
  "it",
  "its",
  "know",
  "me",
  "more",
  "my",
  "of",
  "on",
  "please",
  "said",
  "say",
  "says",
  "that",
  "the",
  "then",
  "this",
  "to",
  "tell",
  "what",
  "when",
  "with",
  "would",
  "we",
  "you",
  "your"
]);

function logicTokens(value?: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  const tokens = new Set<string>();
  const acronymMatches = normalized.match(/[A-Z]{2,}(?:-[A-Z0-9]+)?/g) ?? [];
  const englishMatches = normalized.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const cjkMatches = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];

  acronymMatches.forEach((token) => tokens.add(token.toLowerCase()));
  englishMatches
    .filter((token) => !ENGLISH_STOPWORDS.has(token))
    .forEach((token) => tokens.add(token));
  cjkMatches.forEach((segment) => {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const bigram = segment.slice(index, index + 2);

      if (!CHINESE_STOP_BIGRAMS.has(bigram)) {
        tokens.add(bigram);
      }
    }
  });

  return tokens;
}

function hasReturnSignal(value?: string | null) {
  const text = normalizeKey(value);

  return /(?:\u56de\u5230|\u521a\u624d|\u4e4b\u524d|\u524d\u9762|\u4e0a\u9762|\u5148\u524d|\u521a\u521a|\u90a3\u4e2a|return to|back to|earlier|previous|before|the one about)/i.test(text);
}

function hasContinuationSignal(value?: string | null) {
  const text = normalizeKey(value);

  return /(?:^\u90a3|\u90a3\u4e48|\u7ee7\u7eed|\u8fd9\u4e2a|\u4e0a\u4e00|\u518d|\u8fdb\u4e00\u6b65|\u8fd8\u6709|\bcontinue\b|\bwhat about\b|\bhow about\b|\bthen\b|\balso\b|\bmore\b|\belaborate\b|\bexpand\b|\bit\b|\bits\b|\bthat\b)/i.test(text);
}

function tokenOverlap(a: Set<string>, b: Set<string>) {
  let count = 0;

  a.forEach((token) => {
    if (b.has(token)) {
      count += 1;
    }
  });

  return count;
}

function routeMainLogicNode(
  node: VersionNode,
  context: HumanTimelineContext,
  previousMainNodes: VersionNode[]
): MainLogicRoute {
  if (node.nodeType === "document_created" || previousMainNodes.length === 0) {
    return {
      parentId: null,
      relationType: "new_root",
      confidence: 1,
      reason: "First main question starts a new logic root."
    };
  }

  if (!isMainAnswerUpdateNode(node)) {
    return {
      parentId: node.parentId ?? null,
      relationType: "continue",
      confidence: 0.8,
      reason: "Document operation keeps its explicit source parent."
    };
  }

  const prompt = getMainPromptForNode(node, context);
  const currentTokens = logicTokens(prompt);
  const candidates = previousMainNodes
    .map((candidate) => {
      const candidatePrompt = getMainPromptForNode(candidate, context);

      return {
        node: candidate,
        overlap: tokenOverlap(currentTokens, logicTokens(candidatePrompt)),
        prompt: candidatePrompt
      };
    })
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        new Date(b.node.createdAt).getTime() -
          new Date(a.node.createdAt).getTime()
    );
  const latestMainNode = previousMainNodes.at(-1);
  const bestOverlap = candidates[0];

  if (hasReturnSignal(prompt)) {
    const target = bestOverlap?.overlap ? bestOverlap.node : latestMainNode;

    return {
      parentId: target?.id ?? null,
      relationType: "return_to",
      confidence: bestOverlap?.overlap ? 0.95 : 0.72,
      reason: bestOverlap?.overlap
        ? "Explicit return signal matched an earlier main question."
        : "Explicit return signal was present, but no strong text match was found."
    };
  }

  if (bestOverlap?.overlap) {
    return {
      parentId: bestOverlap.node.id,
      relationType: "continue",
      confidence: bestOverlap.overlap > 1 ? 0.86 : 0.74,
      reason: "Current question shares core terms with an earlier main question."
    };
  }

  if (hasContinuationSignal(prompt) && latestMainNode) {
    return {
      parentId: latestMainNode.id,
      relationType: "continue",
      confidence: 0.68,
      reason: "Continuation wording points to the current active main logic."
    };
  }

  return {
    parentId: null,
    relationType: "new_root",
    confidence: 0.9,
    reason: "No return signal, continuation signal, or shared core terms were found."
  };
}

function getLocalQuestionForNode(node: VersionNode, context: HumanTimelineContext) {
  const suffix = getNodeSuffix(node.id);

  return findThreadMessageBySuffix(context, suffix, "user")?.content;
}

function getLocalAnswerForNode(node: VersionNode, context: HumanTimelineContext) {
  const suffix = getNodeSuffix(node.id);

  return findThreadMessageBySuffix(context, suffix, "assistant")?.content;
}

function threadUserMessageCountBefore(
  node: VersionNode,
  context: HumanTimelineContext,
  inclusive: boolean
) {
  if (!node.relatedThreadId) {
    return 0;
  }

  const nodeTime = new Date(node.createdAt).getTime();

  return Object.values(context.threadMessages ?? {}).filter((message) => {
    if (
      message.threadId !== node.relatedThreadId ||
      message.role !== "user" ||
      message.contentState === "deleted"
    ) {
      return false;
    }

    const messageTime = new Date(message.createdAt).getTime();

    return inclusive ? messageTime <= nodeTime : messageTime < nodeTime;
  }).length;
}

function isLocalFollowUpNode(node: VersionNode, context: HumanTimelineContext) {
  if (!node.relatedThreadId) {
    return false;
  }

  if (node.nodeType === "local_question_asked") {
    return (
      /follow-up/i.test(node.label) ||
      threadUserMessageCountBefore(node, context, false) > 0
    );
  }

  if (node.nodeType === "local_answer_generated") {
    return (
      /follow-up/i.test(node.label) ||
      threadUserMessageCountBefore(node, context, true) > 1
    );
  }

  return false;
}

function getRelatedObjects(node: VersionNode, context: HumanTimelineContext) {
  const anchor = node.relatedAnchorId
    ? context.anchors[node.relatedAnchorId]
    : undefined;
  const thread = node.relatedThreadId
    ? context.threads[node.relatedThreadId]
    : undefined;
  const branch = node.relatedBranchId
    ? context.branches[node.relatedBranchId]
    : undefined;

  return { anchor, thread, branch };
}

function selectedTextForNode(node: VersionNode, context: HumanTimelineContext) {
  const { anchor, thread, branch } = getRelatedObjects(node, context);

  return thread?.selectedText || anchor?.selectedText || branch?.selectedText;
}

function sourceAnchorForNode(node: VersionNode, context: HumanTimelineContext) {
  const { anchor, thread, branch } = getRelatedObjects(node, context);

  return (
    anchor ??
    (thread?.anchorId ? context.anchors[thread.anchorId] : undefined) ??
    (branch?.anchorId ? context.anchors[branch.anchorId] : undefined)
  );
}

function logicFocusForNode(
  node: VersionNode,
  context: HumanTimelineContext,
  hubKey?: string,
  inheritedFocus?: { key: string; label: string }
) {
  const assignment = context.logicAssignments?.[node.id];

  if (assignment) {
    return {
      key: assignment.logicFocusKey,
      label: assignment.logicFocusLabel,
      assignment
    };
  }

  if (!hubKey || node.nodeType === "anchor_selected") {
    return undefined;
  }

  if (inheritedFocus && node.relatedThreadId && isThreadProgressNode(node)) {
    return inheritedFocus;
  }

  if (
    node.nodeType === "branch_created" ||
    node.nodeType === "revision_generated" ||
    node.nodeType === "merged" ||
    node.nodeType === "annotation_added" ||
    node.nodeType === "annotation_deleted" ||
    node.nodeType === "discarded" ||
    node.nodeType === "deleted"
  ) {
    if (inheritedFocus) {
      return inheritedFocus;
    }
  }

  const selectedText = selectedTextForNode(node, context);
  const localQuestion = getLocalQuestionForNode(node, context);
  const localAnswer = getLocalAnswerForNode(node, context);
  const normalizedSelection = normalizeKey(selectedText);
  const focus = normalizedSelection
    ? {
        key: `selected-${normalizedSelection.slice(0, 120)}`,
        label: excerpt(selectedText, 42)
      }
    : logicFocusFromText(localQuestion || localAnswer);

  if (!focus) {
    return inheritedFocus;
  }

  return {
    key: `${hubKey}:focus:${focus.key}`,
    label: focus.label
  };
}

function hubKeyForNode(node: VersionNode, context: HumanTimelineContext) {
  const { anchor, thread, branch } = getRelatedObjects(node, context);
  const anchorId =
    node.relatedAnchorId || thread?.anchorId || branch?.anchorId || anchor?.id;

  if (anchorId) {
    return `anchor:${anchorId}`;
  }

  const selectedText = anchor?.selectedText || thread?.selectedText || branch?.selectedText;
  const normalized = normalizeKey(selectedText);

  return normalized ? `text:${normalized.slice(0, 120)}` : undefined;
}

function readableLabel(label: string) {
  return label
    .replace(/^LLM document generated$/i, "Answered question")
    .replace(/^Main answer updated$/i, "Follow-up answer")
    .replace(/^Selected local text$/i, "Checked local answer")
    .replace(/^Selected text$/i, "Checked sentence")
    .replace(/^Local answer generated$/i, "Local answer")
    .replace(/^Created revision branch$/i, "Drafted alternative wording")
    .replace(/^Merged into main document$/i, "Merged local change");
}

function isInactiveNode(node: VersionNode) {
  if (!node.isActivePath && node.nodeType !== "branch_created") {
    return true;
  }

  return false;
}

function isMemoryNode(node: VersionNode) {
  return node.nodeType === "annotation_added" || node.nodeType === "annotation_deleted";
}

function startsBranch(node: VersionNode) {
  return node.nodeType === "anchor_selected" || node.nodeType === "branch_created";
}

function mergesBack(node: VersionNode) {
  return node.nodeType === "merged" || node.nodeType === "document_revised";
}

function isMainProgressNode(node: VersionNode) {
  return (
    node.nodeType === "document_created" ||
    node.nodeType === "document_revised" ||
    node.nodeType === "reverted"
  );
}

function isMainAnswerUpdateNode(node: VersionNode) {
  return (
    node.nodeType === "document_revised" &&
    !/v\d+/i.test(node.label) &&
    !/^(Manual document edit|Edited document|Merged into main document)$/i.test(
      node.label
    )
  );
}

function isSelectionNode(node: VersionNode) {
  return node.nodeType === "anchor_selected";
}

function isThreadProgressNode(node: VersionNode) {
  return (
    node.nodeType === "local_question_asked" ||
    node.nodeType === "local_answer_generated" ||
    node.nodeType === "branch_created" ||
    node.nodeType === "revision_generated" ||
    node.nodeType === "merged"
  );
}

function isObjectStateNode(node: VersionNode) {
  return node.nodeType === "discarded" || node.nodeType === "deleted";
}

const NODE_SORT_RANK: Record<VersionNode["nodeType"], number> = {
  document_created: 0,
  document_revised: 1,
  reverted: 2,
  anchor_selected: 3,
  local_question_asked: 4,
  local_answer_generated: 5,
  branch_created: 6,
  revision_generated: 7,
  annotation_added: 8,
  annotation_deleted: 9,
  merged: 10,
  discarded: 11,
  deleted: 12
};

function compareVersionNodes(a: VersionNode, b: VersionNode) {
  const timeDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

  if (timeDelta !== 0) {
    return timeDelta;
  }

  if (a.id === b.parentId) {
    return -1;
  }

  if (b.id === a.parentId) {
    return 1;
  }

  const rankDelta = NODE_SORT_RANK[a.nodeType] - NODE_SORT_RANK[b.nodeType];

  if (rankDelta !== 0) {
    return rankDelta;
  }

  return a.id.localeCompare(b.id);
}

function sourceMessageNodeId(
  sourceMessageId: string | undefined,
  byId: Record<string, VersionNode>
) {
  if (!sourceMessageId) {
    return undefined;
  }

  const candidateGroups = [
    {
      prefix: "rev-message-assistant-",
      nodePrefixes: ["v-created-", "v-main-answer-"]
    },
    {
      prefix: "rev-message-regenerated-",
      nodePrefixes: ["v-main-answer-", "v-created-"]
    },
    {
      prefix: "conv-assistant-",
      nodePrefixes: ["v-created-", "v-main-answer-"]
    },
    {
      prefix: "rev-local-message-assistant-",
      nodePrefixes: ["v-local-answer-"]
    },
    {
      prefix: "rev-nested-local-message-assistant-",
      nodePrefixes: ["v-local-answer-"]
    },
    {
      prefix: "msg-assistant-",
      nodePrefixes: ["v-local-answer-"]
    }
  ];

  for (const group of candidateGroups) {
    if (!sourceMessageId.startsWith(group.prefix)) {
      continue;
    }

    const suffix = sourceMessageId.slice(group.prefix.length);
    const match = group.nodePrefixes
      .map((prefix) => `${prefix}${suffix}`)
      .find((candidateId) => byId[candidateId]);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function sourceParentNodeIdForNode(
  node: VersionNode,
  context: HumanTimelineContext,
  byId: Record<string, VersionNode>,
  fallbackMainNodeId?: string
) {
  const anchor = sourceAnchorForNode(node, context);
  const sourceParentId = sourceMessageNodeId(anchor?.sourceMessageId, byId);

  if (sourceParentId) {
    return sourceParentId;
  }

  if (anchor?.sourceThreadId) {
    return node.parentId ?? undefined;
  }

  return fallbackMainNodeId ?? node.parentId ?? undefined;
}

function rowIdForNode(
  node: VersionNode,
  context: HumanTimelineContext,
  computed: {
    inactive: boolean;
    memory: boolean;
    hubId?: string;
    logicFocusKey?: string;
  }
): TimelineLaneId {
  const { anchor, thread, branch } = getRelatedObjects(node, context);
  const rowAnchorId =
    computed.hubId ||
    node.relatedAnchorId ||
    thread?.anchorId ||
    branch?.anchorId ||
    anchor?.id;

  if (
    computed.inactive &&
    !rowAnchorId &&
    !node.relatedThreadId &&
    !node.relatedBranchId
  ) {
    return INACTIVE_ROW_ID;
  }

  if (computed.memory) {
    return MEMORY_ROW_ID;
  }

  if (computed.logicFocusKey && node.nodeType !== "anchor_selected") {
    return `row-logic-${rowSafeId(computed.logicFocusKey)}`;
  }

  if (
    node.nodeType === "document_created" ||
    node.nodeType === "document_revised" ||
    node.nodeType === "reverted"
  ) {
    return MAIN_ROW_ID;
  }

  if (rowAnchorId) {
    return `row-anchor-${rowAnchorId}`;
  }

  if (node.relatedThreadId) {
    return `row-thread-${node.relatedThreadId}`;
  }

  if (node.relatedBranchId) {
    return `row-branch-${node.relatedBranchId}`;
  }

  return MAIN_ROW_ID;
}

function legacyLaneForNode(
  node: VersionNode,
  inactive: boolean,
  memory: boolean
): "main" | "selection" | "question" | "suggestion" | "draft" | "merge" | "memory" | "inactive" {
  if (inactive) {
    return "inactive";
  }

  if (memory) {
    return "memory";
  }

  if (
    node.nodeType === "document_created" ||
    node.nodeType === "document_revised" ||
    node.nodeType === "reverted"
  ) {
    return "main";
  }

  if (node.nodeType === "anchor_selected") {
    return "selection";
  }

  if (node.nodeType === "local_question_asked") {
    return "question";
  }

  if (node.nodeType === "local_answer_generated") {
    return "suggestion";
  }

  if (node.nodeType === "branch_created" || node.nodeType === "revision_generated") {
    return "draft";
  }

  if (node.nodeType === "merged") {
    return "merge";
  }

  return "suggestion";
}

function statusForNode(node: VersionNode): HumanTimelineNode["statusLabel"] {
  if (node.nodeType === "deleted") {
    return "deleted";
  }

  if (node.nodeType === "discarded") {
    return "discarded";
  }

  if (node.nodeType === "merged") {
    return "merged back";
  }

  if (node.nodeType === "branch_created") {
    return "draft";
  }

  if (!node.isActivePath) {
    return "inactive";
  }

  return "active";
}

function toneForNode(
  node: VersionNode,
  laneId: TimelineLaneId
): HumanTimelineNode["statusTone"] {
  if (node.nodeType === "deleted") {
    return "red";
  }

  if (node.nodeType === "discarded") {
    return "amber";
  }

  if (!node.isActivePath && node.nodeType !== "branch_created") {
    return "slate";
  }

  if (laneId === MEMORY_ROW_ID) {
    return "amber";
  }

  if (laneId === INACTIVE_ROW_ID) {
    return "slate";
  }

  if (
    node.nodeType === "anchor_selected" ||
    node.nodeType === "local_question_asked" ||
    node.nodeType === "local_answer_generated"
  ) {
    return "green";
  }

  if (
    node.nodeType === "branch_created" ||
    node.nodeType === "revision_generated"
  ) {
    return "purple";
  }

  return "blue";
}

function titleForNode(node: VersionNode, context: HumanTimelineContext) {
  const selectedText = selectedTextForNode(node, context);
  const mainPrompt = getMainPromptForNode(node, context);
  const localQuestion = getLocalQuestionForNode(node, context);
  const localAnswer = getLocalAnswerForNode(node, context);
  const documentTitle = context.documents?.[node.documentId]?.title;
  const topic = localQuestion || selectedText || mainPrompt || documentTitle;

  if (node.nodeType === "document_created") {
    return actionTitle("Question", mainPrompt || documentTitle, "Question");
  }

  if (node.nodeType === "document_revised") {
    if (isMainAnswerUpdateNode(node)) {
      return actionTitle(
        "Follow-up question",
        mainPrompt || documentTitle,
        "Follow-up question"
      );
    }

    if (/^(Manual document edit|Edited document)/i.test(node.label)) {
      return actionTitle("Edited", documentTitle || mainPrompt, "Edited document");
    }

    if (/^Merged into main document$/i.test(node.label)) {
      return actionTitle("Merged", selectedText || documentTitle, "Merged local change");
    }

    return actionTitle("Updated", documentTitle || mainPrompt, "Updated document");
  }

  if (node.nodeType === "anchor_selected") {
    return actionTitle("Selected source", selectedText, "Selected source");
  }

  if (node.nodeType === "local_question_asked") {
    const followUp = isLocalFollowUpNode(node, context);
    return actionTitle(
      followUp ? "Follow-up" : "Check",
      followUp ? localQuestion || selectedText : selectedText || localQuestion,
      followUp ? "Follow-up question" : "Check"
    );
  }

  if (node.nodeType === "local_answer_generated") {
    const followUp = isLocalFollowUpNode(node, context);
    return actionTitle(
      followUp ? "Follow-up" : "Check",
      followUp
        ? localQuestion || selectedText || localAnswer
        : selectedText || localQuestion || localAnswer,
      followUp ? "Follow-up" : "Check"
    );
  }

  if (node.nodeType === "annotation_added") {
    return actionTitle("Note", selectedText || localAnswer, "Saved note");
  }

  if (node.nodeType === "annotation_deleted") {
    return actionTitle("Delete note", selectedText || localAnswer, "Deleted note");
  }

  if (node.nodeType === "branch_created") {
    return actionTitle("Draft", selectedText || localQuestion, "Drafted alternative");
  }

  if (node.nodeType === "revision_generated") {
    return actionTitle("Revise", selectedText || localQuestion, "Generated draft revision");
  }

  if (node.nodeType === "merged") {
    return actionTitle("Merge", selectedText || localAnswer, "Merged back");
  }

  if (node.nodeType === "discarded") {
    return actionTitle("Discard", topic, "Discarded local path");
  }

  if (node.nodeType === "deleted") {
    return actionTitle("Delete", topic, "Deleted local path");
  }

  if (node.nodeType === "reverted") {
    return actionTitle("Return", mainPrompt || documentTitle, "Returned to earlier point");
  }

  return readableLabel(node.label);
}

function shortTitleForNode(node: VersionNode, context: HumanTimelineContext) {
  const selectedText = selectedTextForNode(node, context);
  const mainPrompt = getMainPromptForNode(node, context);
  const localQuestion = getLocalQuestionForNode(node, context);
  const localAnswer = getLocalAnswerForNode(node, context);
  const documentTitle = context.documents?.[node.documentId]?.title;
  const topic = localQuestion || selectedText || mainPrompt || documentTitle;

  if (node.nodeType === "document_created") {
    return actionShortTitle("Q", mainPrompt || documentTitle, "Main question");
  }

  if (node.nodeType === "document_revised") {
    if (isMainAnswerUpdateNode(node)) {
      return actionShortTitle("Follow-up", mainPrompt || documentTitle, "Follow-up");
    }

    if (/^(Manual document edit|Edited document)/i.test(node.label)) {
      return actionShortTitle("Edit", documentTitle || mainPrompt, "Edited document");
    }

    if (/^Merged into main document$/i.test(node.label)) {
      return actionShortTitle("Merge", selectedText || documentTitle, "Merged change");
    }

    return actionShortTitle("Update", documentTitle || mainPrompt, "Updated document");
  }

  if (node.nodeType === "anchor_selected") {
    return actionShortTitle("Selected", selectedText, "Selected source");
  }

  if (node.nodeType === "local_question_asked") {
    const followUp = isLocalFollowUpNode(node, context);
    return actionShortTitle(
      followUp ? "Follow-up" : "Check",
      followUp ? localQuestion || selectedText : selectedText || localQuestion,
      followUp ? "Follow-up" : "Check"
    );
  }

  if (node.nodeType === "local_answer_generated") {
    const followUp = isLocalFollowUpNode(node, context);
    return actionShortTitle(
      followUp ? "Follow-up" : "Check",
      followUp
        ? localQuestion || selectedText || localAnswer
        : selectedText || localQuestion || localAnswer,
      followUp ? "Follow-up" : "Check"
    );
  }

  if (node.nodeType === "annotation_added") {
    return actionShortTitle("Note", selectedText || localAnswer, "Note");
  }

  if (node.nodeType === "annotation_deleted") {
    return actionShortTitle("Delete note", selectedText || localAnswer, "Delete note");
  }

  if (node.nodeType === "branch_created") {
    return actionShortTitle("Draft", selectedText || localQuestion, "Draft");
  }

  if (node.nodeType === "revision_generated") {
    return actionShortTitle("Revise", selectedText || localQuestion, "Revise");
  }

  if (node.nodeType === "merged") {
    return actionShortTitle("Merge", selectedText || localAnswer, "Merge");
  }

  if (node.nodeType === "discarded") {
    return actionShortTitle("Discard", topic, "Discard");
  }

  if (node.nodeType === "deleted") {
    return actionShortTitle("Delete", topic, "Delete");
  }

  if (node.nodeType === "reverted") {
    return actionShortTitle("Return", mainPrompt || documentTitle, "Return");
  }

  return excerpt(readableLabel(node.label), 28);
}

function relationForNode(
  node: VersionNode,
  laneId: TimelineLaneId,
  context: HumanTimelineContext
) {
  if (node.nodeType === "merged") {
    return "merge back";
  }

  if (node.nodeType === "branch_created") {
    return "draft branch";
  }

  if (laneId === MEMORY_ROW_ID) {
    return "save memory";
  }

  if (laneId === INACTIVE_ROW_ID) {
    return "kept history";
  }

  if (node.nodeType === "anchor_selected") {
    return "source anchor";
  }

  if (node.nodeType === "local_question_asked") {
    return "check";
  }

  if (node.nodeType === "local_answer_generated") {
    return isLocalFollowUpNode(node, context) ? "follow-up" : "check";
  }

  if (node.nodeType === "revision_generated") {
    return "draft";
  }

  return "continue";
}

function subtitleForNode(node: VersionNode, context: HumanTimelineContext) {
  const selectedText = selectedTextForNode(node, context);
  const mainPrompt = getMainPromptForNode(node, context);
  const localQuestion = getLocalQuestionForNode(node, context);
  const localAnswer = getLocalAnswerForNode(node, context);

  if (node.nodeType === "document_created") {
    return mainPrompt
      ? `User asked: ${excerpt(mainPrompt)}`
      : "Main conversation started";
  }

  if (node.nodeType === "document_revised") {
    if (isMainAnswerUpdateNode(node)) {
      return mainPrompt
        ? `User followed up: ${excerpt(mainPrompt)}`
        : "Main answer continued";
    }

    return selectedText
      ? `Document changed around: ${excerpt(selectedText)}`
      : "Main document memory updated";
  }

  if (node.nodeType === "anchor_selected") {
    return selectedText
      ? `Selected text: ${excerpt(selectedText)}`
      : "User selected text to inspect";
  }

  if (node.nodeType === "local_answer_generated") {
    if (localQuestion) {
      const parts = [`Question: ${excerpt(localQuestion)}`];

      if (selectedText) {
        parts.push(`Source: ${excerpt(selectedText)}`);
      }

      if (localAnswer) {
        parts.push(`Reply: ${excerpt(localAnswer)}`);
      }

      return parts.join(" | ");
    }

    if (localAnswer) {
      return `Local answer: ${excerpt(localAnswer)}`;
    }
  }

  if (node.nodeType === "merged") {
    return selectedText
      ? `Merged selected local wording: ${excerpt(selectedText)}`
      : "A local idea was adopted into the document";
  }

  if (isObjectStateNode(node)) {
    return selectedText
      ? `Affected branch: ${excerpt(selectedText)}`
      : readableLabel(node.label);
  }

  return excerpt(selectedText || localQuestion || localAnswer) || readableLabel(node.label);
}

function parentDepth(
  node: VersionNode,
  byId: Record<string, VersionNode>,
  depthById: Map<string, number>
) {
  if (!node.parentId) {
    return 0;
  }

  const cached = depthById.get(node.parentId);

  if (typeof cached === "number") {
    return cached;
  }

  return byId[node.parentId] ? 0 : 0;
}

function depthForNode(
  node: VersionNode,
  byId: Record<string, VersionNode>,
  depthById: Map<string, number>
) {
  if (isMemoryNode(node)) {
    return parentDepth(node, byId, depthById);
  }

  const baseDepth = parentDepth(node, byId, depthById);

  if (startsBranch(node)) {
    return baseDepth + 1;
  }

  if (mergesBack(node)) {
    return Math.max(0, baseDepth - 1);
  }

  return baseDepth;
}

function branchGroupForNode(
  node: VersionNode,
  depth: number,
  byId: Record<string, VersionNode>,
  groupById: Map<string, string>
) {
  if (depth === 0) {
    return "main";
  }

  if (startsBranch(node)) {
    return node.id;
  }

  if (node.parentId && groupById.has(node.parentId)) {
    return groupById.get(node.parentId) ?? node.id;
  }

  const parent = node.parentId ? byId[node.parentId] : undefined;

  return parent?.id ?? node.id;
}

export function humanizeTimelineNode(
  node: VersionNode,
  context: HumanTimelineContext,
  computed?: {
    laneId: TimelineLaneId;
    logicalDepth: number;
    branchGroupId: string;
    logicFocusKey?: string;
    logicFocusLabel?: string;
    isLogicStart?: boolean;
    resumedFromId?: string;
    visualParentId?: string | null;
    hubKey?: string;
    isAnchorHub?: boolean;
    actionCount?: number;
    folded?: boolean;
    foldReason?: string;
    titleOverride?: string;
    shortTitleOverride?: string;
    logicAssignmentSource?: "auto" | "user";
    logicRelationType?: HumanTimelineNode["logicRelationType"];
    logicRouterConfidence?: number;
    logicRouterReason?: string;
  }
): HumanTimelineNode {
  const laneId =
    computed?.laneId ??
    (isInactiveNode(node)
      ? INACTIVE_ROW_ID
      : isMemoryNode(node)
        ? MEMORY_ROW_ID
      : MAIN_ROW_ID);
  const subtitle = subtitleForNode(node, context);
  const mainPrompt = getMainPromptForNode(node, context);
  const documentTitle = context.documents?.[node.documentId]?.title;
  const inferredTitleOverride =
    computed?.logicRelationType === "new_root" &&
    node.nodeType === "document_revised" &&
    isMainAnswerUpdateNode(node)
      ? actionTitle("Question", mainPrompt || documentTitle, "Question")
      : computed?.titleOverride;
  const inferredShortTitleOverride =
    computed?.logicRelationType === "new_root" &&
    node.nodeType === "document_revised" &&
    isMainAnswerUpdateNode(node)
      ? actionShortTitle("Q", mainPrompt || documentTitle, "Main question")
      : computed?.shortTitleOverride;

  return {
    id: node.id,
    laneId,
    logicalDepth: computed?.logicalDepth ?? 0,
    logicColumn: 0,
    stackIndex: 0,
    branchGroupId: computed?.branchGroupId ?? "main",
    logicFocusKey: computed?.logicFocusKey,
    logicFocusLabel: computed?.logicFocusLabel,
    isLogicStart: computed?.isLogicStart,
    resumedFromId: computed?.resumedFromId,
    visualParentId: computed?.visualParentId,
    hubKey: computed?.hubKey,
    isAnchorHub: computed?.isAnchorHub,
    actionCount: computed?.actionCount,
    folded: Boolean(computed?.folded),
    foldReason: computed?.foldReason,
    title: inferredTitleOverride ?? titleForNode(node, context),
    shortTitle: inferredShortTitleOverride ?? shortTitleForNode(node, context),
    subtitle,
    statusLabel: statusForNode(node),
    statusTone: toneForNode(node, laneId),
    relationLabel:
      computed?.logicRelationType === "new_root"
        ? "new root"
        : computed?.logicRelationType === "return_to"
          ? "return to"
          : computed?.isAnchorHub
            ? "anchor hub"
            : relationForNode(node, laneId, context),
    logicAssignmentSource: computed?.logicAssignmentSource,
    logicRelationType: computed?.logicRelationType,
    logicRouterConfidence: computed?.logicRouterConfidence,
    logicRouterReason: computed?.logicRouterReason,
    node
  };
}

function columnStepForNode(node: VersionNode) {
  if (node.nodeType === "anchor_selected") {
    return 0;
  }

  if (node.nodeType === "local_question_asked") {
    return 0.62;
  }

  if (node.nodeType === "local_answer_generated") {
    return 0.72;
  }

  if (node.nodeType === "branch_created" || node.nodeType === "revision_generated") {
    return 0.82;
  }

  if (node.nodeType === "merged") {
    return 1;
  }

  if (isMemoryNode(node)) {
    return 0.42;
  }

  if (isObjectStateNode(node)) {
    return 0.72;
  }

  return 1;
}

function resolvedVisualParentId(view: HumanTimelineNode) {
  return view.visualParentId !== undefined
    ? view.visualParentId
    : view.node.parentId;
}

function assignLogicLayout(nodes: HumanTimelineNode[]) {
  const columnById = new Map<string, number>();
  const mainRootById = new Map<string, string>();
  const mainRootTrackByKey = new Map<string, number>();
  const MAIN_ROOT_TRACK_GAP = 3;

  const withColumns = nodes.map((view) => {
    const parentId = resolvedVisualParentId(view);
    const parentColumn =
      parentId && columnById.has(parentId)
        ? columnById.get(parentId) ?? 0
        : 0;
    let logicColumn = parentColumn + columnStepForNode(view.node);
    let mainRootKey: string | undefined;

    if (isMainProgressNode(view.node)) {
      const hasResolvedParent = Boolean(parentId && columnById.has(parentId));

      if (view.logicRelationType === "new_root" || !hasResolvedParent) {
        mainRootKey = view.id;
        logicColumn = 0;
      } else {
        mainRootKey = parentId
          ? mainRootById.get(parentId) ?? parentId
          : view.id;
        logicColumn = parentColumn + 1;
      }

      mainRootById.set(view.id, mainRootKey);

      if (!mainRootTrackByKey.has(mainRootKey)) {
        mainRootTrackByKey.set(mainRootKey, mainRootTrackByKey.size);
      }
    }

    columnById.set(view.id, logicColumn);

    return {
      ...view,
      branchGroupId: isMainProgressNode(view.node)
        ? mainRootKey ?? view.branchGroupId
        : view.branchGroupId,
      logicColumn
    };
  });
  const siblingGroups = new Map<string, HumanTimelineNode[]>();

  withColumns.forEach((view) => {
    const parentId = resolvedVisualParentId(view);

    if (!parentId || isMainProgressNode(view.node)) {
      return;
    }

    const key = `${parentId}:${view.laneId}:${Math.round(view.logicColumn * 10)}`;
    const group = siblingGroups.get(key) ?? [];

    group.push(view);
    siblingGroups.set(key, group);
  });

  const siblingOffsetById = new Map<string, number>();

  siblingGroups.forEach((group) => {
    if (group.length <= 1) {
      return;
    }

    group
      .sort(
        (a, b) =>
          new Date(a.node.createdAt).getTime() -
          new Date(b.node.createdAt).getTime()
      )
      .forEach((view, index) => {
        siblingOffsetById.set(view.id, (index - (group.length - 1) / 2) * 0.2);
      });
  });
  const spreadColumns = withColumns.map((view) => ({
    ...view,
    logicColumn: view.logicColumn + (siblingOffsetById.get(view.id) ?? 0)
  }));

  const stackBySlot = new Map<string, number>();
  const mainStackBySlot = new Map<string, number>();

  return spreadColumns.map((view) => {
    if (isMainProgressNode(view.node)) {
      const rootKey = mainRootById.get(view.id) ?? view.id;
      const rootTrack = mainRootTrackByKey.get(rootKey) ?? 0;
      const key = `${view.laneId}:${rootKey}:${view.logicColumn.toFixed(2)}`;
      const slotStack = mainStackBySlot.get(key) ?? 0;

      mainStackBySlot.set(key, slotStack + 1);

      return {
        ...view,
        stackIndex: rootTrack * MAIN_ROOT_TRACK_GAP + slotStack
      };
    }

    const key = `${view.laneId}:${view.logicColumn.toFixed(2)}`;
    const stackIndex = stackBySlot.get(key) ?? 0;

    stackBySlot.set(key, stackIndex + 1);

    return {
      ...view,
      stackIndex
    };
  });
}

function scopeRowsToMainReasoningUnits(nodes: HumanTimelineNode[]) {
  const nodeById = new Map(nodes.map((view) => [view.id, view]));
  const mainRootByNodeId = new Map<string, string | undefined>();

  const resolveMainRoot = (nodeId?: string | null): string | undefined => {
    if (!nodeId) {
      return undefined;
    }

    if (mainRootByNodeId.has(nodeId)) {
      return mainRootByNodeId.get(nodeId);
    }

    const view = nodeById.get(nodeId);

    if (!view) {
      mainRootByNodeId.set(nodeId, undefined);
      return undefined;
    }

    if (isMainProgressNode(view.node)) {
      const mainRoot = view.branchGroupId || view.id;

      mainRootByNodeId.set(nodeId, mainRoot);
      return mainRoot;
    }

    const mainRoot = resolveMainRoot(resolvedVisualParentId(view));

    mainRootByNodeId.set(nodeId, mainRoot);
    return mainRoot;
  };

  const scopedNodes = nodes.map((view) => {
    const mainRootId = isMainProgressNode(view.node)
      ? view.branchGroupId || view.id
      : resolveMainRoot(resolvedVisualParentId(view));
    const laneId = isMainProgressNode(view.node)
      ? mainRowIdForRoot(mainRootId || view.id)
      : scopedRowIdForMain(view.laneId, mainRootId);

    return {
      ...view,
      laneId
    };
  });
  const stackBySlot = new Map<string, number>();

  return scopedNodes.map((view) => {
    const key = `${view.laneId}:${view.logicColumn.toFixed(2)}`;
    const stackIndex = stackBySlot.get(key) ?? 0;

    stackBySlot.set(key, stackIndex + 1);

    return {
      ...view,
      stackIndex
    };
  });
}

export function buildHumanTimeline(
  nodes: VersionNode[],
  context: HumanTimelineContext,
  options: HumanTimelineBuildOptions
): HumanTimelineBuildResult {
  const sortedNodes = [...nodes].sort(compareVersionNodes);
  const byId = Object.fromEntries(sortedNodes.map((node) => [node.id, node]));
  const depthById = new Map<string, number>();
  const groupById = new Map<string, string>();

  sortedNodes.forEach((node) => {
    const depth = depthForNode(node, byId, depthById);
    const group = branchGroupForNode(node, depth, byId, groupById);

    depthById.set(node.id, depth);
    groupById.set(node.id, group);
  });

  const anchorHubByKey = new Map<string, string>();
  const hiddenDuplicateAnchors = new Set<string>();

  sortedNodes.forEach((node) => {
    if (node.nodeType !== "anchor_selected") {
      return;
    }

    const hubKey = hubKeyForNode(node, context);

    if (!hubKey) {
      return;
    }

    if (anchorHubByKey.has(hubKey)) {
      hiddenDuplicateAnchors.add(node.id);
      return;
    }

    anchorHubByKey.set(hubKey, node.id);
  });

  const actionCountByHubId = new Map<string, number>();

  sortedNodes.forEach((node) => {
    const hubKey = hubKeyForNode(node, context);
    const hubId = hubKey ? anchorHubByKey.get(hubKey) : undefined;

    if (!hubId || hubId === node.id || hiddenDuplicateAnchors.has(node.id)) {
      return;
    }

    actionCountByHubId.set(hubId, (actionCountByHubId.get(hubId) ?? 0) + 1);
  });

  const branchCounts = new Map<string, number>();
  const latestMainBeforeById = new Map<string, string | undefined>();
  let latestMainNodeId: string | undefined;

  sortedNodes.forEach((node) => {
    latestMainBeforeById.set(node.id, latestMainNodeId);

    if (isMainProgressNode(node)) {
      latestMainNodeId = node.id;
    }

    const depth = depthById.get(node.id) ?? 0;
    const group = groupById.get(node.id) ?? "main";

    if (depth > 0) {
      branchCounts.set(group, (branchCounts.get(group) ?? 0) + 1);
    }
  });

  const maxDepth =
    options.maxVisibleDepth === "all" ? Infinity : options.maxVisibleDepth;
  const inactiveCount = sortedNodes.filter(isInactiveNode).length;
  let foldedBranchCount = 0;
  const emittedFoldedGroups = new Set<string>();
  const displayDepthById = new Map<string, number>();
  const displayGroupById = new Map<string, string>();
  const latestNodeByThreadId = new Map<string, string>();
  const latestNodeByBranchId = new Map<string, string>();
  const latestNodeByHubKey = new Map<string, string>();
  const latestFocusByThreadId = new Map<string, { key: string; label: string }>();
  const latestNodeByLogicFocusKey = new Map<string, string>();
  const previousMainLogicNodes: VersionNode[] = [];
  const humanNodes = sortedNodes.flatMap((node) => {
    if (hiddenDuplicateAnchors.has(node.id)) {
      return [];
    }

    if (node.nodeType === "anchor_selected") {
      return [];
    }

    // A local user message and its assistant reply form one visible reasoning
    // turn. The reply node is the durable representative because it can open
    // the complete persisted local conversation and comparison context.
    if (node.nodeType === "local_question_asked") {
      return [];
    }

    const inactive = isInactiveNode(node);

    if (inactive && !options.showInactive) {
      return [];
    }

    const memory = isMemoryNode(node);

    if (memory && !options.showMemory) {
      return [];
    }

    if (isMainProgressNode(node) && options.showMain === false) {
      return [];
    }

    if (node.nodeType === "local_answer_generated" && options.showLocal === false) {
      return [];
    }

    if (
      options.showDrafts === false &&
      (node.nodeType === "branch_created" ||
        node.nodeType === "revision_generated" ||
        node.nodeType === "merged")
    ) {
      return [];
    }

    const hubKey = hubKeyForNode(node, context);
    const hubId = hubKey ? anchorHubByKey.get(hubKey) : undefined;
    const isAnchorHub = Boolean(hubId && hubId === node.id);
    const inheritedFocus = node.relatedThreadId
      ? latestFocusByThreadId.get(node.relatedThreadId)
      : undefined;
    const logicFocus = logicFocusForNode(node, context, hubKey, inheritedFocus);
    const logicAssignment = context.logicAssignments?.[node.id];
    const latestFocusNodeId = logicFocus
      ? logicAssignment?.targetNodeId ??
        latestNodeByLogicFocusKey.get(logicFocus.key)
      : undefined;
    const latestThreadNodeId = node.relatedThreadId
      ? latestNodeByThreadId.get(node.relatedThreadId)
      : undefined;
    const latestBranchNodeId = node.relatedBranchId
      ? latestNodeByBranchId.get(node.relatedBranchId)
      : undefined;
    const latestHubNodeId = hubKey ? latestNodeByHubKey.get(hubKey) : undefined;
    const anchor = node.relatedAnchorId
      ? context.anchors[node.relatedAnchorId]
      : undefined;
    const sourceParentId = sourceParentNodeIdForNode(
      node,
      context,
      byId,
      latestMainBeforeById.get(node.id)
    );
    const directParentNode = node.parentId ? byId[node.parentId] : undefined;
    const latestMainParentId = latestMainBeforeById.get(node.id);
    const mainLogicRoute =
      node.nodeType === "document_created" ||
      (node.nodeType === "document_revised" &&
        isMainAnswerUpdateNode(node) &&
        directParentNode?.nodeType !== "merged")
      ? routeMainLogicNode(node, context, previousMainLogicNodes)
      : undefined;
    const mainLogicRelationType =
      node.nodeType === "document_revised" && directParentNode?.nodeType === "merged"
        ? "merge_back"
        : mainLogicRoute?.relationType;
    const mainProgressVisualParentId =
      node.nodeType === "document_revised"
        ? directParentNode?.nodeType === "merged"
          ? node.parentId
          : isMainAnswerUpdateNode(node)
            ? mainLogicRoute?.parentId ?? null
          : latestMainParentId ?? node.parentId
        : node.nodeType === "reverted"
          ? node.parentId ?? latestMainParentId
          : undefined;
    const visualParentId =
      node.nodeType === "document_revised" || node.nodeType === "reverted"
        ? mainProgressVisualParentId
        : node.nodeType === "merged"
            ? latestBranchNodeId ??
              latestFocusNodeId ??
              latestThreadNodeId ??
              latestHubNodeId ??
              (hubId && hubId !== node.id ? hubId : node.parentId)
            : isMemoryNode(node) || isObjectStateNode(node)
              ? latestFocusNodeId ??
                latestThreadNodeId ??
                latestBranchNodeId ??
                latestHubNodeId ??
                (hubId && hubId !== node.id ? hubId : sourceParentId ?? node.parentId)
              : node.relatedThreadId
                ? latestFocusNodeId ??
                  latestThreadNodeId ??
                  sourceParentId ??
                  (hubId && hubId !== node.id ? hubId : node.parentId)
                : node.relatedBranchId
                  ? latestBranchNodeId ??
                    latestFocusNodeId ??
                    sourceParentId ??
                    (hubId && hubId !== node.id ? hubId : node.parentId)
                  : hubId && hubId !== node.id
                    ? hubId
        : node.parentId;
    const rawDepth = depthById.get(node.id) ?? 0;
    const visualParentDepth =
      visualParentId && displayDepthById.has(visualParentId)
        ? displayDepthById.get(visualParentId) ?? 0
        : undefined;
    const hubDepth = hubId ? displayDepthById.get(hubId) : undefined;
    let depth = rawDepth;

    const isFirstThreadProgressNode = Boolean(
      node.relatedThreadId &&
        isThreadProgressNode(node) &&
        !latestThreadNodeId &&
        sourceParentId
    );

    if (isMainProgressNode(node)) {
      depth = 0;
    } else if (isSelectionNode(node)) {
      depth = (visualParentDepth ?? parentDepth(node, byId, depthById)) + 1;
    } else if (isFirstThreadProgressNode) {
      depth = (visualParentDepth ?? parentDepth(node, byId, depthById)) + 1;
    } else if (node.nodeType === "branch_created" || node.nodeType === "revision_generated") {
      depth = hubDepth ?? visualParentDepth ?? rawDepth;
    } else if (logicFocus && hubId && hubId !== node.id) {
      depth = hubDepth ?? visualParentDepth ?? rawDepth;
    } else if (hubId && hubId !== node.id && !mergesBack(node)) {
      depth = hubDepth ?? visualParentDepth ?? rawDepth;
    } else if (typeof visualParentDepth === "number") {
      depth = visualParentDepth;
    }

    if (depth > maxDepth) {
      foldedBranchCount += 1;
      return [];
    }

    const group =
      logicFocus
        ? logicFocus.key
        : hubId && hubId !== node.id
        ? groupById.get(hubId) ?? hubId
        : visualParentId && displayGroupById.has(visualParentId)
          ? displayGroupById.get(visualParentId) ?? node.id
          : groupById.get(node.id) ?? "main";
    const branchSize = branchCounts.get(group) ?? 0;
    const folded =
      options.collapseLargeBranches &&
      depth > 0 &&
      branchSize > 4 &&
      !node.isActivePath &&
      node.nodeType !== "merged";
    const foldReason = folded ? `large branch (${branchSize} steps)` : undefined;
    const laneId = rowIdForNode(node, context, {
      inactive,
      memory,
      hubId,
      logicFocusKey: logicFocus?.key
    });
    if (folded) {
      if (emittedFoldedGroups.has(group)) {
        return [];
      }

      emittedFoldedGroups.add(group);
      foldedBranchCount += branchSize;
    }

    const humanNode = humanizeTimelineNode(node, context, {
      laneId,
      logicalDepth: depth,
      branchGroupId: group,
      logicFocusKey: logicFocus?.key,
      logicFocusLabel: logicFocus?.label,
      isLogicStart: Boolean(logicFocus && !latestFocusNodeId),
      resumedFromId:
        logicFocus && latestFocusNodeId && latestFocusNodeId !== latestThreadNodeId
          ? latestFocusNodeId
          : undefined,
      visualParentId,
      hubKey,
      isAnchorHub,
      actionCount: isAnchorHub ? actionCountByHubId.get(node.id) ?? 0 : undefined,
      folded,
      foldReason,
      logicAssignmentSource: logicAssignment?.source,
      logicRelationType: mainLogicRelationType,
      logicRouterConfidence: mainLogicRoute?.confidence,
      logicRouterReason: mainLogicRoute?.reason
    });

    displayDepthById.set(node.id, depth);
    displayGroupById.set(node.id, group);

    if (hubKey) {
      latestNodeByHubKey.set(hubKey, node.id);
    }

    if (logicFocus && isThreadProgressNode(node)) {
      latestNodeByLogicFocusKey.set(logicFocus.key, node.id);

      if (node.relatedThreadId) {
        latestFocusByThreadId.set(node.relatedThreadId, logicFocus);
      }
    }

    if (node.relatedThreadId && isThreadProgressNode(node)) {
      latestNodeByThreadId.set(node.relatedThreadId, node.id);
    }

    if (node.relatedBranchId && isThreadProgressNode(node)) {
      latestNodeByBranchId.set(node.relatedBranchId, node.id);
    }

    if (node.nodeType === "document_created" || isMainAnswerUpdateNode(node)) {
      previousMainLogicNodes.push(node);
    }

    return [humanNode];
  });
  let laidOutNodes = scopeRowsToMainReasoningUnits(assignLogicLayout(humanNodes));
  const initialNodesByRow = new Map<TimelineLaneId, HumanTimelineNode[]>();

  laidOutNodes.forEach((node) => {
    const rowNodes = initialNodesByRow.get(node.laneId) ?? [];

    rowNodes.push(node);
    initialNodesByRow.set(node.laneId, rowNodes);
  });

  const initialNodeRowById = new Map(
    laidOutNodes.map((node) => [node.id, node.laneId])
  );
  const initialRowMeta = Array.from(initialNodesByRow.entries()).map(
    ([rowId, rowNodes]) => {
      const sortedRowNodes = [...rowNodes].sort(
        (a, b) =>
          new Date(a.node.createdAt).getTime() -
          new Date(b.node.createdAt).getTime()
      );
      const firstNode = sortedRowNodes[0];
      const parentNodeId = firstNode ? resolvedVisualParentId(firstNode) : undefined;
      const parentRowId = parentNodeId
        ? initialNodeRowById.get(parentNodeId) ?? MAIN_ROW_ID
        : undefined;

      return {
        rowId,
        nodes: sortedRowNodes,
        parentRowId
      };
    }
  );
  const initialRowChildren = new Map<TimelineLaneId, TimelineLaneId[]>();

  initialRowMeta.forEach((meta) => {
    if (
      isMainReasoningRow(meta.rowId) ||
      meta.rowId === MEMORY_ROW_ID ||
      meta.rowId === INACTIVE_ROW_ID
    ) {
      return;
    }

    const parentRowId =
      meta.parentRowId && meta.parentRowId !== meta.rowId
        ? meta.parentRowId
        : MAIN_ROW_ID;
    const children = initialRowChildren.get(parentRowId) ?? [];

    children.push(meta.rowId);
    initialRowChildren.set(parentRowId, children);
  });

  const removedRowIds = new Set<TimelineLaneId>();
  const addRemovedRowWithChildren = (rowId: TimelineLaneId) => {
    if (removedRowIds.has(rowId)) {
      return;
    }

    removedRowIds.add(rowId);
    (initialRowChildren.get(rowId) ?? []).forEach(addRemovedRowWithChildren);
  };

  initialRowMeta
    .filter((meta) =>
      meta.nodes.some((item) => isObjectStateNode(item.node))
    )
    .forEach((meta) => addRemovedRowWithChildren(meta.rowId));

  const removedPathCount = removedRowIds.size;

  if (!options.showRemovedPaths && removedPathCount > 0) {
    laidOutNodes = laidOutNodes.filter((node) => !removedRowIds.has(node.laneId));
  }

  const nodesByRow = new Map<TimelineLaneId, HumanTimelineNode[]>();

  laidOutNodes.forEach((node) => {
    const rowNodes = nodesByRow.get(node.laneId) ?? [];

    rowNodes.push(node);
    nodesByRow.set(node.laneId, rowNodes);
  });

  const nodeRowById = new Map(laidOutNodes.map((node) => [node.id, node.laneId]));
  const laidOutNodeById = new Map(laidOutNodes.map((node) => [node.id, node]));
  const rowMeta = Array.from(nodesByRow.entries()).map(([rowId, rowNodes]) => {
    const sortedRowNodes = [...rowNodes].sort(
      (a, b) =>
        new Date(a.node.createdAt).getTime() -
        new Date(b.node.createdAt).getTime()
    );
    const firstNode = sortedRowNodes[0];
    const parentNodeId = firstNode ? resolvedVisualParentId(firstNode) : undefined;
    const parentRowId = parentNodeId
      ? nodeRowById.get(parentNodeId) ?? MAIN_ROW_ID
      : undefined;
    const parentView = parentNodeId ? laidOutNodeById.get(parentNodeId) : undefined;

    return {
      rowId,
      nodes: sortedRowNodes,
      firstNode,
      parentRowId,
      parentLogicColumn: parentView?.logicColumn ?? 0,
      parentStackIndex: parentView?.stackIndex ?? 0,
      parentCreatedAt: parentView?.node.createdAt ?? "",
      firstCreatedAt: firstNode?.node.createdAt ?? ""
    };
  });
  const rowMetaById = new Map(rowMeta.map((meta) => [meta.rowId, meta]));
  const rowChildren = new Map<TimelineLaneId, TimelineLaneId[]>();

  rowMeta.forEach((meta) => {
    if (
      isMainReasoningRow(meta.rowId) ||
      meta.rowId === MEMORY_ROW_ID ||
      meta.rowId === INACTIVE_ROW_ID
    ) {
      return;
    }

    const parentRowId =
      meta.parentRowId && meta.parentRowId !== meta.rowId
        ? meta.parentRowId
        : MAIN_ROW_ID;
    const children = rowChildren.get(parentRowId) ?? [];

    children.push(meta.rowId);
    rowChildren.set(parentRowId, children);
  });

  rowChildren.forEach((children) => {
    children.sort((a, b) => {
      const aMeta = rowMetaById.get(a);
      const bMeta = rowMetaById.get(b);
      const parentStackDelta =
        (aMeta?.parentStackIndex ?? 0) - (bMeta?.parentStackIndex ?? 0);

      if (parentStackDelta !== 0) {
        return parentStackDelta;
      }

      const parentColumnDelta =
        (aMeta?.parentLogicColumn ?? 0) - (bMeta?.parentLogicColumn ?? 0);

      if (parentColumnDelta !== 0) {
        return parentColumnDelta;
      }

      const parentTimeDelta =
        new Date(aMeta?.parentCreatedAt ?? 0).getTime() -
        new Date(bMeta?.parentCreatedAt ?? 0).getTime();

      if (parentTimeDelta !== 0) {
        return parentTimeDelta;
      }

      return (
        new Date(aMeta?.firstCreatedAt ?? 0).getTime() -
        new Date(bMeta?.firstCreatedAt ?? 0).getTime()
      );
    });
  });

  const orderedRowIds: TimelineLaneId[] = [];
  const visitedRows = new Set<TimelineLaneId>();
  const pushRowWithChildren = (rowId: TimelineLaneId) => {
    if (visitedRows.has(rowId) || !rowMetaById.has(rowId)) {
      return;
    }

    visitedRows.add(rowId);
    orderedRowIds.push(rowId);

    (rowChildren.get(rowId) ?? []).forEach(pushRowWithChildren);
  };

  const mainRowIds = rowMeta
    .filter((meta) => isMainReasoningRow(meta.rowId))
    .sort(
      (a, b) =>
        new Date(a.firstCreatedAt).getTime() -
        new Date(b.firstCreatedAt).getTime()
    )
    .map((meta) => meta.rowId);

  mainRowIds.forEach(pushRowWithChildren);

  rowMeta
    .filter(
      (meta) =>
        !visitedRows.has(meta.rowId) &&
        meta.rowId !== MEMORY_ROW_ID &&
        meta.rowId !== INACTIVE_ROW_ID
    )
    .sort(
      (a, b) =>
        new Date(a.firstCreatedAt).getTime() -
        new Date(b.firstCreatedAt).getTime()
    )
    .forEach((meta) => pushRowWithChildren(meta.rowId));

  if (nodesByRow.has(MEMORY_ROW_ID)) {
    orderedRowIds.push(MEMORY_ROW_ID);
  }

  if (nodesByRow.has(INACTIVE_ROW_ID)) {
    orderedRowIds.push(INACTIVE_ROW_ID);
  }

  const mainNumberByRowId = new Map<TimelineLaneId, number>();
  mainRowIds.forEach((rowId, index) => {
    mainNumberByRowId.set(rowId, index + 1);
  });
  const logicNumberByRowId = new Map<TimelineLaneId, string>();
  const assignLogicNumbers = (rowId: TimelineLaneId, prefix: string) => {
    (rowChildren.get(rowId) ?? []).forEach((childRowId, index) => {
      const childNumber = `${prefix}.${index + 1}`;

      logicNumberByRowId.set(childRowId, childNumber);
      assignLogicNumbers(childRowId, childNumber);
    });
  };

  mainRowIds.forEach((rowId) => {
    const mainNumber = mainNumberByRowId.get(rowId);

    if (mainNumber) {
      assignLogicNumbers(rowId, `Q${mainNumber}`);
    }
  });
  let fallbackBranchRowIndex = 0;
  const lanes: TimelineLane[] = orderedRowIds.map((rowId) => {
    const meta = rowMetaById.get(rowId);
    const firstNode = meta?.firstNode;
    const depth = firstNode?.logicalDepth ?? 0;
    const selectedText = selectedTextForNode(firstNode?.node ?? ({} as VersionNode), context);
    const hasDeleted = meta?.nodes.some((item) => item.node.nodeType === "deleted");
    const hasDiscarded = meta?.nodes.some((item) => item.node.nodeType === "discarded");
    const rowStatusLabel = hasDeleted
      ? "Deleted"
      : hasDiscarded
        ? "Discarded"
        : "";

    if (isMainReasoningRow(rowId)) {
      const mainNumber = mainNumberByRowId.get(rowId);
      const mainTopic =
        firstNode?.shortTitle ||
        (firstNode ? actionShortTitle("Q", firstNode.node.label) : "");

      return {
        id: rowId,
        title: mainNumber ? `Main Q${mainNumber}` : "Main Reasoning",
        logicalDepth: 0,
        description:
          mainTopic || "Accepted answer, document version, and adopted changes."
      };
    }

    if (rowId === MEMORY_ROW_ID) {
      return {
        id: rowId,
        title: "Memory Notes",
        logicalDepth: 999,
        description: "Explicit notes saved from user action."
      };
    }

    if (rowId === INACTIVE_ROW_ID) {
      return {
        id: rowId,
        title: "Inactive Logic",
        logicalDepth: 1000,
        description: "Returned-from, discarded, or deleted reasoning."
      };
    }

    fallbackBranchRowIndex += 1;
    const focusLabel = firstNode?.logicFocusLabel;
    const logicNumber =
      logicNumberByRowId.get(rowId) ?? `L${fallbackBranchRowIndex}`;
    const baseTitle =
      focusLabel
        ? `${logicNumber}: ${focusLabel}`
        : depth > 1
          ? `${logicNumber}: nested follow-up`
          : `${logicNumber}: local logic`;

    return {
      id: rowId,
      title: rowStatusLabel ? `${rowStatusLabel} - ${baseTitle}` : baseTitle,
      logicalDepth: depth,
      description: selectedText
        ? excerpt(selectedText, 72)
        : "A local revision path created from selected text."
    };
  });

  return {
    nodes: laidOutNodes,
    lanes,
    inactiveCount,
    removedPathCount,
    foldedBranchCount
  };
}
