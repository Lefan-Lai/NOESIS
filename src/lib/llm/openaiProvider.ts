import type {
  ArgumentComparisonInput,
  ArgumentComparisonOutput,
  ChatMessageInput,
  ChatMessageOutput,
  GenerateDocumentInput,
  GenerateDocumentOutput,
  LLMProvider,
  LocalQuestionInput,
  LocalQuestionOutput,
  SemanticDifferenceDetailInput,
  SemanticDifferenceDetailOutput
} from "./LLMProvider";
import type {
  ArgumentComparison,
  ArgumentEdge,
  ArgumentNode,
  ComparisonEdge,
  ComparisonSlot,
  LayeredComparisonBoard,
  LayeredComparisonScaffold,
  SemanticDifferenceMap
} from "@/types/comparison";
import {
  sortComparisonSlots
} from "@/lib/comparison/validateLayeredComparisonScaffold";
import {
  boardToLayeredComparisonScaffold,
  scaffoldToLayeredComparisonBoard
} from "@/lib/comparison/boardCompatibility";
import { validateLayeredComparisonBoard } from "@/lib/comparison/validateLayeredComparisonBoard";
import {
  applySemanticMapProgramRules,
  createSemanticDifferenceDetailFallback,
  createSemanticDifferenceMapFromTexts,
  semanticMapToLayeredComparisonBoard
} from "@/lib/comparison/semanticDifferenceMap";
import { validateSemanticDifferenceMap } from "@/lib/comparison/validateSemanticDifferenceMap";
import { createOpenAIResponse, parseJsonObject } from "./openaiResponses";

type OpenAIProviderOptions = {
  apiKey: string;
};

type ModelArgumentNode = {
  nodeType?: string;
  label?: string;
  text?: string;
  edgeToPrevious?: string;
};

type ModelComparisonEdge = {
  fromOriginalOrder?: number;
  toRevisedOrder?: number;
  label?: string;
  edgeType?: string;
};

type ModelArgumentComparison = {
  originalNodes?: ModelArgumentNode[];
  revisedNodes?: ModelArgumentNode[];
  comparisonEdges?: ModelComparisonEdge[];
};

const argumentNodeTypes: ArgumentNode["nodeType"][] = [
  "claim",
  "reason",
  "issue",
  "evidence",
  "evidence_gap",
  "advantage"
];

const argumentEdgeTypes: ArgumentEdge["edgeType"][] = [
  "supports",
  "critiques",
  "explains",
  "adds_evidence"
];

const comparisonEdgeTypes: ComparisonEdge["edgeType"][] = [
  "wording_improvement",
  "evidence_added",
  "claim_refined",
  "support_strengthened"
];

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asArgumentNodeType(value: unknown, fallback: ArgumentNode["nodeType"]) {
  return argumentNodeTypes.includes(value as ArgumentNode["nodeType"])
    ? (value as ArgumentNode["nodeType"])
    : fallback;
}

function asArgumentEdgeType(value: unknown, fallback: ArgumentEdge["edgeType"]) {
  return argumentEdgeTypes.includes(value as ArgumentEdge["edgeType"])
    ? (value as ArgumentEdge["edgeType"])
    : fallback;
}

function asComparisonEdgeType(
  value: unknown,
  fallback: ComparisonEdge["edgeType"]
) {
  return comparisonEdgeTypes.includes(value as ComparisonEdge["edgeType"])
    ? (value as ComparisonEdge["edgeType"])
    : fallback;
}

function shortText(text: string, limit = 160) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function fallbackBoardFromTexts({
  boardId,
  originalAnswerId,
  revisedAnswerId,
  originalText,
  revisedText,
  overallSummary,
  recommendedAction = "manual_review"
}: {
  boardId: string;
  originalAnswerId: string;
  revisedAnswerId: string;
  originalText: string;
  revisedText: string;
  overallSummary: string;
  recommendedAction?: LayeredComparisonBoard["summary"]["recommended_action"];
}): LayeredComparisonBoard {
  return {
    board_id: boardId,
    original_answer_id: originalAnswerId,
    revised_answer_id: revisedAnswerId,
    summary: {
      overall_summary: overallSummary,
      recommended_action: recommendedAction
    },
    levels: [
      {
        level_id: `${boardId}-key-decisions`,
        level_name: "key_decisions",
        display_title: "Level 2: Key Decisions",
        rows: [
          {
            row_id: `${boardId}-revision-row`,
            shared_topic: "Selected answer revision",
            original: {
              title: "Original",
              short_summary: shortText(originalText),
              full_text: originalText
            },
            revised: {
              title: "Revised",
              short_summary: shortText(revisedText),
              full_text: revisedText
            },
            difference: "rewritten",
            importance: "medium",
            short_explanation:
              "The revised answer changes the selected original answer and should be reviewed before merging."
          }
        ]
      }
    ]
  };
}

function contextToText(
  contextItems: Array<{ type: string; text: string; reason?: string }> = []
) {
  return contextItems
    .map((item) => `[${item.type}] ${item.text}${item.reason ? `\nReason: ${item.reason}` : ""}`)
    .join("\n\n");
}

function normalizeMessages(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = []
) {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

function normalizeModelNodes({
  nodes,
  treeKind,
  prefix,
  fallbackText
}: {
  nodes: ModelArgumentNode[] | undefined;
  treeKind: "original" | "revised";
  prefix: string;
  fallbackText: string;
}): ArgumentNode[] {
  const fallbackLabel = treeKind === "original" ? "Original Claim" : "Revised Claim";
  const fallbackNodes =
    nodes && nodes.length > 0
      ? nodes
      : [
          {
            nodeType: "claim",
            label: fallbackLabel,
            text: fallbackText
          }
        ];

  return fallbackNodes.slice(0, 5).map((node, index) => ({
    id: `${prefix}-${treeKind}-${index + 1}`,
    nodeType: asArgumentNodeType(
      node.nodeType,
      index === 0 ? "claim" : treeKind === "original" ? "issue" : "advantage"
    ),
    label: cleanText(node.label, index === 0 ? fallbackLabel : `Point ${index + 1}`),
    text: cleanText(node.text, shortText(fallbackText)),
    order: index + 1
  }));
}

function buildTreeEdges({
  modelNodes,
  normalizedNodes,
  prefix,
  treeKind
}: {
  modelNodes: ModelArgumentNode[] | undefined;
  normalizedNodes: ArgumentNode[];
  prefix: string;
  treeKind: "original" | "revised";
}): ArgumentEdge[] {
  return normalizedNodes.slice(1).map((node, index) => ({
    id: `${prefix}-${treeKind}-edge-${index + 1}`,
    fromNodeId: normalizedNodes[index].id,
    toNodeId: node.id,
    edgeType: asArgumentEdgeType(modelNodes?.[index + 1]?.edgeToPrevious, "explains")
  }));
}

function buildComparisonFromModelOutput(
  input: ArgumentComparisonInput,
  generated: ModelArgumentComparison
): ArgumentComparison {
  const now = new Date().toISOString();
  const idSuffix = `llm-${Date.now().toString(36)}`;
  const prefix = `cmp-${idSuffix}`;
  const originalNodes = normalizeModelNodes({
    nodes: generated.originalNodes,
    treeKind: "original",
    prefix,
    fallbackText: input.originalText
  });
  const revisedNodes = normalizeModelNodes({
    nodes: generated.revisedNodes,
    treeKind: "revised",
    prefix,
    fallbackText: input.revisedText
  });
  const originalEdges = buildTreeEdges({
    modelNodes: generated.originalNodes,
    normalizedNodes: originalNodes,
    prefix,
    treeKind: "original"
  });
  const revisedEdges = buildTreeEdges({
    modelNodes: generated.revisedNodes,
    normalizedNodes: revisedNodes,
    prefix,
    treeKind: "revised"
  });
  const modelComparisonEdges =
    generated.comparisonEdges && generated.comparisonEdges.length > 0
      ? generated.comparisonEdges
      : [
          {
            fromOriginalOrder: 1,
            toRevisedOrder: 1,
            label: "claim refined",
            edgeType: "claim_refined"
          }
        ];

  return {
    id: `comparison-${idSuffix}`,
    documentId: input.documentId,
    anchorId: input.anchorId,
    board: fallbackBoardFromTexts({
      boardId: `comparison-${idSuffix}`,
      originalAnswerId: `original-${idSuffix}`,
      revisedAnswerId: `revised-${idSuffix}`,
      originalText: input.originalText,
      revisedText: input.revisedText,
      overallSummary:
        "Legacy comparison output was converted into a Layered Comparison Board."
    }),
    createdInVersionNodeId: input.createdInVersionNodeId,
    scaffold: {
      comparison_id: `comparison-${idSuffix}`,
      original_answer_id: `original-${idSuffix}`,
      revised_answer_id: `revised-${idSuffix}`,
      root_slot_id: `${prefix}-legacy-root-slot`,
      slots: [
        {
          slot_id: `${prefix}-legacy-root-slot`,
          parent_slot_id: null,
          level_index: 0,
          level_role: "root",
          shared_topic: "Legacy comparison output",
          original_node: {
            node_id: `${prefix}-legacy-original-root`,
            title: "Original",
            summary: shortText(input.originalText),
            source_text: input.originalText
          },
          revised_node: {
            node_id: `${prefix}-legacy-revised-root`,
            title: "Revised",
            summary: shortText(input.revisedText),
            source_text: input.revisedText
          },
          relation: "rewritten",
          short_comparison:
            "Legacy comparison output converted into a single root scaffold slot.",
          order_group: "changed",
          order_index: 0
        }
      ],
      summary: {
        overall_summary:
          "Legacy comparison output was converted into a standard scaffold.",
        main_similarities: ["Both sides compare the same selected passage."],
        main_differences: ["The revised side changes the selected passage."],
        main_risks: ["Review manually before merging."],
        recommended_action: "manual_review"
      }
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
    originalTree: {
      id: `${prefix}-original-tree`,
      rootNodeId: originalNodes[0].id,
      nodes: originalNodes,
      edges: originalEdges
    },
    revisedTree: {
      id: `${prefix}-revised-tree`,
      rootNodeId: revisedNodes[0].id,
      nodes: revisedNodes,
      edges: revisedEdges
    },
    comparisonEdges: modelComparisonEdges.slice(0, 5).map((edge, index) => {
      const originalIndex = Math.max(0, (edge.fromOriginalOrder ?? 1) - 1);
      const revisedIndex = Math.max(0, (edge.toRevisedOrder ?? 1) - 1);

      return {
        id: `${prefix}-comparison-edge-${index + 1}`,
        fromOriginalNodeId:
          originalNodes[originalIndex]?.id ?? originalNodes[0].id,
        toRevisedNodeId: revisedNodes[revisedIndex]?.id ?? revisedNodes[0].id,
        label: cleanText(edge.label, "related change"),
        edgeType: asComparisonEdgeType(edge.edgeType, "claim_refined")
      };
    })
  };
}

function nodeTypeFromSlot(slot: ComparisonSlot): ArgumentNode["nodeType"] {
  if (slot.relation === "contradicted") {
    return "issue";
  }

  if (slot.level_role === "support_or_detail") {
    return "evidence";
  }

  if (slot.level_role === "consequence_risk_or_action") {
    return "advantage";
  }

  if (slot.level_role === "main_topic") {
    return "reason";
  }

  return "claim";
}

function buildLegacyTreeFromScaffold({
  scaffold,
  side,
  prefix
}: {
  scaffold: LayeredComparisonScaffold;
  side: "original" | "revised";
  prefix: string;
}) {
  const slots = sortComparisonSlots(scaffold.slots).filter((slot) =>
    side === "original" ? slot.original_node : slot.revised_node
  );
  const slotNodeIds = new Map<string, string>();
  const nodes: ArgumentNode[] = slots.map((slot, index) => {
    const slotNode = side === "original" ? slot.original_node : slot.revised_node;
    const id = `${prefix}-${side}-${slot.slot_id}`;

    slotNodeIds.set(slot.slot_id, id);

    return {
      id,
      nodeType: nodeTypeFromSlot(slot),
      label: slotNode?.title ?? slot.shared_topic,
      text: slotNode?.summary ?? slot.short_comparison,
      order: index + 1
    };
  });
  const edges = slots
    .filter((slot) => slot.parent_slot_id && slotNodeIds.has(slot.parent_slot_id))
    .map((slot, index) => ({
      id: `${prefix}-${side}-edge-${index + 1}`,
      fromNodeId: slotNodeIds.get(slot.parent_slot_id ?? "") ?? nodes[0]?.id,
      toNodeId: slotNodeIds.get(slot.slot_id) ?? nodes[0]?.id,
      edgeType: "explains" as const
    }));

  return {
    id: `${prefix}-${side}-tree`,
    rootNodeId: slotNodeIds.get(scaffold.root_slot_id) ?? nodes[0]?.id ?? `${prefix}-${side}-empty`,
    nodes,
    edges
  };
}

function buildComparisonFromScaffold(
  input: ArgumentComparisonInput,
  scaffold: LayeredComparisonScaffold
): ArgumentComparison {
  const now = new Date().toISOString();
  const id = `comparison-${input.anchorId}-${Date.now().toString(36)}`;
  const normalizedScaffold = {
    ...scaffold,
    comparison_id: id,
    original_answer_id: scaffold.original_answer_id || `original-${input.anchorId}`,
    revised_answer_id: scaffold.revised_answer_id || `revised-${input.anchorId}`
  };
  const prefix = `cmp-${id}`;
  const originalTree = buildLegacyTreeFromScaffold({
    scaffold: normalizedScaffold,
    side: "original",
    prefix
  });
  const revisedTree = buildLegacyTreeFromScaffold({
    scaffold: normalizedScaffold,
    side: "revised",
    prefix
  });
  const comparisonEdges = sortComparisonSlots(normalizedScaffold.slots)
    .filter((slot) => slot.original_node && slot.revised_node)
    .map((slot, index) => ({
      id: `${prefix}-edge-${index + 1}`,
      fromOriginalNodeId: `${prefix}-original-${slot.slot_id}`,
      toRevisedNodeId: `${prefix}-revised-${slot.slot_id}`,
      label: slot.relation,
      edgeType:
        slot.relation === "expanded"
          ? "evidence_added" as const
          : slot.relation === "refined"
            ? "claim_refined" as const
            : slot.relation === "same"
              ? "support_strengthened" as const
              : "wording_improvement" as const
    }));

  return {
    id,
    documentId: input.documentId,
    anchorId: input.anchorId,
    board: scaffoldToLayeredComparisonBoard(normalizedScaffold),
    scaffold: normalizedScaffold,
    originalTree,
    revisedTree,
    comparisonEdges,
    createdInVersionNodeId: input.createdInVersionNodeId,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function buildComparisonFromBoard(
  input: ArgumentComparisonInput,
  board: LayeredComparisonBoard
): ArgumentComparison {
  const now = new Date().toISOString();
  const id = `comparison-${input.anchorId}-${Date.now().toString(36)}`;
  const normalizedBoard: LayeredComparisonBoard = {
    ...board,
    board_id: id,
    original_answer_id: board.original_answer_id || `original-${input.anchorId}`,
    revised_answer_id: board.revised_answer_id || `revised-${input.anchorId}`
  };
  const scaffold = boardToLayeredComparisonScaffold(normalizedBoard);
  const prefix = `cmp-${id}`;
  const originalTree = buildLegacyTreeFromScaffold({
    scaffold,
    side: "original",
    prefix
  });
  const revisedTree = buildLegacyTreeFromScaffold({
    scaffold,
    side: "revised",
    prefix
  });
  const comparisonEdges = sortComparisonSlots(scaffold.slots)
    .filter((slot) => slot.original_node && slot.revised_node)
    .map((slot, index) => ({
      id: `${prefix}-edge-${index + 1}`,
      fromOriginalNodeId: `${prefix}-original-${slot.slot_id}`,
      toRevisedNodeId: `${prefix}-revised-${slot.slot_id}`,
      label: slot.relation,
      edgeType:
        slot.relation === "expanded"
          ? "evidence_added" as const
          : slot.relation === "refined"
            ? "claim_refined" as const
            : slot.relation === "same"
              ? "support_strengthened" as const
              : "wording_improvement" as const
    }));

  return {
    id,
    documentId: input.documentId,
    anchorId: input.anchorId,
    board: normalizedBoard,
    scaffold,
    originalTree,
    revisedTree,
    comparisonEdges,
    createdInVersionNodeId: input.createdInVersionNodeId,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function normalizeSemanticMapForInput(
  input: ArgumentComparisonInput,
  map: SemanticDifferenceMap | null
): SemanticDifferenceMap | null {
  if (!map || typeof map !== "object") {
    return null;
  }

  const now = new Date().toISOString();

  return {
    ...map,
    id: map.id || `semantic-map-${input.anchorId}`,
    documentId: input.documentId,
    anchorId: input.anchorId,
    originalText: input.originalText,
    revisedText: input.revisedText,
    createdAt: map.createdAt || now
  };
}

function buildComparisonFromSemanticMap(
  input: ArgumentComparisonInput,
  semanticMap: SemanticDifferenceMap
): ArgumentComparison {
  const now = new Date().toISOString();
  const id = `comparison-${input.anchorId}-${Date.now().toString(36)}`;
  const normalizedMap: SemanticDifferenceMap = {
    ...semanticMap,
    id,
    documentId: input.documentId,
    anchorId: input.anchorId,
    originalText: input.originalText,
    revisedText: input.revisedText,
    createdAt: semanticMap.createdAt || now
  };
  const board = semanticMapToLayeredComparisonBoard(normalizedMap);
  const scaffold = boardToLayeredComparisonScaffold(board);
  const prefix = `cmp-${id}`;
  const originalTree = buildLegacyTreeFromScaffold({
    scaffold,
    side: "original",
    prefix
  });
  const revisedTree = buildLegacyTreeFromScaffold({
    scaffold,
    side: "revised",
    prefix
  });
  const comparisonEdges = sortComparisonSlots(scaffold.slots)
    .filter((slot) => slot.original_node && slot.revised_node)
    .map((slot, index) => ({
      id: `${prefix}-edge-${index + 1}`,
      fromOriginalNodeId: `${prefix}-original-${slot.slot_id}`,
      toRevisedNodeId: `${prefix}-revised-${slot.slot_id}`,
      label: slot.relation,
      edgeType:
        slot.relation === "expanded"
          ? "evidence_added" as const
          : slot.relation === "refined"
            ? "claim_refined" as const
            : slot.relation === "same"
              ? "support_strengthened" as const
              : "wording_improvement" as const
    }));

  return {
    id,
    documentId: input.documentId,
    anchorId: input.anchorId,
    semanticMap: normalizedMap,
    board,
    scaffold,
    originalTree,
    revisedTree,
    comparisonEdges,
    createdInVersionNodeId: input.createdInVersionNodeId,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

const layeredComparisonBoardSystemPrompt = `You are generating a Layered Comparison Board for comparing an original answer and a revised answer.

Do not generate a tree.
Do not generate graph nodes.
Do not generate node-link alignment.
Do not generate visual coordinates, SVG, React components, CSS, or layout code.

Generate a concise semantic comparison board.

The board may contain these levels:
1. Main Topics
2. Key Decisions
3. Details / Implementation
4. Risks / Actions

Rules:
- Do not include empty levels.
- Rows in the same level must compare the same type of semantic object.
- Each row must compare one shared topic between the original and revised answer.
- Prioritize meaningful semantic, structural, design, or implementation changes.
- Merge small or similar changes into a broader comparison row when appropriate.
- Do not over-generate minor wording differences.
- Do not force every detail into the board.
- Include unchanged content only when it is important for understanding the overall comparison.
- Use only these difference labels:
  same, rewritten, refined, expanded, reduced, replaced, added, removed, conflict.
- Keep the result concise and readable.
- Return valid JSON only.`;

function layeredComparisonBoardUserPrompt(input: ArgumentComparisonInput) {
  return `Generate a Layered Comparison Board for the two answers below.

Original answer:
${input.originalText}

Revised answer:
${input.revisedText}

Local question:
${input.localQuestion ?? ""}

Local answer:
${input.localAnswer ?? ""}

Return JSON in this schema:

{
  "board_id": "temporary id",
  "original_answer_id": "original-${input.anchorId}",
  "revised_answer_id": "revised-${input.anchorId}",
  "summary": {
    "overall_summary": "string",
    "recommended_action": "keep_original | prefer_revised | merge_both | manual_review"
  },
  "levels": [
    {
      "level_id": "string",
      "level_name": "main_topics | key_decisions | details_implementation | risks_actions",
      "display_title": "string",
      "rows": [
        {
          "row_id": "string",
          "shared_topic": "string",
          "original": {
            "title": "string",
            "short_summary": "string",
            "full_text": "string"
          },
          "revised": {
            "title": "string",
            "short_summary": "string",
            "full_text": "string"
          },
          "difference": "same | rewritten | refined | expanded | reduced | replaced | added | removed | conflict",
          "importance": "low | medium | high",
          "short_explanation": "string"
        }
      ]
    }
  ]
}`;
}

const semanticDifferenceMapSystemPrompt = `You generate Stage 1 of a Semantic Difference Map: a compact Semantic Map Index.

Do not generate a tree.
Do not generate graph nodes.
Do not generate word-level diff.
Do not generate visual coordinates, SVG, React components, CSS, or layout code.
Do not generate long local explanations.
Do not generate why-it-matters paragraphs.
Do not generate context-impact paragraphs.

Generate concise JSON only.

Core rules:
- Split the original and revised answers into semantic blocks, not sentences.
- Align semantic blocks by meaning and role, not by exact wording.
- Each row must describe one semantic block alignment.
- Prefer 3 to 6 important rows. Use at most 8 rows unless truly necessary.
- Do not over-generate minor wording changes.
- Use the fixed enum values from the schema only.
- If a change is minor, mark importance as low.
- If alignment is uncertain, use alignmentType unmatched, confidence low, and risk medium or high.
- UI layout, counts, risk aggregation, sorting, collapsing, colors, and detail display are handled by program rules.
- Stage 1 rows must be compact.`;

function semanticDifferenceMapUserPrompt(input: ArgumentComparisonInput) {
  const contextSummary = contextToText((input.contextItems ?? []).slice(0, 6));

  return `Generate a Semantic Difference Map.

Original selected text:
${input.originalText}

Revised answer:
${input.revisedText}

Local question:
${input.localQuestion ?? ""}

Local answer:
${input.localAnswer ?? ""}

Relevant active-path context summary:
${contextSummary || "No additional context."}

Return valid JSON in this exact Stage 1 shape:

{
  "id": "temporary-id",
  "documentId": "${input.documentId}",
  "anchorId": "${input.anchorId}",
  "originalText": "copy original selected text",
  "revisedText": "copy revised answer",
  "overview": {
    "mainSummary": "one concise sentence",
    "meaningEffect": "meaning_preserved | meaning_narrowed | meaning_expanded | meaning_shifted | meaning_unclear",
    "riskLevel": "none | low | medium | high",
    "counts": { "added": 0, "removed": 0, "rewritten": 0, "moved": 0, "claimChanged": 0, "toneChanged": 0 }
  },
  "rows": [
    {
      "id": "row-1",
      "blockType": "claim | reason | evidence | example | definition | limitation | method | result | interpretation | conclusion | transition | other",
      "originalBlock": {
        "id": "original-1",
        "blockType": "claim | reason | evidence | example | definition | limitation | method | result | interpretation | conclusion | transition | other",
        "text": "semantic original block text, not the full answer",
        "preview": "short preview"
      },
      "revisedBlock": {
        "id": "revised-1",
        "blockType": "claim | reason | evidence | example | definition | limitation | method | result | interpretation | conclusion | transition | other",
        "text": "semantic revised block text, not the full answer",
        "preview": "short preview"
      },
      "originalIndex": 1,
      "revisedIndex": 1,
      "alignmentType": "one_to_one | one_to_many | many_to_one | added_only | removed_only | moved | unmatched",
      "primaryChange": "unchanged | added | removed | rewritten | moved | split | merged",
      "semanticTags": ["claim_softened"],
      "importance": "critical | high | medium | low",
      "risk": "none | low | medium | high",
      "triggeredBy": "user_question | annotation | llm_inference | context_alignment | unknown",
      "confidence": "high | medium | low"
    }
  ],
  "createdAt": "temporary date"
}

For added_only rows, omit originalBlock. For removed_only rows, omit revisedBlock. Do not leave blank objects.
Do not invent primaryChange values such as improved, enhanced, better, refined, optimized, or clarified.

Allowed semanticTags only:
claim_changed, claim_softened, claim_strengthened, scope_expanded, scope_narrowed, evidence_added, evidence_removed, example_added, example_removed, limitation_added, definition_added, logic_clarified, tone_more_cautious, tone_more_confident, tone_more_academic, wording_simplified, wording_more_precise, structure_reordered, risk_introduced, context_aligned.`;
}

const semanticDifferenceDetailSystemPrompt = `You generate Stage 2 of a Semantic Difference Map: Local Difference Explanation.

Only explain the selected row. Do not explain other rows.
Do not generate a tree, graph, word-level diff, UI code, or JSON outside the requested schema.
Use the selected row, original block, revised block, local question, active annotations, and context summary.
Return valid JSON only.`;

function semanticDifferenceDetailUserPrompt(input: SemanticDifferenceDetailInput) {
  return `Generate Local Difference Explanation for this selected semantic alignment row.

Selected row JSON:
${JSON.stringify(input.row)}

Original full block:
${input.row.originalBlock?.text ?? input.originalText}

Revised full block:
${input.row.revisedBlock?.text ?? input.revisedText}

Local question:
${input.localQuestion ?? ""}

Active annotations:
${input.annotations?.length ? input.annotations.join("\n") : "None"}

Necessary context summary:
${input.contextSummary ?? "No additional context."}

Return valid JSON in this exact shape:

{
  "rowId": "${input.row.id}",
  "originalFullBlock": "string",
  "revisedFullBlock": "string",
  "primaryChange": "unchanged | added | removed | rewritten | moved | split | merged",
  "semanticTags": ["claim_softened"],
  "explanation": "concise explanation of what changed",
  "whyItMatters": "why this matters for meaning, scope, evidence, or user decision",
  "triggeredBy": "user_question | annotation | llm_inference | context_alignment | unknown",
  "risk": "none | low | medium | high",
  "contextImpact": "how future local context should treat this change",
  "confidence": "high | medium | low"
}`;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
  }

  async generateDocument(
    input: GenerateDocumentInput
  ): Promise<GenerateDocumentOutput> {
    const contextText = contextToText(input.contextItems);
    const text = await createOpenAIResponse({
      apiKey: this.apiKey,
      model: input.model ?? "gpt-4.1",
      input: [
        {
          role: "system",
          content:
            "You are the assistant inside the Main Answer Window of an interactive answer system. Continue the same conversation session instead of treating every user message as an unrelated request. Generate or update the main answer using the previous session messages and effective context. Return a normal natural-language document answer, not JSON, not markdown metadata, and not sentence summary arrays."
        },
        {
          role: "system",
          content: `Effective context:\n${contextText || "No additional context."}`
        },
        ...normalizeMessages(input.messages),
        {
          role: "user",
          content: input.prompt
        }
      ]
    });

    return {
      title: input.prompt.length > 80 ? `${input.prompt.slice(0, 77)}...` : input.prompt,
      answer: text || "The model returned an empty response."
    };
  }

  async answerLocalQuestion(
    input: LocalQuestionInput
  ): Promise<LocalQuestionOutput> {
    const contextText = contextToText(input.contextItems);
    const text = await createOpenAIResponse({
      apiKey: this.apiKey,
      model: input.model ?? "gpt-4.1",
      input: [
        {
          role: "system",
          content:
            "You are the assistant inside a Local Branch Window. Answer local follow-up questions attached to one selected passage from a larger answer. Continue this branch session using previous branch messages. Use only the supplied active-path context and selected passage. Treat annotations as user instructions for future generation. Return only valid JSON with keys answer and revisedText."
        },
        ...normalizeMessages(input.messages),
        {
          role: "user",
          content: `Selected passage:\n${input.anchorText}\n\nLocal question:\n${input.question}\n\nActive-path context:\n${contextText}`
        }
      ]
    });

    return parseJsonObject<LocalQuestionOutput>(text, {
      answer: text || "The model returned an empty response.",
      revisedText: undefined
    });
  }

  async generateArgumentComparison(
    input: ArgumentComparisonInput
  ): Promise<ArgumentComparisonOutput> {
    const text = await createOpenAIResponse({
      apiKey: this.apiKey,
      model: input.model ?? "gpt-4.1",
      input: [
        {
          role: "system",
          content: semanticDifferenceMapSystemPrompt
        },
        {
          role: "user",
          content: semanticDifferenceMapUserPrompt(input)
        }
      ]
    });

    const parsedMap = normalizeSemanticMapForInput(
      input,
      parseJsonObject<SemanticDifferenceMap | null>(text, null)
    );
    const programRuledMap = parsedMap
      ? applySemanticMapProgramRules(parsedMap)
      : null;
    const validation = parsedMap
      ? validateSemanticDifferenceMap(programRuledMap as SemanticDifferenceMap)
      : {
          valid: false,
          errors: ["The selected model did not return JSON."]
        };
    const semanticMap =
      programRuledMap && validation.valid
        ? programRuledMap
        : applySemanticMapProgramRules(createSemanticDifferenceMapFromTexts({
            id: `semantic-map-${input.anchorId}-${Date.now().toString(36)}`,
            documentId: input.documentId,
            anchorId: input.anchorId,
            originalText: input.originalText,
            revisedText: input.revisedText,
            localQuestion: input.localQuestion
          }));

    return {
      comparison: buildComparisonFromSemanticMap(input, semanticMap)
    };
  }

  async generateSemanticDifferenceDetail(
    input: SemanticDifferenceDetailInput
  ): Promise<SemanticDifferenceDetailOutput> {
    const text = await createOpenAIResponse({
      apiKey: this.apiKey,
      model: input.model ?? "gpt-4.1",
      input: [
        {
          role: "system",
          content: semanticDifferenceDetailSystemPrompt
        },
        {
          role: "user",
          content: semanticDifferenceDetailUserPrompt(input)
        }
      ]
    });
    const fallback = createSemanticDifferenceDetailFallback(input.row);
    const parsed = parseJsonObject<typeof fallback>(text, fallback);

    return {
      detail: {
        ...fallback,
        ...parsed,
        rowId: input.row.id,
        primaryChange: input.row.primaryChange,
        semanticTags: parsed.semanticTags?.length ? parsed.semanticTags : input.row.semanticTags,
        triggeredBy: parsed.triggeredBy ?? input.row.triggeredBy,
        risk: parsed.risk ?? input.row.risk,
        confidence: parsed.confidence ?? input.row.confidence
      }
    };
  }

  async sendChatMessage(input: ChatMessageInput): Promise<ChatMessageOutput> {
    const contextText = contextToText(input.contextItems);
    const text = await createOpenAIResponse({
      apiKey: this.apiKey,
      model: input.model ?? "gpt-4.1",
      input: [
        {
          role: "system",
          content: input.systemPrompt
        },
        {
          role: "system",
          content: `Effective context:\n${contextText || "No additional context."}`
        },
        ...normalizeMessages(input.messages),
        {
          role: "user",
          content: input.userMessage
        }
      ]
    });

    return {
      answer: text || "The model returned an empty response."
    };
  }
}
