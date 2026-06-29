"use client";

import type { ArgumentNode } from "@/types/comparison";

type ArgumentNodeCardProps = {
  node: ArgumentNode;
};

const typeStyles: Record<ArgumentNode["nodeType"], string> = {
  claim: "border-atlasBlue text-atlasBlue bg-blue-50",
  reason: "border-atlasGreen text-green-800 bg-green-50",
  issue: "border-atlasOrange text-orange-900 bg-orange-50",
  evidence: "border-atlasOrange text-orange-900 bg-orange-50",
  evidence_gap: "border-atlasPurple text-purple-900 bg-purple-50",
  advantage: "border-atlasPurple text-purple-900 bg-purple-50"
};

export function ArgumentNodeCard({ node }: ArgumentNodeCardProps) {
  return (
    <div
      className={`min-h-[84px] rounded-lg border-2 px-4 py-3 text-center shadow-sm ${typeStyles[node.nodeType]}`}
    >
      <div className="mb-1 text-sm font-bold">{node.label}</div>
      <p className="text-sm leading-5 text-slate-800">{node.text}</p>
    </div>
  );
}
