"use client";

import type { ArgumentTree } from "@/types/comparison";
import { ArgumentNodeCard } from "./ArgumentNodeCard";

type RevisedClaimTreeProps = {
  tree: ArgumentTree;
};

export function RevisedClaimTree({ tree }: RevisedClaimTreeProps) {
  const nodes = [...tree.nodes].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5">
      {nodes.map((node, index) => (
        <div key={node.id} className="relative">
          {index > 0 && (
            <div className="absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-slate-400" />
          )}
          <ArgumentNodeCard node={node} />
        </div>
      ))}
    </div>
  );
}
