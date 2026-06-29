import type { ArgumentComparison } from "@/types/comparison";
import type { Anchor, AnswerBlock, Document, VersionSnapshot } from "@/types/document";
import type { LocalThread, ThreadMessage } from "@/types/thread";
import type { Branch, VersionNode } from "@/types/version";

const documentId = "doc-ai-education";
const rootVersionNodeId = "v-created";
const activeVersionNodeId = "v-local-answer";

const createdAt = "2026-05-10T09:30:00.000Z";

export const mockDocument: Document = {
  id: documentId,
  title: "How Will AI Change Higher Education?",
  rawText:
    "Artificial intelligence is rapidly reshaping higher education.\n\nFrom personalized learning to administrative automation, its impact is already visible across campuses.",
  rootVersionNodeId,
  activeVersionNodeId,
  createdAt,
  updatedAt: "2026-05-10T10:05:00.000Z"
};

const blockBase = {
  documentId,
  anchorable: false,
  createdInVersionNodeId: rootVersionNodeId,
  deletedInVersionNodeId: null,
  createdAt,
  updatedAt: createdAt
};

export const mockBlocks: AnswerBlock[] = [
  {
    ...blockBase,
    id: "p1-heading",
    blockType: "heading",
    text: "Introduction",
    order: 1
  },
  {
    ...blockBase,
    id: "s1",
    blockType: "sentence",
    text: "Artificial intelligence is rapidly reshaping higher education.",
    order: 2,
    anchorable: true
  },
  {
    ...blockBase,
    id: "s1b",
    blockType: "sentence",
    text: "From personalized learning to administrative automation, its impact is already visible across campuses.",
    order: 3,
    anchorable: true
  },
  {
    ...blockBase,
    id: "p2-heading",
    blockType: "heading",
    text: "Four Ways AI Is Transforming Higher Ed",
    order: 4
  },
  {
    ...blockBase,
    id: "s2a",
    blockType: "sentence",
    text: "Many universities are adopting AI tools to improve efficiency, support student success, and enhance research.",
    order: 5,
    anchorable: true
  },
  {
    ...blockBase,
    id: "s2b",
    blockType: "sentence",
    text: "At the same time, educators are rethinking teaching practices and preparing students for an AI-augmented world.",
    order: 6,
    anchorable: true
  },
  {
    ...blockBase,
    id: "p3-heading",
    blockType: "heading",
    text: "Impact on Teaching and Learning",
    order: 7
  },
  {
    ...blockBase,
    id: "s3",
    blockType: "sentence",
    text: "AI is assisting with content generation, tutoring, assessment, and feedback, giving instructors powerful new capabilities.",
    order: 8,
    anchorable: true
  },
  {
    ...blockBase,
    id: "s4",
    blockType: "sentence",
    text: "AI will free teachers from repetitive explanation and shift them toward higher-level guidance, discussion, and critical thinking training.",
    order: 9,
    anchorable: true
  },
  {
    ...blockBase,
    id: "s5",
    blockType: "sentence",
    text: "However, overreliance on AI, academic integrity, and the digital divide remain important concerns that must be addressed.",
    order: 10,
    anchorable: true
  },
  {
    ...blockBase,
    id: "p4-heading",
    blockType: "heading",
    text: "The Future Outlook",
    order: 11
  },
  {
    ...blockBase,
    id: "s6",
    blockType: "sentence",
    text: "Looking ahead, the most successful institutions will be those that integrate AI thoughtfully while keeping human connection, ethical standards, and pedagogical quality at the center.",
    order: 12,
    anchorable: true
  },
  {
    ...blockBase,
    id: "p5-heading",
    blockType: "heading",
    text: "Conclusion",
    order: 13
  },
  {
    ...blockBase,
    id: "s7",
    blockType: "sentence",
    text: "In short, AI will not replace higher education, but it will transform how we teach, learn, and collaborate.",
    order: 14,
    anchorable: true
  }
];

export const mergedBlocks: AnswerBlock[] = mockBlocks.map((block) =>
  block.id === "s4"
    ? {
        ...block,
        text: "When used appropriately, AI can take over part of repetitive explanation and routine Q&A, allowing teachers to spend more time on discussion, learning guidance, and critical thinking."
      }
    : block
);

export const mockAnchors: Anchor[] = [
  {
    id: "anchor-s4",
    documentId,
    blockId: "s4",
    selectedText:
      "AI will free teachers from repetitive explanation and shift them toward higher-level guidance, discussion, and critical thinking training.",
    anchorType: "sentence",
    createdAt: "2026-05-10T09:50:00.000Z"
  },
  {
    id: "anchor-s5",
    documentId,
    blockId: "s5",
    selectedText:
      "However, overreliance on AI, academic integrity, and the digital divide remain important concerns that must be addressed.",
    anchorType: "sentence",
    createdAt: "2026-05-10T09:55:00.000Z"
  }
];

export const mockThreads: LocalThread[] = [
  {
    id: "thread-s4",
    documentId,
    anchorId: "anchor-s4",
    status: "active",
    visibility: "visible",
    contextPolicy: "include",
    createdInVersionNodeId: activeVersionNodeId,
    relatedBranchId: "branch-s4-revision",
    createdAt: "2026-05-10T10:05:00.000Z",
    updatedAt: "2026-05-10T10:06:00.000Z"
  },
  {
    id: "thread-s5",
    documentId,
    anchorId: "anchor-s5",
    status: "kept_as_note",
    visibility: "visible",
    contextPolicy: "include",
    createdInVersionNodeId: "v-selected",
    relatedBranchId: null,
    createdAt: "2026-05-10T09:55:00.000Z",
    updatedAt: "2026-05-10T09:58:00.000Z"
  }
];

export const mockMessages: ThreadMessage[] = [
  {
    id: "msg-s4-user",
    threadId: "thread-s4",
    role: "user",
    content: "Is this sentence too absolute? Could you make it more cautious and add a concrete example?",
    contentState: "normal",
    includeInContext: true,
    createdAt: "2026-05-10T10:32:00.000Z"
  },
  {
    id: "msg-s4-assistant",
    threadId: "thread-s4",
    role: "assistant",
    content:
      "Yes, the word \"will\" is too absolute and leaves little room for context. A more cautious phrasing is better.\n\nWhen used appropriately, AI can take over part of repetitive explanation and routine Q&A, allowing teachers to spend more time on discussion, learning guidance, and critical thinking.\n\nExamples: AI can handle concept explanation, grammar checking, and quiz generation.",
    contentState: "normal",
    includeInContext: true,
    createdAt: "2026-05-10T10:33:00.000Z"
  },
  {
    id: "msg-s5-note",
    threadId: "thread-s5",
    role: "assistant",
    content: "Potential expansion: name specific governance policies and accessibility safeguards before making the limitation claim.",
    contentState: "normal",
    includeInContext: true,
    createdAt: "2026-05-10T09:58:00.000Z"
  }
];

export const mockVersionNodes: VersionNode[] = [
  {
    id: "v-created",
    documentId,
    parentId: null,
    childIds: ["v-selected"],
    nodeType: "document_created",
    label: "Article generated",
    isActivePath: true,
    createdAt: "2026-05-10T09:30:00.000Z"
  },
  {
    id: "v-selected",
    documentId,
    parentId: "v-created",
    childIds: ["v-local-question"],
    nodeType: "anchor_selected",
    label: "Selected S2",
    relatedAnchorId: "anchor-s4",
    isActivePath: true,
    createdAt: "2026-05-10T09:50:00.000Z"
  },
  {
    id: "v-local-question",
    documentId,
    parentId: "v-selected",
    childIds: ["v-local-answer"],
    nodeType: "local_question_asked",
    label: "Asked local question",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    isActivePath: true,
    createdAt: "2026-05-10T10:05:00.000Z"
  },
  {
    id: "v-local-answer",
    documentId,
    parentId: "v-local-question",
    childIds: ["v-branch-created", "v-deleted-future"],
    nodeType: "local_answer_generated",
    label: "Local answer generated",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    isActivePath: true,
    createdAt: "2026-05-10T10:10:00.000Z"
  },
  {
    id: "v-branch-created",
    documentId,
    parentId: "v-local-answer",
    childIds: ["v-merged", "v-discarded-future"],
    nodeType: "branch_created",
    label: "Created revision branch",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    relatedBranchId: "branch-s4-revision",
    isActivePath: false,
    createdAt: "2026-05-10T10:20:00.000Z"
  },
  {
    id: "v-merged",
    documentId,
    parentId: "v-branch-created",
    childIds: [],
    nodeType: "merged",
    label: "Merged into main document",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    relatedBranchId: "branch-s4-revision",
    isActivePath: false,
    createdAt: "2026-05-10T10:40:00.000Z"
  },
  {
    id: "v-discarded-future",
    documentId,
    parentId: "v-branch-created",
    childIds: [],
    nodeType: "discarded",
    label: "Branch discarded",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    relatedBranchId: "branch-s4-revision",
    isActivePath: false,
    createdAt: "2026-05-10T11:30:00.000Z"
  },
  {
    id: "v-deleted-future",
    documentId,
    parentId: "v-local-answer",
    childIds: [],
    nodeType: "deleted",
    label: "Deleted answer",
    relatedAnchorId: "anchor-s4",
    relatedThreadId: "thread-s4",
    isActivePath: false,
    createdAt: "2026-05-10T11:40:00.000Z"
  }
];

export const mockBranches: Branch[] = [
  {
    id: "branch-s4-revision",
    documentId,
    baseVersionNodeId: "v-local-answer",
    headVersionNodeId: "v-branch-created",
    anchorId: "anchor-s4",
    threadId: "thread-s4",
    branchType: "sentence_revision",
    status: "active",
    createdAt: "2026-05-10T10:20:00.000Z"
  }
];

export const mockSnapshots: VersionSnapshot[] = [
  {
    id: "snap-v-created",
    documentId,
    versionNodeId: "v-created",
    blocks: mockBlocks,
    createdAt
  },
  {
    id: "snap-v-local-answer",
    documentId,
    versionNodeId: "v-local-answer",
    blocks: mockBlocks,
    createdAt: "2026-05-10T10:10:00.000Z"
  },
  {
    id: "snap-v-merged",
    documentId,
    versionNodeId: "v-merged",
    blocks: mergedBlocks,
    createdAt: "2026-05-10T10:40:00.000Z"
  }
];

export const mockComparisons: ArgumentComparison[] = [
  {
    id: "comparison-s4",
    documentId,
    anchorId: "anchor-s4",
    createdInVersionNodeId: activeVersionNodeId,
    status: "active",
    createdAt: "2026-05-10T10:34:00.000Z",
    updatedAt: "2026-05-10T10:34:00.000Z",
    board: {
      board_id: "comparison-s4",
      original_answer_id: "original-s4",
      revised_answer_id: "revised-s4",
      summary: {
        overall_summary:
          "The revision keeps the original teaching-role idea while making it more cautious and better supported.",
        recommended_action: "merge_both"
      },
      levels: [
        {
          level_id: "comparison-s4-main-topics",
          level_name: "main_topics",
          display_title: "Level 1: Main Topics",
          rows: [
            {
              row_id: "row-teaching-role",
              shared_topic: "AI teaching role revision",
              original: {
                title: "Original teaching claim",
                short_summary:
                  "AI will free teachers from repetitive explanation and shift them toward guidance and discussion.",
                full_text:
                  "AI will free teachers from repetitive explanation and shift them toward guidance and discussion."
              },
              revised: {
                title: "Revised teaching claim",
                short_summary:
                  "When used appropriately, AI can take over part of repetitive explanation and routine Q&A.",
                full_text:
                  "When used appropriately, AI can take over part of repetitive explanation and routine Q&A."
              },
              difference: "refined",
              importance: "high",
              short_explanation:
                "The revised claim changes an absolute promise into a more cautious and conditional claim."
            }
          ]
        },
        {
          level_id: "comparison-s4-details",
          level_name: "details_implementation",
          display_title: "Level 3: Details / Implementation",
          rows: [
            {
              row_id: "row-evidence-examples",
              shared_topic: "Evidence for the classroom use case",
              original: {
                title: "Evidence gap",
                short_summary: "No concrete classroom example provided.",
                full_text: "No concrete classroom example provided."
              },
              revised: {
                title: "Concrete examples",
                short_summary:
                  "Examples include concept explanation, grammar checking, and quiz generation.",
                full_text:
                  "Examples include concept explanation, grammar checking, and quiz generation."
              },
              difference: "expanded",
              importance: "medium",
              short_explanation:
                "The revised side adds concrete examples where the original only noted an evidence gap."
            }
          ]
        }
      ]
    },
    scaffold: {
      comparison_id: "comparison-s4",
      original_answer_id: "original-s4",
      revised_answer_id: "revised-s4",
      root_slot_id: "slot-root-s4",
      slots: [
        {
          slot_id: "slot-root-s4",
          parent_slot_id: null,
          level_index: 0,
          level_role: "root",
          shared_topic: "AI teaching role revision",
          original_node: {
            node_id: "slot-root-s4-original",
            title: "Original teaching claim",
            summary:
              "AI will free teachers from repetitive explanation and shift them toward guidance and discussion.",
            source_text:
              "AI will free teachers from repetitive explanation and shift them toward guidance and discussion."
          },
          revised_node: {
            node_id: "slot-root-s4-revised",
            title: "Revised teaching claim",
            summary:
              "When used appropriately, AI can take over part of repetitive explanation and routine Q&A.",
            source_text:
              "When used appropriately, AI can take over part of repetitive explanation and routine Q&A."
          },
          relation: "refined",
          short_comparison:
            "The revised claim changes an absolute promise into a more cautious and conditional claim.",
          order_group: "changed",
          order_index: 0
        },
        {
          slot_id: "slot-evidence-s4",
          parent_slot_id: "slot-root-s4",
          level_index: 1,
          level_role: "main_topic",
          shared_topic: "Evidence for the classroom use case",
          original_node: {
            node_id: "slot-evidence-s4-original",
            title: "Evidence gap",
            summary: "No concrete classroom example provided.",
            source_text: "No concrete classroom example provided."
          },
          revised_node: {
            node_id: "slot-evidence-s4-revised",
            title: "Concrete examples",
            summary:
              "Examples include concept explanation, grammar checking, and quiz generation.",
            source_text:
              "Examples include concept explanation, grammar checking, and quiz generation."
          },
          relation: "expanded",
          short_comparison:
            "The revised side adds concrete examples where the original only noted an evidence gap.",
          order_group: "changed",
          order_index: 1
        }
      ],
      summary: {
        overall_summary:
          "The revision keeps the original teaching-role idea while making it more cautious and better supported.",
        main_similarities: [
          "Both sides discuss AI taking over repetitive teaching work."
        ],
        main_differences: [
          "The revised side is more conditional.",
          "The revised side adds concrete examples."
        ],
        main_risks: [
          "The examples should still be checked against the surrounding answer before merging."
        ],
        recommended_action: "merge_both"
      }
    },
    originalTree: {
      id: "original-tree-s4",
      rootNodeId: "original-claim",
      nodes: [
        {
          id: "original-claim",
          nodeType: "claim",
          label: "Original Claim C0",
          text: "AI will free teachers from repetitive explanation and shift them toward guidance and discussion.",
          order: 1
        },
        {
          id: "original-reason",
          nodeType: "reason",
          label: "Reason R1",
          text: "Highlights a change in the teacher's role.",
          order: 2
        },
        {
          id: "original-issue",
          nodeType: "issue",
          label: "Issue Q1",
          text: "Wording is too absolute: \"will free teachers\".",
          order: 3
        },
        {
          id: "original-gap",
          nodeType: "evidence_gap",
          label: "Evidence Gap E0",
          text: "No concrete classroom example provided.",
          order: 4
        }
      ],
      edges: [
        {
          id: "o-edge-1",
          fromNodeId: "original-claim",
          toNodeId: "original-reason",
          edgeType: "explains"
        },
        {
          id: "o-edge-2",
          fromNodeId: "original-reason",
          toNodeId: "original-issue",
          edgeType: "critiques"
        },
        {
          id: "o-edge-3",
          fromNodeId: "original-issue",
          toNodeId: "original-gap",
          edgeType: "critiques"
        }
      ]
    },
    revisedTree: {
      id: "revised-tree-s4",
      rootNodeId: "revised-claim",
      nodes: [
        {
          id: "revised-claim",
          nodeType: "claim",
          label: "Revised Claim C1",
          text: "When used appropriately, AI can take over part of repetitive explanation and routine Q&A.",
          order: 1
        },
        {
          id: "revised-reason",
          nodeType: "reason",
          label: "Reason R2",
          text: "More cautious and realistic wording.",
          order: 2
        },
        {
          id: "revised-evidence",
          nodeType: "evidence",
          label: "Evidence E1",
          text: "Examples include concept explanation, grammar checking, and quiz generation.",
          order: 3
        },
        {
          id: "revised-advantage",
          nodeType: "advantage",
          label: "Advantage A1",
          text: "Keeps the original idea while adding practical support.",
          order: 4
        }
      ],
      edges: [
        {
          id: "r-edge-1",
          fromNodeId: "revised-claim",
          toNodeId: "revised-reason",
          edgeType: "explains"
        },
        {
          id: "r-edge-2",
          fromNodeId: "revised-reason",
          toNodeId: "revised-evidence",
          edgeType: "adds_evidence"
        },
        {
          id: "r-edge-3",
          fromNodeId: "revised-evidence",
          toNodeId: "revised-advantage",
          edgeType: "supports"
        }
      ]
    },
    comparisonEdges: [
      {
        id: "compare-claim",
        fromOriginalNodeId: "original-claim",
        toRevisedNodeId: "revised-claim",
        label: "absolute -> cautious",
        edgeType: "wording_improvement"
      },
      {
        id: "compare-evidence",
        fromOriginalNodeId: "original-gap",
        toRevisedNodeId: "revised-evidence",
        label: "no example -> concrete examples",
        edgeType: "evidence_added"
      },
      {
        id: "compare-support",
        fromOriginalNodeId: "original-issue",
        toRevisedNodeId: "revised-advantage",
        label: "broad claim -> supported claim",
        edgeType: "support_strengthened"
      }
    ]
  }
];

export function toRecord<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export const initialData = {
  document: mockDocument,
  blocks: toRecord(mockBlocks),
  anchors: toRecord(mockAnchors),
  threads: toRecord(mockThreads),
  messages: toRecord(mockMessages),
  versionNodes: toRecord(mockVersionNodes),
  branches: toRecord(mockBranches),
  comparisons: toRecord(mockComparisons),
  snapshots: toRecord(mockSnapshots)
};
