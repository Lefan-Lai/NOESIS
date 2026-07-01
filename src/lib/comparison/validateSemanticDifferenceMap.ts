import type {
  SemanticAlignmentRow,
  SemanticAlignmentType,
  SemanticBlock,
  SemanticBlockType,
  SemanticConfidence,
  SemanticDifferenceMap,
  SemanticMeaningEffect,
  SemanticPrimaryChange,
  SemanticRiskLevel,
  SemanticTag,
  SemanticTriggeredBy
} from "@/types/comparison";

export type SemanticMapValidationResult = {
  valid: boolean;
  errors: string[];
};

export const semanticBlockTypes: SemanticBlockType[] = [
  "claim",
  "reason",
  "evidence",
  "example",
  "definition",
  "limitation",
  "method",
  "result",
  "interpretation",
  "conclusion",
  "transition",
  "other"
];

export const semanticAlignmentTypes: SemanticAlignmentType[] = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "added_only",
  "removed_only",
  "moved",
  "unmatched"
];

export const semanticPrimaryChanges: SemanticPrimaryChange[] = [
  "unchanged",
  "added",
  "removed",
  "rewritten",
  "moved",
  "split",
  "merged"
];

export const semanticTags: SemanticTag[] = [
  "claim_changed",
  "claim_softened",
  "claim_strengthened",
  "scope_expanded",
  "scope_narrowed",
  "evidence_added",
  "evidence_removed",
  "example_added",
  "example_removed",
  "limitation_added",
  "definition_added",
  "logic_clarified",
  "tone_more_cautious",
  "tone_more_confident",
  "tone_more_academic",
  "wording_simplified",
  "wording_more_precise",
  "structure_reordered",
  "risk_introduced",
  "context_aligned"
];

const meaningEffects: SemanticMeaningEffect[] = [
  "meaning_preserved",
  "meaning_narrowed",
  "meaning_expanded",
  "meaning_shifted",
  "meaning_unclear"
];

const riskLevels: SemanticRiskLevel[] = ["none", "low", "medium", "high"];
const importanceLevels: SemanticAlignmentRow["importance"][] = [
  "critical",
  "high",
  "medium",
  "low"
];
const triggeredByValues: SemanticTriggeredBy[] = [
  "user_question",
  "annotation",
  "llm_inference",
  "context_alignment",
  "unknown"
];
const confidenceValues: SemanticConfidence[] = ["high", "medium", "low"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBlock(
  block: SemanticBlock | undefined,
  path: string,
  errors: string[]
) {
  if (!block) {
    return;
  }

  if (!isPlainObject(block)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (!hasText(block.id)) {
    errors.push(`${path}.id is required.`);
  }

  if (!semanticBlockTypes.includes(block.blockType)) {
    errors.push(`${path}.blockType is invalid.`);
  }

  if (!hasText(block.text)) {
    errors.push(`${path}.text is required.`);
  }

  if (!hasText(block.preview)) {
    errors.push(`${path}.preview is required.`);
  }
}

export function validateSemanticDifferenceMap(
  map: SemanticDifferenceMap
): SemanticMapValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(map)) {
    return {
      valid: false,
      errors: ["Semantic map is not an object."]
    };
  }

  if (!hasText(map.id)) {
    errors.push("id is required.");
  }

  if (!hasText(map.documentId)) {
    errors.push("documentId is required.");
  }

  if (!hasText(map.anchorId)) {
    errors.push("anchorId is required.");
  }

  if (!hasText(map.originalText)) {
    errors.push("originalText is required.");
  }

  if (!hasText(map.revisedText)) {
    errors.push("revisedText is required.");
  }

  if (!isPlainObject(map.overview)) {
    errors.push("overview is required.");
  } else {
    if (!hasText(map.overview.mainSummary)) {
      errors.push("overview.mainSummary is required.");
    }

    if (!meaningEffects.includes(map.overview.meaningEffect)) {
      errors.push("overview.meaningEffect is invalid.");
    }

    if (!riskLevels.includes(map.overview.riskLevel)) {
      errors.push("overview.riskLevel is invalid.");
    }

    if (!isPlainObject(map.overview.counts)) {
      errors.push("overview.counts is required.");
    } else {
      for (const key of [
        "added",
        "removed",
        "rewritten",
        "moved",
        "claimChanged",
        "toneChanged"
      ] as const) {
        if (typeof map.overview.counts[key] !== "number") {
          errors.push(`overview.counts.${key} must be a number.`);
        }
      }
    }
  }

  if (!Array.isArray(map.rows)) {
    errors.push("rows must be an array.");
  } else if (map.rows.length === 0) {
    errors.push("rows must include at least one row.");
  } else {
    map.rows.forEach((row, index) => {
      const path = `rows[${index}]`;

      if (!isPlainObject(row)) {
        errors.push(`${path} must be an object.`);
        return;
      }

      if (!hasText(row.id)) {
        errors.push(`${path}.id is required.`);
      }

      validateBlock(row.originalBlock, `${path}.originalBlock`, errors);
      validateBlock(row.revisedBlock, `${path}.revisedBlock`, errors);

      const blockType =
        row.blockType ?? row.originalBlock?.blockType ?? row.revisedBlock?.blockType;

      if (!blockType || !semanticBlockTypes.includes(blockType)) {
        errors.push(`${path}.blockType is invalid.`);
      }

      if (!row.originalBlock && !row.revisedBlock) {
        errors.push(`${path}: originalBlock and revisedBlock cannot both be empty.`);
      }

      if (!semanticAlignmentTypes.includes(row.alignmentType)) {
        errors.push(`${path}.alignmentType is invalid.`);
      }

      if (!semanticPrimaryChanges.includes(row.primaryChange)) {
        errors.push(`${path}.primaryChange is invalid.`);
      }

      if (!Array.isArray(row.semanticTags)) {
        errors.push(`${path}.semanticTags must be an array.`);
      } else {
        row.semanticTags.forEach((tag, tagIndex) => {
          if (!semanticTags.includes(tag)) {
            errors.push(`${path}.semanticTags[${tagIndex}] is invalid.`);
          }
        });
      }

      if (!importanceLevels.includes(row.importance)) {
        errors.push(`${path}.importance is invalid.`);
      }

      if (!riskLevels.includes(row.risk)) {
        errors.push(`${path}.risk is invalid.`);
      }

      if (!triggeredByValues.includes(row.triggeredBy)) {
        errors.push(`${path}.triggeredBy is invalid.`);
      }

      if (!confidenceValues.includes(row.confidence)) {
        errors.push(`${path}.confidence is invalid.`);
      }

      if (row.alignmentType === "added_only" && row.originalBlock) {
        errors.push(`${path}: added_only rows must not include originalBlock.`);
      }

      if (row.alignmentType === "removed_only" && row.revisedBlock) {
        errors.push(`${path}: removed_only rows must not include revisedBlock.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
