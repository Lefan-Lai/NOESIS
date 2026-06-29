import type {
  ComparisonSlot,
  LayeredComparisonScaffold
} from "@/types/comparison";

const levelRoles: Record<number, ComparisonSlot["level_role"]> = {
  0: "root",
  1: "main_topic",
  2: "claim_or_decision",
  3: "support_or_detail",
  4: "consequence_risk_or_action"
};

const childrenLimits: Record<number, number> = {
  0: 6,
  1: 4,
  2: 3,
  3: 2,
  4: 0
};

const enforceChildLimits = false;

const orderGroupRank: Record<ComparisonSlot["order_group"], number> = {
  matched: 1,
  changed: 2,
  contradicted: 3,
  original_only: 4,
  revised_only: 5
};

const twoSidedRelations: ComparisonSlot["relation"][] = [
  "same",
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced",
  "contradicted"
];

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function sourceAppearsInAnswer(sourceText: string, answerText: string) {
  const source = compactText(sourceText);
  const answer = compactText(answerText);

  if (!source) {
    return false;
  }

  return answer.includes(source) || source.length < 20;
}

export type ScaffoldValidationResult = {
  valid: boolean;
  errors: string[];
};

export function sortComparisonSlots(slots: ComparisonSlot[]) {
  return [...slots].sort((a, b) => {
    if (a.level_index !== b.level_index) {
      return a.level_index - b.level_index;
    }

    const groupDiff = orderGroupRank[a.order_group] - orderGroupRank[b.order_group];

    if (groupDiff !== 0) {
      return groupDiff;
    }

    return a.order_index - b.order_index;
  });
}

export function validateLayeredComparisonScaffold({
  scaffold,
  originalText,
  revisedText
}: {
  scaffold: LayeredComparisonScaffold;
  originalText: string;
  revisedText: string;
}): ScaffoldValidationResult {
  const errors: string[] = [];

  if (!scaffold || typeof scaffold !== "object") {
    return {
      valid: false,
      errors: ["Scaffold is not an object."]
    };
  }

  const slots = Array.isArray(scaffold.slots) ? scaffold.slots : [];
  const slotsById = new Map(slots.map((slot) => [slot.slot_id, slot]));
  const rootSlots = slots.filter((slot) => slot.level_index === 0);

  if (rootSlots.length !== 1) {
    errors.push(`Expected exactly one root slot, received ${rootSlots.length}.`);
  }

  const rootSlot = rootSlots[0];

  if (rootSlot && rootSlot.parent_slot_id !== null) {
    errors.push("Root slot parent_slot_id must be null.");
  }

  if (rootSlot && scaffold.root_slot_id !== rootSlot.slot_id) {
    errors.push("root_slot_id must match the single level 0 slot.");
  }

  for (const slot of slots) {
    if (!slot.slot_id) {
      errors.push("A slot is missing slot_id.");
      continue;
    }

    if (!(slot.level_index in levelRoles)) {
      errors.push(`${slot.slot_id}: level_index must be between 0 and 4.`);
    }

    if (levelRoles[slot.level_index] !== slot.level_role) {
      errors.push(
        `${slot.slot_id}: level_role must be ${levelRoles[slot.level_index]}.`
      );
    }

    if (slot.level_index > 0) {
      const parent = slot.parent_slot_id
        ? slotsById.get(slot.parent_slot_id)
        : null;

      if (!parent) {
        errors.push(`${slot.slot_id}: parent_slot_id is missing or unknown.`);
      } else if (parent.level_index !== slot.level_index - 1) {
        errors.push(`${slot.slot_id}: slot jumps levels from its parent.`);
      }
    }

    if (slot.relation === "original_only") {
      if (!slot.original_node || slot.revised_node) {
        errors.push(`${slot.slot_id}: original_only must contain original_node only.`);
      }
    } else if (slot.relation === "revised_only") {
      if (!slot.revised_node || slot.original_node) {
        errors.push(`${slot.slot_id}: revised_only must contain revised_node only.`);
      }
    } else if (twoSidedRelations.includes(slot.relation)) {
      if (!slot.original_node || !slot.revised_node) {
        errors.push(`${slot.slot_id}: ${slot.relation} must contain both nodes.`);
      }
    }

    for (const side of ["original_node", "revised_node"] as const) {
      const node = slot[side];

      if (!node) {
        continue;
      }

      if (!node.title?.trim() || !node.summary?.trim() || !node.source_text?.trim()) {
        errors.push(`${slot.slot_id}: ${side} title, summary, and source_text are required.`);
      }

      const answerText = side === "original_node" ? originalText : revisedText;

      if (!sourceAppearsInAnswer(node.source_text, answerText)) {
        errors.push(`${slot.slot_id}: ${side}.source_text is not found in its answer.`);
      }
    }
  }

  if (enforceChildLimits) {
    const childCounts = new Map<string, number>();

    for (const slot of slots) {
      if (slot.parent_slot_id) {
        childCounts.set(
          slot.parent_slot_id,
          (childCounts.get(slot.parent_slot_id) ?? 0) + 1
        );
      }
    }

    for (const slot of slots) {
      const childCount = childCounts.get(slot.slot_id) ?? 0;
      const limit = childrenLimits[slot.level_index];

      if (childCount > limit) {
        errors.push(`${slot.slot_id}: has ${childCount} children, limit is ${limit}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
