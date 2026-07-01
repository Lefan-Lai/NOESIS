import type {
  ArgumentComparison,
  ArgumentNode,
  ComparisonSlot,
  LayeredComparisonBoard,
  LayeredComparisonScaffold
} from "@/types/comparison";
import { boardToLayeredComparisonScaffold } from "./boardCompatibility";
import { createSemanticDifferenceMapFromTexts } from "./semanticDifferenceMap";

function shortText(text: string, limit = 120) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function node(
  id: string,
  nodeType: ArgumentNode["nodeType"],
  label: string,
  text: string,
  order: number
): ArgumentNode {
  return {
    id,
    nodeType,
    label,
    text,
    order
  };
}

function slot({
  id,
  parentId,
  levelIndex,
  sharedTopic,
  originalText,
  revisedText,
  relation,
  shortComparison,
  orderGroup,
  orderIndex
}: {
  id: string;
  parentId: string | null;
  levelIndex: ComparisonSlot["level_index"];
  sharedTopic: string;
  originalText?: string;
  revisedText?: string;
  relation: ComparisonSlot["relation"];
  shortComparison: string;
  orderGroup: ComparisonSlot["order_group"];
  orderIndex: number;
}): ComparisonSlot {
  const levelRoles: Record<ComparisonSlot["level_index"], ComparisonSlot["level_role"]> = {
    0: "root",
    1: "main_topic",
    2: "claim_or_decision",
    3: "support_or_detail",
    4: "consequence_risk_or_action"
  };

  return {
    slot_id: id,
    parent_slot_id: parentId,
    level_index: levelIndex,
    level_role: levelRoles[levelIndex],
    shared_topic: sharedTopic,
    original_node: originalText
      ? {
          node_id: `${id}-original`,
          title: levelIndex === 0 ? "Original answer" : sharedTopic,
          summary: shortText(originalText, 140),
          source_text: originalText
        }
      : undefined,
    revised_node: revisedText
      ? {
          node_id: `${id}-revised`,
          title: levelIndex === 0 ? "Revised answer" : sharedTopic,
          summary: shortText(revisedText, 140),
          source_text: revisedText
        }
      : undefined,
    relation,
    short_comparison: shortComparison,
    order_group: orderGroup,
    order_index: orderIndex
  };
}

function createLayeredScaffold({
  idSuffix,
  originalText,
  revisedText
}: {
  idSuffix: string;
  originalText: string;
  revisedText: string;
}): LayeredComparisonScaffold {
  const rootSlotId = `slot-${idSuffix}-root`;
  const topicSlotId = `slot-${idSuffix}-topic`;
  const claimSlotId = `slot-${idSuffix}-claim`;
  const detailSlotId = `slot-${idSuffix}-detail`;

  return {
    comparison_id: `comparison-${idSuffix}`,
    original_answer_id: `original-${idSuffix}`,
    revised_answer_id: `revised-${idSuffix}`,
    root_slot_id: rootSlotId,
    slots: [
      slot({
        id: rootSlotId,
        parentId: null,
        levelIndex: 0,
        sharedTopic: "Selected passage revision",
        originalText,
        revisedText,
        relation: "rewritten",
        shortComparison:
          "The revised passage responds to the local question while preserving the selected passage as the comparison target.",
        orderGroup: "changed",
        orderIndex: 0
      }),
      slot({
        id: topicSlotId,
        parentId: rootSlotId,
        levelIndex: 1,
        sharedTopic: "Main selected topic",
        originalText,
        revisedText,
        relation: "refined",
        shortComparison:
          "Both sides discuss the same selected passage, but the revised side adjusts its framing.",
        orderGroup: "changed",
        orderIndex: 0
      }),
      slot({
        id: claimSlotId,
        parentId: topicSlotId,
        levelIndex: 2,
        sharedTopic: "Core claim or decision",
        originalText,
        revisedText,
        relation: "refined",
        shortComparison:
          "The core claim remains comparable while the revised text better reflects the user's requested change.",
        orderGroup: "changed",
        orderIndex: 0
      }),
      slot({
        id: detailSlotId,
        parentId: claimSlotId,
        levelIndex: 3,
        sharedTopic: "Supporting wording detail",
        originalText,
        revisedText,
        relation: "rewritten",
        shortComparison:
          "The supporting wording changes to fit the local branch response.",
        orderGroup: "changed",
        orderIndex: 0
      })
    ],
    summary: {
      overall_summary:
        "The revised passage is a branch revision of the selected original passage.",
      main_similarities: ["Both sides address the same selected passage."],
      main_differences: ["The revised side changes wording or emphasis."],
      main_risks: ["Manual review is still useful before merging into the main answer."],
      recommended_action: "manual_review"
    }
  };
}

function createLayeredBoard({
  idSuffix,
  originalText,
  revisedText
}: {
  idSuffix: string;
  originalText: string;
  revisedText: string;
}): LayeredComparisonBoard {
  const boardId = `comparison-${idSuffix}`;

  return {
    board_id: boardId,
    original_answer_id: `original-${idSuffix}`,
    revised_answer_id: `revised-${idSuffix}`,
    summary: {
      overall_summary:
        "The revised answer changes the selected original answer and should be reviewed before merging.",
      recommended_action: "manual_review"
    },
    levels: [
      {
        level_id: `${boardId}-main-topics`,
        level_name: "main_topics",
        display_title: "Level 1: Main Topics",
        rows: [
          {
            row_id: `${boardId}-main-answer`,
            shared_topic: "Selected answer focus",
            original: {
              title: "Original selected answer",
              short_summary: shortText(originalText, 140),
              full_text: originalText
            },
            revised: {
              title: "Revised selected answer",
              short_summary: shortText(revisedText, 140),
              full_text: revisedText
            },
            difference: "rewritten",
            importance: "medium",
            short_explanation:
              "Both sides refer to the selected answer, but the revised version changes the wording or emphasis."
          }
        ]
      },
      {
        level_id: `${boardId}-key-decisions`,
        level_name: "key_decisions",
        display_title: "Level 2: Key Decisions",
        rows: [
          {
            row_id: `${boardId}-revision-decision`,
            shared_topic: "Revision decision",
            original: {
              title: "Original wording",
              short_summary: shortText(originalText, 120),
              full_text: originalText
            },
            revised: {
              title: "Branch revision",
              short_summary: shortText(revisedText, 120),
              full_text: revisedText
            },
            difference: "refined",
            importance: "high",
            short_explanation:
              "The branch revision is the candidate replacement or refinement for the selected original text."
          }
        ]
      }
    ]
  };
}

export function createArgumentComparisonFromTexts({
  idSuffix,
  documentId,
  anchorId,
  originalText,
  revisedText,
  createdInVersionNodeId,
  now = new Date().toISOString()
}: {
  idSuffix: string;
  documentId: string;
  anchorId: string;
  originalText: string;
  revisedText: string;
  createdInVersionNodeId: string;
  now?: string;
}): ArgumentComparison {
  const prefix = `cmp-${idSuffix}`;
  const board = createLayeredBoard({
    idSuffix,
    originalText,
    revisedText
  });
  const scaffold = boardToLayeredComparisonScaffold(board);
  const semanticMap = createSemanticDifferenceMapFromTexts({
    id: `semantic-map-${idSuffix}`,
    documentId,
    anchorId,
    originalText,
    revisedText,
    createdAt: now
  });

  return {
    id: `comparison-${idSuffix}`,
    documentId,
    anchorId,
    createdInVersionNodeId,
    semanticMap,
    board,
    scaffold,
    status: "active",
    createdAt: now,
    updatedAt: now,
    originalTree: {
      id: `${prefix}-original-tree`,
      rootNodeId: `${prefix}-original-claim`,
      nodes: [
        node(
          `${prefix}-original-claim`,
          "claim",
          "Original Claim",
          shortText(originalText),
          1
        ),
        node(
          `${prefix}-original-reason`,
          "reason",
          "Original Role",
          "This is the claim as it appeared in the generated answer before local editing.",
          2
        ),
        node(
          `${prefix}-original-issue`,
          "issue",
          "Revision Need",
          "The local question or annotation created a reason to refine this sentence.",
          3
        )
      ],
      edges: [
        {
          id: `${prefix}-o-edge-1`,
          fromNodeId: `${prefix}-original-claim`,
          toNodeId: `${prefix}-original-reason`,
          edgeType: "explains"
        },
        {
          id: `${prefix}-o-edge-2`,
          fromNodeId: `${prefix}-original-reason`,
          toNodeId: `${prefix}-original-issue`,
          edgeType: "critiques"
        }
      ]
    },
    revisedTree: {
      id: `${prefix}-revised-tree`,
      rootNodeId: `${prefix}-revised-claim`,
      nodes: [
        node(
          `${prefix}-revised-claim`,
          "claim",
          "Revised Claim",
          shortText(revisedText),
          1
        ),
        node(
          `${prefix}-revised-reason`,
          "reason",
          "Revision Logic",
          "This version responds to the local question and active annotations.",
          2
        ),
        node(
          `${prefix}-revised-advantage`,
          "advantage",
          "Expected Improvement",
          "The revision should better match the user's stated intent for this sentence.",
          3
        )
      ],
      edges: [
        {
          id: `${prefix}-r-edge-1`,
          fromNodeId: `${prefix}-revised-claim`,
          toNodeId: `${prefix}-revised-reason`,
          edgeType: "explains"
        },
        {
          id: `${prefix}-r-edge-2`,
          fromNodeId: `${prefix}-revised-reason`,
          toNodeId: `${prefix}-revised-advantage`,
          edgeType: "supports"
        }
      ]
    },
    comparisonEdges: [
      {
        id: `${prefix}-edge-claim`,
        fromOriginalNodeId: `${prefix}-original-claim`,
        toRevisedNodeId: `${prefix}-revised-claim`,
        label: "original -> revised",
        edgeType: "claim_refined"
      },
      {
        id: `${prefix}-edge-logic`,
        fromOriginalNodeId: `${prefix}-original-issue`,
        toRevisedNodeId: `${prefix}-revised-reason`,
        label: "local need -> revision logic",
        edgeType: "support_strengthened"
      }
    ]
  };
}
