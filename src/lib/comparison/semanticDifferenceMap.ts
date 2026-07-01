import type {
  ComparisonDifference,
  ComparisonImportance,
  LayeredComparisonBoard,
  SemanticAlignmentRow,
  SemanticBlockType,
  SemanticDifferenceDetail,
  SemanticDifferenceMap,
  SemanticMeaningEffect,
  SemanticPrimaryChange,
  SemanticRiskLevel,
  SemanticTag
} from "@/types/comparison";

function shortText(text: string, limit = 140) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 3)}...`
    : normalized;
}

export function semanticBlockTypeForRow(row: SemanticAlignmentRow): SemanticBlockType {
  return row.blockType ?? row.originalBlock?.blockType ?? row.revisedBlock?.blockType ?? "other";
}

function riskFromRow(row: SemanticAlignmentRow): SemanticRiskLevel {
  if (row.risk === "high" || row.semanticTags.includes("risk_introduced")) {
    return "high";
  }

  if (row.risk === "medium") {
    return "medium";
  }

  if (row.importance === "critical") {
    return "medium";
  }

  return row.risk;
}

function boardDifferenceFromPrimaryChange(
  primaryChange: SemanticPrimaryChange,
  tags: SemanticTag[]
): ComparisonDifference {
  if (primaryChange === "added") {
    return "added";
  }

  if (primaryChange === "removed") {
    return "removed";
  }

  if (primaryChange === "unchanged") {
    return "same";
  }

  if (tags.includes("risk_introduced") || tags.includes("claim_changed")) {
    return "replaced";
  }

  if (
    tags.includes("scope_expanded") ||
    tags.includes("evidence_added") ||
    tags.includes("example_added") ||
    tags.includes("limitation_added")
  ) {
    return "expanded";
  }

  if (tags.includes("scope_narrowed")) {
    return "reduced";
  }

  return "rewritten";
}

function boardImportanceFromSemantic(
  importance: SemanticAlignmentRow["importance"]
): ComparisonImportance {
  if (importance === "critical" || importance === "high") {
    return "high";
  }

  if (importance === "medium") {
    return "medium";
  }

  return "low";
}

function meaningEffectFromRows(rows: SemanticAlignmentRow[]): SemanticMeaningEffect {
  if (
    rows.some(
      (row) =>
        row.semanticTags.includes("risk_introduced") ||
        row.semanticTags.includes("claim_changed")
    )
  ) {
    return "meaning_shifted" as const;
  }

  if (rows.some((row) => row.semanticTags.includes("scope_expanded"))) {
    return "meaning_expanded" as const;
  }

  if (
    rows.some(
      (row) =>
        row.semanticTags.includes("scope_narrowed") ||
        row.semanticTags.includes("claim_softened")
    )
  ) {
    return "meaning_narrowed" as const;
  }

  return "meaning_preserved" as const;
}

export function countsFromRows(rows: SemanticAlignmentRow[]) {
  return {
    added: rows.filter((row) => row.primaryChange === "added").length,
    removed: rows.filter((row) => row.primaryChange === "removed").length,
    rewritten: rows.filter((row) => row.primaryChange === "rewritten").length,
    moved: rows.filter((row) => row.primaryChange === "moved").length,
    claimChanged: rows.filter((row) =>
      row.semanticTags.some((tag) =>
        ["claim_changed", "claim_softened", "claim_strengthened"].includes(tag)
      )
    ).length,
    toneChanged: rows.filter((row) =>
      row.semanticTags.some((tag) => tag.startsWith("tone_"))
    ).length
  };
}

export function overallRiskFromRows(rows: SemanticAlignmentRow[]): SemanticRiskLevel {
  const risks = rows.map(riskFromRow);

  if (risks.includes("high")) {
    return "high";
  }

  if (risks.includes("medium")) {
    return "medium";
  }

  if (risks.includes("low")) {
    return "low";
  }

  return "none";
}

const importanceRank: Record<SemanticAlignmentRow["importance"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const riskRank: Record<SemanticRiskLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3
};

export function sortSemanticRows(rows: SemanticAlignmentRow[]) {
  return [...rows].sort((a, b) => {
    const riskDiff = riskRank[a.risk] - riskRank[b.risk];

    if (riskDiff !== 0) {
      return riskDiff;
    }

    const importanceDiff = importanceRank[a.importance] - importanceRank[b.importance];

    if (importanceDiff !== 0) {
      return importanceDiff;
    }

    return (a.originalIndex ?? a.revisedIndex ?? 999) - (b.originalIndex ?? b.revisedIndex ?? 999);
  });
}

export function groupSemanticRowsForDisplay(rows: SemanticAlignmentRow[]) {
  const sorted = sortSemanticRows(rows);
  const explicitImportant = sorted
    .filter((row) => row.importance === "critical" || row.importance === "high")
    .slice(0, 8);
  const important =
    explicitImportant.length > 0 ? explicitImportant : sorted.slice(0, 5);
  const hiddenImportant = sorted.filter(
    (row) =>
      (row.importance === "critical" || row.importance === "high") &&
      !important.some((item) => item.id === row.id)
  );

  return {
    important,
    hiddenImportant,
    medium: sorted.filter(
      (row) =>
        row.importance === "medium" &&
        !important.some((item) => item.id === row.id)
    ),
    low: sorted.filter(
      (row) =>
        row.importance === "low" &&
        !important.some((item) => item.id === row.id)
    )
  };
}

function normalizeBlock(
  block: SemanticAlignmentRow["originalBlock"] | undefined,
  fallbackType: SemanticBlockType
) {
  if (!block) {
    return undefined;
  }

  const text = block.text?.trim() || block.preview?.trim() || "No block text returned.";

  return {
    id: block.id || `block-${Math.random().toString(36).slice(2, 8)}`,
    blockType: block.blockType ?? fallbackType,
    text,
    preview: shortText(block.preview || text)
  };
}

export function applySemanticMapProgramRules(map: SemanticDifferenceMap): SemanticDifferenceMap {
  const rows = map.rows.map((row, index) => {
    const blockType = semanticBlockTypeForRow(row);
    const normalizedRow: SemanticAlignmentRow = {
      ...row,
      id: row.id || `row-${index + 1}`,
      blockType,
      originalBlock: normalizeBlock(row.originalBlock, blockType),
      revisedBlock: normalizeBlock(row.revisedBlock, blockType),
      originalIndex: row.originalIndex,
      revisedIndex: row.revisedIndex,
      semanticTags: Array.from(new Set(row.semanticTags ?? [])).slice(0, 6),
      importance: row.importance ?? "medium",
      risk: row.risk ?? "low",
      triggeredBy: row.triggeredBy ?? "unknown",
      confidence: row.confidence ?? "medium"
    };

    return normalizedRow;
  });

  return {
    ...map,
    overview: {
      mainSummary:
        map.overview?.mainSummary?.trim() ||
        "The revised answer changes selected semantic blocks from the original answer.",
      meaningEffect: map.overview?.meaningEffect ?? meaningEffectFromRows(rows),
      riskLevel: overallRiskFromRows(rows),
      counts: countsFromRows(rows)
    },
    rows
  };
}

export function createSemanticDifferenceDetailFallback(
  row: SemanticAlignmentRow
): SemanticDifferenceDetail {
  const original = row.originalBlock?.text ?? "No matching block";
  const revised = row.revisedBlock?.text ?? "No matching block";
  const tags: SemanticTag[] =
    row.semanticTags.length > 0 ? row.semanticTags : ["context_aligned"];

  return {
    rowId: row.id,
    originalFullBlock: original,
    revisedFullBlock: revised,
    primaryChange: row.primaryChange,
    semanticTags: tags,
    explanation:
      row.explanation ??
      `This ${semanticBlockTypeForRow(row)} block is classified as ${row.primaryChange}.`,
    whyItMatters:
      row.whyItMatters ??
      "This helps decide whether the revised answer preserves the intended meaning.",
    triggeredBy: row.triggeredBy,
    risk: row.risk,
    contextImpact:
      row.contextImpact ??
      "Future local context should preserve the accepted version of this change.",
    confidence: row.confidence
  };
}

export function createSemanticDifferenceMapFromTexts({
  id,
  documentId,
  anchorId,
  originalText,
  revisedText,
  localQuestion,
  createdAt = new Date().toISOString()
}: {
  id: string;
  documentId: string;
  anchorId: string;
  originalText: string;
  revisedText: string;
  localQuestion?: string;
  createdAt?: string;
}): SemanticDifferenceMap {
  const softened =
    /\b(will|must|always|never|free|replace)\b/i.test(originalText) &&
    /\b(can|may|might|could|some|parts?|routine)\b/i.test(revisedText);
  const exampleAdded =
    revisedText.length > originalText.length &&
    /\b(for example|such as|including|e\.g\.|examples?)\b/i.test(revisedText);
  const tags: SemanticTag[] = [
    ...(softened ? ["claim_softened", "scope_narrowed", "tone_more_cautious"] as const : []),
    ...(exampleAdded ? ["example_added"] as const : []),
    "context_aligned"
  ];
  const row: SemanticAlignmentRow = {
    id: `${id}-row-1`,
    blockType: "claim",
    originalBlock: {
      id: `${id}-original-1`,
      blockType: "claim",
      text: originalText,
      preview: shortText(originalText)
    },
    revisedBlock: {
      id: `${id}-revised-1`,
      blockType: "claim",
      text: revisedText,
      preview: shortText(revisedText)
    },
    originalIndex: 1,
    revisedIndex: 1,
    alignmentType: "one_to_one",
    primaryChange: originalText === revisedText ? "unchanged" : "rewritten",
    semanticTags: tags,
    importance: softened || exampleAdded ? "high" : "medium",
    risk: "low",
    triggeredBy: localQuestion?.trim() ? "user_question" : "llm_inference",
    shortReason: localQuestion?.trim()
      ? "The revised text responds to the local question."
      : "The revised text changes the selected original passage.",
    explanation:
      "The revised version keeps the selected passage as the comparison target while changing wording, scope, or support.",
    whyItMatters:
      "This helps the user review whether the revised answer should replace or inform the original text.",
    contextImpact:
      "Future local answers should use this revised wording only if the user accepts the change.",
    confidence: "medium"
  };
  const rows = [row];

  return {
    id,
    documentId,
    anchorId,
    originalText,
    revisedText,
    overview: {
      mainSummary:
        "The revised answer changes the selected original passage and should be reviewed before merging.",
      meaningEffect: meaningEffectFromRows(rows),
      riskLevel: overallRiskFromRows(rows),
      counts: countsFromRows(rows)
    },
    rows,
    createdAt
  };
}

export function semanticMapToLayeredComparisonBoard(
  map: SemanticDifferenceMap
): LayeredComparisonBoard {
  return {
    board_id: map.id,
    original_answer_id: `original-${map.anchorId}`,
    revised_answer_id: `revised-${map.anchorId}`,
    summary: {
      overall_summary: map.overview.mainSummary,
      recommended_action:
        map.overview.riskLevel === "high" ? "manual_review" : "prefer_revised"
    },
    levels: [
      {
        level_id: `${map.id}-semantic-alignment`,
        level_name: "key_decisions",
        display_title: "Semantic Alignment",
        rows: map.rows.map((row) => ({
          row_id: row.id,
          shared_topic:
            row.originalBlock?.blockType ??
            row.revisedBlock?.blockType ??
            "semantic block",
          original: row.originalBlock
            ? {
                title: row.originalBlock.blockType,
                short_summary: row.originalBlock.preview,
                full_text: row.originalBlock.text
              }
            : null,
          revised: row.revisedBlock
            ? {
                title: row.revisedBlock.blockType,
                short_summary: row.revisedBlock.preview,
                full_text: row.revisedBlock.text
              }
            : null,
          difference: boardDifferenceFromPrimaryChange(
            row.primaryChange,
            row.semanticTags
          ),
          importance: boardImportanceFromSemantic(row.importance),
          short_explanation:
            row.shortReason ??
            `${row.primaryChange} ${semanticBlockTypeForRow(row)} block`
        }))
      }
    ]
  };
}

export function semanticMapFromLayeredComparisonBoard({
  board,
  documentId,
  anchorId,
  originalText,
  revisedText,
  createdAt = new Date().toISOString()
}: {
  board: LayeredComparisonBoard;
  documentId: string;
  anchorId: string;
  originalText?: string;
  revisedText?: string;
  createdAt?: string;
}): SemanticDifferenceMap {
  const rows: SemanticAlignmentRow[] = board.levels.flatMap((level) =>
    level.rows.map((row, index) => {
      const primaryChange: SemanticPrimaryChange =
        row.difference === "added"
          ? "added"
          : row.difference === "removed"
            ? "removed"
            : row.difference === "same"
              ? "unchanged"
              : "rewritten";
      const semanticTags: SemanticTag[] = [
        ...(row.difference === "refined" ? ["wording_more_precise"] as const : []),
        ...(row.difference === "expanded" ? ["scope_expanded"] as const : []),
        ...(row.difference === "reduced" ? ["scope_narrowed"] as const : []),
        ...(row.difference === "conflict" ? ["risk_introduced"] as const : [])
      ];

      return {
        id: row.row_id,
        blockType: "other",
        originalBlock: row.original
          ? {
              id: `${row.row_id}-original`,
              blockType: "other",
              text: row.original.full_text ?? row.original.short_summary,
              preview: row.original.short_summary
            }
          : undefined,
        revisedBlock: row.revised
          ? {
              id: `${row.row_id}-revised`,
              blockType: "other",
              text: row.revised.full_text ?? row.revised.short_summary,
              preview: row.revised.short_summary
            }
          : undefined,
        originalIndex: row.original ? index + 1 : undefined,
        revisedIndex: row.revised ? index + 1 : undefined,
        alignmentType:
          row.difference === "added"
            ? "added_only"
            : row.difference === "removed"
              ? "removed_only"
              : "one_to_one",
        primaryChange,
        semanticTags,
        importance: row.importance,
        risk: row.difference === "conflict" ? "high" : "low",
        triggeredBy: "llm_inference",
        shortReason: row.short_explanation,
        explanation: row.short_explanation,
        whyItMatters:
          "This row identifies how one semantic block changed between the original and revised answer.",
        contextImpact:
          "Review this change before using it as future context.",
        confidence: "medium"
      };
    })
  );

  return {
    id: board.board_id,
    documentId,
    anchorId,
    originalText: originalText ?? "",
    revisedText: revisedText ?? "",
    overview: {
      mainSummary: board.summary.overall_summary,
      meaningEffect: meaningEffectFromRows(rows),
      riskLevel: overallRiskFromRows(rows),
      counts: countsFromRows(rows)
    },
    rows,
    createdAt
  };
}
