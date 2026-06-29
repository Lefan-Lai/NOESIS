"use client";

import type { ComparisonEdge } from "@/types/comparison";

type ComparisonEdgeLayerProps = {
  edges: ComparisonEdge[];
};

export function ComparisonEdgeLayer({ edges }: ComparisonEdgeLayerProps) {
  return (
    <div className="flex h-full min-w-[128px] flex-col justify-around py-10">
      {edges.map((edge) => (
        <div key={edge.id} className="flex items-center gap-2">
          <span className="h-px flex-1 border-t-2 border-dashed border-atlasBlue" />
          <span className="max-w-[112px] text-center text-xs font-bold leading-5 text-atlasBlue">
            {edge.label}
          </span>
          <span className="h-px flex-1 border-t-2 border-dashed border-atlasBlue" />
        </div>
      ))}
    </div>
  );
}
