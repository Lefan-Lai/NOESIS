import type {
  ComparisonDifference,
  ComparisonImportance,
  ComparisonLevel,
  LayeredComparisonBoard
} from "@/types/comparison";

export const boardLevelOrder: ComparisonLevel["level_name"][] = [
  "main_topics",
  "key_decisions",
  "details_implementation",
  "risks_actions"
];

export const boardDifferences: ComparisonDifference[] = [
  "same",
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced",
  "added",
  "removed",
  "conflict"
];

const boardImportance: ComparisonImportance[] = ["low", "medium", "high"];

const twoSidedDifferences: ComparisonDifference[] = [
  "same",
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced",
  "conflict"
];

const forbiddenGeneratedKeys = new Set([
  "coordinates",
  "coordinate",
  "x",
  "y",
  "svg",
  "react",
  "component",
  "css",
  "layout",
  "node",
  "nodes",
  "edge",
  "edges",
  "link",
  "links",
  "tree",
  "graph"
]);

export type BoardValidationResult = {
  valid: boolean;
  errors: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function scanForbiddenKeys(value: unknown, path: string, errors: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`, errors));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();

    if (forbiddenGeneratedKeys.has(normalizedKey)) {
      errors.push(`${path}.${key}: board JSON must not include ${key}.`);
    }

    scanForbiddenKeys(nestedValue, `${path}.${key}`, errors);
  }
}

export function sortBoardLevels(levels: ComparisonLevel[]) {
  return [...levels].sort((a, b) => {
    const levelDiff =
      boardLevelOrder.indexOf(a.level_name) -
      boardLevelOrder.indexOf(b.level_name);

    if (levelDiff !== 0) {
      return levelDiff;
    }

    return a.display_title.localeCompare(b.display_title);
  });
}

export function validateLayeredComparisonBoard(
  board: LayeredComparisonBoard
): BoardValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(board)) {
    return {
      valid: false,
      errors: ["Board is not an object."]
    };
  }

  scanForbiddenKeys(board, "board", errors);

  if (!hasText(board.board_id)) {
    errors.push("board_id is required.");
  }

  if (!hasText(board.original_answer_id)) {
    errors.push("original_answer_id is required.");
  }

  if (!hasText(board.revised_answer_id)) {
    errors.push("revised_answer_id is required.");
  }

  if (!isPlainObject(board.summary)) {
    errors.push("summary is required.");
  } else {
    if (!hasText(board.summary.overall_summary)) {
      errors.push("summary.overall_summary is required.");
    }

    if (
      ![
        "keep_original",
        "prefer_revised",
        "merge_both",
        "manual_review"
      ].includes(board.summary.recommended_action)
    ) {
      errors.push("summary.recommended_action is invalid.");
    }
  }

  if (!Array.isArray(board.levels)) {
    errors.push("levels must be an array.");
  } else if (board.levels.length === 0) {
    errors.push("levels must include at least one non-empty level.");
  } else {
    for (const [levelIndex, level] of board.levels.entries()) {
      const levelPath = `levels[${levelIndex}]`;

      if (!isPlainObject(level)) {
        errors.push(`${levelPath} must be an object.`);
        continue;
      }

      if (!hasText(level.level_id)) {
        errors.push(`${levelPath}.level_id is required.`);
      }

      if (!boardLevelOrder.includes(level.level_name)) {
        errors.push(`${levelPath}.level_name is invalid.`);
      }

      if (!hasText(level.display_title)) {
        errors.push(`${levelPath}.display_title is required.`);
      }

      if (!Array.isArray(level.rows) || level.rows.length === 0) {
        errors.push(`${levelPath}.rows must be a non-empty array.`);
        continue;
      }

      for (const [rowIndex, row] of level.rows.entries()) {
        const rowPath = `${levelPath}.rows[${rowIndex}]`;

        if (!isPlainObject(row)) {
          errors.push(`${rowPath} must be an object.`);
          continue;
        }

        if (!hasText(row.row_id)) {
          errors.push(`${rowPath}.row_id is required.`);
        }

        if (!hasText(row.shared_topic)) {
          errors.push(`${rowPath}.shared_topic is required.`);
        }

        if (!boardDifferences.includes(row.difference)) {
          errors.push(`${rowPath}.difference is invalid.`);
        }

        if (!boardImportance.includes(row.importance)) {
          errors.push(`${rowPath}.importance is invalid.`);
        }

        if (!hasText(row.short_explanation)) {
          errors.push(`${rowPath}.short_explanation is required.`);
        }

        const hasOriginal = row.original !== null && row.original !== undefined;
        const hasRevised = row.revised !== null && row.revised !== undefined;

        if (!hasOriginal && !hasRevised) {
          errors.push(`${rowPath}: original and revised cannot both be null.`);
        }

        if (row.difference === "added" && (hasOriginal || !hasRevised)) {
          errors.push(`${rowPath}: added rows must have original null and revised present.`);
        }

        if (row.difference === "removed" && (!hasOriginal || hasRevised)) {
          errors.push(`${rowPath}: removed rows must have original present and revised null.`);
        }

        if (twoSidedDifferences.includes(row.difference) && (!hasOriginal || !hasRevised)) {
          errors.push(`${rowPath}: ${row.difference} rows must include both original and revised.`);
        }

        for (const [sideName, side] of [
          ["original", row.original],
          ["revised", row.revised]
        ] as const) {
          if (side === null || side === undefined) {
            continue;
          }

          if (!isPlainObject(side)) {
            errors.push(`${rowPath}.${sideName} must be an object or null.`);
            continue;
          }

          if (!hasText(side.title)) {
            errors.push(`${rowPath}.${sideName}.title is required.`);
          }

          if (!hasText(side.short_summary)) {
            errors.push(`${rowPath}.${sideName}.short_summary is required.`);
          }

          if (side.full_text !== undefined && typeof side.full_text !== "string") {
            errors.push(`${rowPath}.${sideName}.full_text must be a string when present.`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
