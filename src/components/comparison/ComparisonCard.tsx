"use client";

import { Eye } from "lucide-react";
import type { ComparisonSlot, ComparisonSlotNode } from "@/types/comparison";
import { RelationBadge } from "./RelationBadge";

function NodeSummary({
  label,
  node,
  emptyText
}: {
  label: string;
  node?: ComparisonSlotNode;
  emptyText: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-slate-50/70 p-3">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
      {node ? (
        <>
          <div className="line-clamp-1 text-sm font-bold text-ink">
            {node.title}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-700">
            {node.summary}
          </p>
        </>
      ) : (
        <div className="text-sm font-semibold leading-5 text-muted">
          {emptyText}
        </div>
      )}
    </div>
  );
}

type ComparisonCardProps = {
  slot: ComparisonSlot;
  selected: boolean;
  onSelect: (slotId: string) => void;
};

export function ComparisonCard({
  slot,
  selected,
  onSelect
}: ComparisonCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.slot_id)}
      className={`block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 ${
        selected ? "border-atlasBlue ring-2 ring-blue-100" : "border-line"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 text-sm font-bold text-ink">
          {slot.shared_topic}
        </h3>
        <RelationBadge relation={slot.relation} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <NodeSummary
          label="Original"
          node={slot.original_node}
          emptyText="Not present in original"
        />
        <NodeSummary
          label="Revised"
          node={slot.revised_node}
          emptyText="Not present in revised"
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3 border-t border-line pt-3">
        <p className="line-clamp-2 text-sm leading-5 text-slate-700">
          {slot.short_comparison}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-600">
          <Eye size={13} />
          View detail
        </span>
      </div>
    </button>
  );
}
