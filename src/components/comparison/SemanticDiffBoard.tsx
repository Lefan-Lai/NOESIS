"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ComparisonSlot,
  LayeredComparisonScaffold
} from "@/types/comparison";
import { sortComparisonSlots } from "@/lib/comparison/validateLayeredComparisonScaffold";
import {
  ComparisonFilterBar,
  type SemanticDiffFilter
} from "./ComparisonFilterBar";
import { ComparisonSummaryPanel } from "./ComparisonSummaryPanel";
import { ComparisonSection } from "./ComparisonSection";
import { ComparisonDetailPanel } from "./ComparisonDetailPanel";

const levelDisplay: Record<
  ComparisonSlot["level_role"],
  { title: string; description: string }
> = {
  root: {
    title: "Overview",
    description: "The overall goal or shared topic for the compared answers."
  },
  main_topic: {
    title: "Main topics",
    description: "The primary themes discussed by the original and revised answers."
  },
  claim_or_decision: {
    title: "Key decisions",
    description: "Core claims, judgments, and design choices."
  },
  support_or_detail: {
    title: "Details and support",
    description: "Reasons, examples, explanations, and implementation details."
  },
  consequence_risk_or_action: {
    title: "Risks, consequences, and actions",
    description: "Impacts, limitations, risks, and follow-up actions."
  }
};

const levelOrder: ComparisonSlot["level_role"][] = [
  "root",
  "main_topic",
  "claim_or_decision",
  "support_or_detail",
  "consequence_risk_or_action"
];

const orderGroupRank: Record<ComparisonSlot["order_group"], number> = {
  matched: 1,
  changed: 2,
  contradicted: 3,
  original_only: 4,
  revised_only: 5
};

const changedRelations: ComparisonSlot["relation"][] = [
  "rewritten",
  "refined",
  "expanded",
  "reduced",
  "replaced"
];

export function applySemanticDiffFilter(
  slots: ComparisonSlot[],
  filter: SemanticDiffFilter
) {
  return slots.filter((slot) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "changed") {
      return changedRelations.includes(slot.relation);
    }

    if (filter === "added") {
      return slot.relation === "revised_only";
    }

    if (filter === "removed") {
      return slot.relation === "original_only";
    }

    if (filter === "conflicts") {
      return slot.relation === "contradicted";
    }

    return slot.importance === "high";
  });
}

export function buildSemanticDiffFilterCounts(slots: ComparisonSlot[]) {
  return {
    all: slots.length,
    changed: applySemanticDiffFilter(slots, "changed").length,
    added: applySemanticDiffFilter(slots, "added").length,
    removed: applySemanticDiffFilter(slots, "removed").length,
    conflicts: applySemanticDiffFilter(slots, "conflicts").length,
    important: applySemanticDiffFilter(slots, "important").length
  };
}

function sortBoardSlots(slots: ComparisonSlot[]) {
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

function groupByLevelRole(slots: ComparisonSlot[]) {
  const groups = new Map<ComparisonSlot["level_role"], ComparisonSlot[]>();

  for (const slot of slots) {
    const group = groups.get(slot.level_role) ?? [];
    group.push(slot);
    groups.set(slot.level_role, group);
  }

  return levelOrder
    .map((levelRole) => ({
      levelRole,
      slots: sortBoardSlots(groups.get(levelRole) ?? [])
    }))
    .filter((section) => section.slots.length > 0);
}

type SemanticDiffBoardProps = {
  scaffold: LayeredComparisonScaffold;
};

export function SemanticDiffBoard({ scaffold }: SemanticDiffBoardProps) {
  const slots = useMemo(() => sortComparisonSlots(scaffold.slots), [scaffold]);
  const [filter, setFilter] = useState<SemanticDiffFilter>("all");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    scaffold.root_slot_id
  );
  const counts = useMemo(() => buildSemanticDiffFilterCounts(slots), [slots]);
  const visibleSlots = useMemo(
    () => applySemanticDiffFilter(slots, filter),
    [filter, slots]
  );
  const sections = useMemo(() => groupByLevelRole(visibleSlots), [visibleSlots]);
  const selectedSlot =
    slots.find((slot) => slot.slot_id === selectedSlotId) ?? visibleSlots[0];

  useEffect(() => {
    setFilter("all");
    setSelectedSlotId(scaffold.root_slot_id);
  }, [scaffold.comparison_id, scaffold.root_slot_id]);

  return (
    <div className="space-y-4">
      <ComparisonSummaryPanel summary={scaffold.summary} />
      <ComparisonFilterBar
        activeFilter={filter}
        counts={counts}
        onFilterChange={(nextFilter) => {
          setFilter(nextFilter);
          const nextVisible = applySemanticDiffFilter(slots, nextFilter);
          setSelectedSlotId(nextVisible[0]?.slot_id ?? null);
        }}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {sections.length > 0 ? (
            sections.map((section) => {
              const display = levelDisplay[section.levelRole];

              return (
                <ComparisonSection
                  key={section.levelRole}
                  title={display.title}
                  description={display.description}
                  slots={section.slots}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={setSelectedSlotId}
                />
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
              No comparison slots match this filter.
            </div>
          )}
        </div>

        <ComparisonDetailPanel
          slot={selectedSlot}
          recommendedAction={scaffold.summary.recommended_action}
        />
      </div>
    </div>
  );
}
