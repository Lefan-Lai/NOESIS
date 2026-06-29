"use client";

import type { ComparisonSlot } from "@/types/comparison";
import { ComparisonCard } from "./ComparisonCard";

type ComparisonSectionProps = {
  title: string;
  description: string;
  slots: ComparisonSlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
};

export function ComparisonSection({
  title,
  description,
  slots,
  selectedSlotId,
  onSelectSlot
}: ComparisonSectionProps) {
  if (slots.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {slots.map((slot) => (
          <ComparisonCard
            key={slot.slot_id}
            slot={slot}
            selected={selectedSlotId === slot.slot_id}
            onSelect={onSelectSlot}
          />
        ))}
      </div>
    </section>
  );
}
