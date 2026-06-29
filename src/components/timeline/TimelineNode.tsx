"use client";

import { useState } from "react";
import {
  Eye,
  FileQuestion,
  GitBranch,
  MoreHorizontal,
  RotateCcw,
  Trash2
} from "lucide-react";
import type { VersionNode } from "@/types/version";

type TimelineNodeProps = {
  node: VersionNode;
  current: boolean;
  onRevert: () => void;
  onOpenThread?: () => void;
  onDeleteAnswer?: () => void;
};

function nodeTone(node: VersionNode) {
  if (node.nodeType === "deleted") {
    return "border-red-900 text-red-900";
  }

  if (node.nodeType === "discarded") {
    return "border-atlasRed text-atlasRed";
  }

  if (node.nodeType === "branch_created" || node.nodeType === "merged") {
    return "border-atlasGreen text-atlasGreen";
  }

  return "border-atlasBlue text-atlasBlue";
}

export function TimelineNode({
  node,
  current,
  onRevert,
  onOpenThread,
  onDeleteAnswer
}: TimelineNodeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-w-[150px] flex-col items-center">
      <div className="mb-1 text-center text-xs leading-4 text-slate-600">
        {new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(node.createdAt))}
      </div>
      <button
        onClick={() => setOpen((value) => !value)}
        className={`relative z-10 h-4 w-4 rounded-full border-2 bg-white ${
          current
            ? "border-atlasBlue ring-4 ring-blue-100"
            : node.isActivePath
              ? "border-atlasBlue"
              : "border-slate-300"
        }`}
        title={node.label}
        aria-label={node.label}
      />
      <div
        className={`mt-8 flex min-h-[58px] w-[128px] items-center justify-center rounded-lg border bg-white px-2 py-2 text-center text-xs font-semibold leading-4 shadow-sm ${nodeTone(
          node
        )} ${node.isActivePath ? "" : "border-dashed opacity-70"}`}
      >
        {node.nodeType === "branch_created" && <GitBranch size={16} className="mr-1" />}
        {node.nodeType === "deleted" && <Trash2 size={16} className="mr-1" />}
        {node.nodeType === "local_question_asked" && (
          <FileQuestion size={16} className="mr-1" />
        )}
        {node.label}
      </div>

      {open && (
        <div className="absolute left-1/2 top-10 z-20 w-44 -translate-x-1/2 rounded-lg border border-line bg-white p-1 text-sm shadow-panel">
          <button
            onClick={() => {
              onRevert();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <RotateCcw size={15} />
            Revert to This Node
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50">
            <Eye size={15} />
            View Diff
          </button>
          <button
            onClick={() => {
              onOpenThread?.();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <GitBranch size={15} />
            Open Related Thread
          </button>
          <button
            onClick={() => {
              onDeleteAnswer?.();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-atlasRed hover:bg-red-50"
          >
            <MoreHorizontal size={15} />
            Delete Related Answer
          </button>
        </div>
      )}
    </div>
  );
}
