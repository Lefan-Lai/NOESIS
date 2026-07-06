"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  CornerUpLeft,
  Eye,
  GitBranch,
  ShieldAlert,
  RotateCcw,
  Split,
  Trash2,
  X
} from "lucide-react";
import type { VersionNode } from "@/types/version";
import type { HumanTimelineNode } from "./timelineHumanize";

type TimelineNodeProps = {
  node: VersionNode;
  view: HumanTimelineNode;
  current: boolean;
  left: number;
  top: number;
  onRevert: () => void;
  onViewContextImpact?: () => void;
  onPreviewDelete?: () => void;
  onOpenThread?: () => void;
  onStartNewLogic?: () => void;
  onMoveToPreviousLogic?: () => void;
  canMoveToPreviousLogic?: boolean;
};

function labelTone(view: HumanTimelineNode, current: boolean) {
  if (current) {
    return "text-atlasBlue";
  }

  if (view.statusTone === "red") {
    return "text-red-700";
  }

  if (view.statusTone === "amber") {
    return "text-amber-700";
  }

  if (view.statusTone === "green") {
    return "text-emerald-800";
  }

  if (view.statusTone === "purple") {
    return "text-purple-800";
  }

  if (view.statusTone === "slate") {
    return "text-slate-500";
  }

  return "text-blue-950";
}

function dotTone(view: HumanTimelineNode, current: boolean) {
  if (current) {
    return "border-atlasBlue ring-4 ring-blue-100";
  }

  if (view.statusTone === "green") {
    return "border-emerald-500";
  }

  if (view.statusTone === "purple") {
    return "border-purple-500";
  }

  if (view.statusTone === "amber") {
    return "border-amber-500";
  }

  if (view.statusTone === "red") {
    return "border-red-500";
  }

  if (view.statusTone === "slate") {
    return "border-slate-300";
  }

  return "border-atlasBlue";
}

export function TimelineNode({
  node,
  view,
  current,
  left,
  top,
  onRevert,
  onViewContextImpact,
  onPreviewDelete,
  onOpenThread,
  onStartNewLogic,
  onMoveToPreviousLogic,
  canMoveToPreviousLogic = false,
}: TimelineNodeProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formattedTime = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(node.createdAt));
  const label = view.folded ? "Folded branch" : view.shortTitle;
  const showDetails = !open && (hovered || pinned);

  useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    },
    []
  );

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }

    setHovered(true);
  };

  const handleMouseLeave = () => {
    if (pinned) {
      return;
    }

    leaveTimerRef.current = setTimeout(() => {
      setHovered(false);
    }, 120);
  };

  const togglePinnedDetails = () => {
    setOpen(false);
    setHovered(true);
    setPinned((value) => !value);
  };

  const handleNodeClick = () => {
    setPinned(false);
    setHovered(false);
    setOpen((value) => !value);
  };

  return (
    <div
      className={`absolute h-12 w-[168px] ${
        showDetails || open ? "z-[80]" : "z-20"
      }`}
      style={{ left, top }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(event) => {
        event.preventDefault();
        togglePinnedDetails();
      }}
    >
      <div className="relative h-full">
        <button
          onClick={handleNodeClick}
          className={`absolute left-0 top-[18px] z-10 h-4 w-4 rounded-full border-2 bg-white ${dotTone(
            view,
            current
          )}`}
          title={view.title}
          aria-label={view.title}
        />
        <button
          type="button"
          onClick={handleNodeClick}
          className={`absolute left-5 top-0 min-w-0 max-w-[140px] truncate rounded-sm bg-white/95 px-1 text-left text-[11px] font-bold leading-4 shadow-[0_0_0_1px_rgba(255,255,255,0.75)] underline-offset-2 hover:underline ${labelTone(
            view,
            current
          )} ${node.isActivePath ? "" : "opacity-70"}`}
          title={view.title}
        >
          {label}
        </button>
      </div>

      {showDetails && (
        <div className="absolute left-0 top-12 z-[90] w-72 rounded-lg border border-line bg-white p-3 text-left text-xs leading-5 text-slate-700 shadow-panel">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {pinned && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-atlasBlue">
                Pinned
              </span>
            )}
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-atlasBlue">
              {view.relationLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {view.statusLabel}
            </span>
            {current && (
              <span className="rounded-full bg-atlasBlue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Active
              </span>
            )}
            {view.isAnchorHub && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                {view.actionCount ?? 0} actions
              </span>
            )}
            {view.logicFocusLabel && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700">
                {view.logicFocusLabel}
              </span>
            )}
            {view.logicAssignmentSource === "user" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                user fixed
              </span>
            )}
            {view.isLogicStart && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                new logic
              </span>
            )}
            {view.resumedFromId && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-atlasBlue">
                resumed
              </span>
            )}
            {view.logicRelationType && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                {view.logicRelationType.replace(/_/g, " ")}
              </span>
            )}
            {pinned && (
              <button
                type="button"
                onClick={() => {
                  setPinned(false);
                  setHovered(false);
                }}
                className="ml-auto grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-ink"
                title="Close pinned details"
                aria-label="Close pinned details"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="font-bold text-ink">{view.title}</div>
          <div className="mt-1 text-slate-600">{view.subtitle}</div>
          {view.folded && view.foldReason && (
            <div className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
              Hidden summary: {view.foldReason}
            </div>
          )}
          {view.resumedFromId && (
            <div className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-atlasBlue">
              This step returns to an earlier logic focus instead of continuing the latest local message.
            </div>
          )}
          {view.logicRouterReason && (
            <div className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
              Logic router: {view.logicRouterReason}
              {typeof view.logicRouterConfidence === "number"
                ? ` (${Math.round(view.logicRouterConfidence * 100)}%)`
                : ""}
            </div>
          )}
          <div className="mt-2 text-[11px] font-semibold text-muted">
            {formattedTime}
          </div>
        </div>
      )}

      {open && (
        <div className="absolute left-0 top-12 z-[90] w-56 rounded-lg border border-line bg-white p-1 text-sm shadow-panel">
          <button
            onClick={() => {
              setOpen(false);
              setPinned(true);
              setHovered(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <ClipboardList size={15} />
            View Details
          </button>
          <button
            onClick={() => {
              onViewContextImpact?.();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <ShieldAlert size={15} />
            View Context Impact
          </button>
          <button
            onClick={() => {
              onRevert();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <RotateCcw size={15} />
            Preview Return
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
          {onStartNewLogic && (
            <button
              onClick={() => {
                onStartNewLogic();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
            >
              <Split size={15} />
              Start Separate Logic
            </button>
          )}
          {onMoveToPreviousLogic && (
            <button
              onClick={() => {
                if (!canMoveToPreviousLogic) {
                  return;
                }

                onMoveToPreviousLogic();
                setOpen(false);
              }}
              disabled={!canMoveToPreviousLogic}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
            >
              <CornerUpLeft size={15} />
              Move to Previous Logic
            </button>
          )}
          <button
            onClick={() => {
              onPreviewDelete?.();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-atlasRed hover:bg-red-50"
          >
            <Trash2 size={15} />
            Preview Delete
          </button>
        </div>
      )}
    </div>
  );
}
