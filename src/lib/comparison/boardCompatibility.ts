import type {
  ComparisonDifference,
  ComparisonLevel,
  ComparisonRow,
  ComparisonSlot,
  ComparisonSummary,
  LayeredComparisonBoard,
  LayeredComparisonScaffold
} from "@/types/comparison";

const levelRoleByName: Record<
  ComparisonLevel["level_name"],
  {
    levelIndex: ComparisonSlot["level_index"];
    levelRole: ComparisonSlot["level_role"];
  }
> = {
  main_topics: {
    levelIndex: 1,
    levelRole: "main_topic"
  },
  key_decisions: {
    levelIndex: 2,
    levelRole: "claim_or_decision"
  },
  details_implementation: {
    levelIndex: 3,
    levelRole: "support_or_detail"
  },
  risks_actions: {
    levelIndex: 4,
    levelRole: "consequence_risk_or_action"
  }
};

const levelNameByRole: Record<
  Exclude<ComparisonSlot["level_role"], "root">,
  ComparisonLevel["level_name"]
> = {
  main_topic: "main_topics",
  claim_or_decision: "key_decisions",
  support_or_detail: "details_implementation",
  consequence_risk_or_action: "risks_actions"
};

const displayTitleByLevelName: Record<ComparisonLevel["level_name"], string> = {
  main_topics: "Level 1: Main Topics",
  key_decisions: "Level 2: Key Decisions",
  details_implementation: "Level 3: Details / Implementation",
  risks_actions: "Level 4: Risks / Actions"
};

export function relationFromBoardDifference(
  difference: ComparisonRow["difference"]
): ComparisonSlot["relation"] {
  if (difference === "added") {
    return "revised_only";
  }

  if (difference === "removed") {
    return "original_only";
  }

  if (difference === "conflict") {
    return "contradicted";
  }

  return difference;
}

function orderGroupFromBoardDifference(
  difference: ComparisonRow["difference"]
): ComparisonSlot["order_group"] {
  if (difference === "same") {
    return "matched";
  }

  if (difference === "added") {
    return "revised_only";
  }

  if (difference === "removed") {
    return "original_only";
  }

  if (difference === "conflict") {
    return "contradicted";
  }

  return "changed";
}

function differenceFromScaffoldRelation(
  relation: ComparisonSlot["relation"]
): ComparisonDifference {
  if (relation === "original_only") {
    return "removed";
  }

  if (relation === "revised_only") {
    return "added";
  }

  if (relation === "contradicted") {
    return "conflict";
  }

  return relation;
}

function boardSummaryToLegacySummary(
  board: LayeredComparisonBoard
): ComparisonSummary {
  const differences = board.levels.flatMap((level) =>
    level.rows
      .filter((row) => row.difference !== "same")
      .map((row) => `${row.shared_topic}: ${row.short_explanation}`)
  );
  const risks = board.levels
    .filter((level) => level.level_name === "risks_actions")
    .flatMap((level) => level.rows.map((row) => row.short_explanation));

  return {
    overall_summary: board.summary.overall_summary,
    main_similarities: board.levels.flatMap((level) =>
      level.rows
        .filter((row) => row.difference === "same")
        .map((row) => row.shared_topic)
    ),
    main_differences: differences,
    main_risks: risks,
    recommended_action: board.summary.recommended_action
  };
}

export function boardToLayeredComparisonScaffold(
  board: LayeredComparisonBoard
): LayeredComparisonScaffold {
  const rootSlotId = `${board.board_id}-root`;
  const slots: ComparisonSlot[] = [
    {
      slot_id: rootSlotId,
      parent_slot_id: null,
      level_index: 0,
      level_role: "root",
      shared_topic: "Overall comparison",
      original_node: {
        node_id: `${rootSlotId}-original`,
        title: "Original answer",
        summary: board.summary.overall_summary,
        source_text: board.summary.overall_summary
      },
      revised_node: {
        node_id: `${rootSlotId}-revised`,
        title: "Revised answer",
        summary: board.summary.overall_summary,
        source_text: board.summary.overall_summary
      },
      relation: "rewritten",
      short_comparison: board.summary.overall_summary,
      order_group: "changed",
      order_index: 0,
      importance: "medium"
    }
  ];
  const lastSlotByLevel = new Map<number, string>([[0, rootSlotId]]);

  for (const level of board.levels) {
    const levelMeta = levelRoleByName[level.level_name];

    for (const [rowIndex, row] of level.rows.entries()) {
      const parentSlotId =
        lastSlotByLevel.get(levelMeta.levelIndex - 1) ?? rootSlotId;
      const slotId = `${board.board_id}-${level.level_name}-${row.row_id}`;

      slots.push({
        slot_id: slotId,
        parent_slot_id: parentSlotId,
        level_index: levelMeta.levelIndex,
        level_role: levelMeta.levelRole,
        shared_topic: row.shared_topic,
        original_node: row.original
          ? {
              node_id: `${slotId}-original`,
              title: row.original.title,
              summary: row.original.short_summary,
              source_text: row.original.full_text ?? row.original.short_summary
            }
          : undefined,
        revised_node: row.revised
          ? {
              node_id: `${slotId}-revised`,
              title: row.revised.title,
              summary: row.revised.short_summary,
              source_text: row.revised.full_text ?? row.revised.short_summary
            }
          : undefined,
        relation: relationFromBoardDifference(row.difference),
        short_comparison: row.short_explanation,
        order_group: orderGroupFromBoardDifference(row.difference),
        order_index: rowIndex,
        importance: row.importance
      });

      lastSlotByLevel.set(levelMeta.levelIndex, slotId);
    }
  }

  return {
    comparison_id: board.board_id,
    original_answer_id: board.original_answer_id,
    revised_answer_id: board.revised_answer_id,
    root_slot_id: rootSlotId,
    slots,
    summary: boardSummaryToLegacySummary(board)
  };
}

export function scaffoldToLayeredComparisonBoard(
  scaffold: LayeredComparisonScaffold
): LayeredComparisonBoard {
  const levelsByName = new Map<ComparisonLevel["level_name"], ComparisonRow[]>();

  for (const slot of scaffold.slots) {
    if (slot.level_role === "root") {
      continue;
    }

    const levelName = levelNameByRole[slot.level_role];
    const rows = levelsByName.get(levelName) ?? [];

    rows.push({
      row_id: slot.slot_id,
      shared_topic: slot.shared_topic,
      original: slot.original_node
        ? {
            title: slot.original_node.title,
            short_summary: slot.original_node.summary,
            full_text: slot.original_node.source_text
          }
        : null,
      revised: slot.revised_node
        ? {
            title: slot.revised_node.title,
            short_summary: slot.revised_node.summary,
            full_text: slot.revised_node.source_text
          }
        : null,
      difference: differenceFromScaffoldRelation(slot.relation),
      importance:
        slot.importance ??
        (slot.relation === "contradicted" || slot.relation === "replaced"
          ? "high"
          : "medium"),
      short_explanation: slot.short_comparison
    });

    levelsByName.set(levelName, rows);
  }

  const levelNames: ComparisonLevel["level_name"][] = [
    "main_topics",
    "key_decisions",
    "details_implementation",
    "risks_actions"
  ];
  const levels: ComparisonLevel[] = levelNames.flatMap((levelName) => {
    const rows = levelsByName.get(levelName) ?? [];

    if (rows.length === 0) {
      return [];
    }

    return [
      {
        level_id: `${scaffold.comparison_id}-${levelName}`,
        level_name: levelName,
        display_title: displayTitleByLevelName[levelName],
        rows
      }
    ];
  });

  return {
    board_id: scaffold.comparison_id,
    original_answer_id: scaffold.original_answer_id,
    revised_answer_id: scaffold.revised_answer_id,
    summary: {
      overall_summary: scaffold.summary.overall_summary,
      recommended_action: scaffold.summary.recommended_action
    },
    levels
  };
}
