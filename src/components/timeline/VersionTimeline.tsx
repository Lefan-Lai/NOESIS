"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { requestSourceFocus } from "@/lib/navigation/sourceLocator";
import type { VersionNode } from "@/types/version";
import { BranchLane } from "./BranchLane";
import { TimelineNode } from "./TimelineNode";
import {
  TimelineImpactDialog,
  type TimelineImpactMode,
  type TimelineImpactSummary
} from "./TimelineImpactDialog";
import {
  buildHumanTimeline,
  type HumanTimelineNode,
  type TimelineLane,
  type TimelineLaneId
} from "./timelineHumanize";

const SLOT_WIDTH = 208;
const LANE_HEIGHT = 82;
const STACK_OFFSET_Y = 26;
const GRAPH_PADDING_X = 204;
const GRAPH_PADDING_Y = 14;
const EDGE_FAN_GAP = 16;
const EDGE_FAN_LIMIT = 40;
const DOT_CENTER_X = 8;
const DOT_CENTER_Y = 26;
const LANE_NODE_TOP = 18;

type PositionedTimelineNode = {
  node: VersionNode;
  view: HumanTimelineNode;
  left: number;
  top: number;
  dotX: number;
  dotY: number;
};

type TimelineLaneLayout = {
  lane: TimelineLane;
  top: number;
  height: number;
};

type TimelineEdgeRoute = {
  key: string;
  parent: PositionedTimelineNode;
  child: PositionedTimelineNode;
  offset: number;
  targetOffset: number;
  laneChanged: boolean;
  stateChanged: boolean;
};

type VersionTimelineProps = {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

function edgeToneByView(view: HumanTimelineNode) {
  if (view.statusTone === "amber") {
    return "#d97706";
  }

  if (view.statusTone === "slate") {
    return "#94a3b8";
  }

  if (view.statusTone === "green") {
    return "#16a34a";
  }

  if (view.statusTone === "purple") {
    return "#7c3aed";
  }

  if (view.statusTone === "red") {
    return "#dc2626";
  }

  return "#2563eb";
}

function laneStateClasses(lane: TimelineLane) {
  if (lane.title.startsWith("Deleted")) {
    return {
      wrapper: "bg-red-50/60",
      label: "border-red-200 bg-red-50/95",
      title: "text-red-700",
      description: "text-red-600/80"
    };
  }

  if (lane.title.startsWith("Discarded")) {
    return {
      wrapper: "bg-amber-50/60",
      label: "border-amber-200 bg-amber-50/95",
      title: "text-amber-700",
      description: "text-amber-700/80"
    };
  }

  return {
    wrapper: "",
    label: "border-line bg-white/90",
    title: "text-slate-700",
    description: "text-muted"
  };
}

function clampEdgeOffset(value: number) {
  return Math.max(-EDGE_FAN_LIMIT, Math.min(EDGE_FAN_LIMIT, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function canAssignLogicNode(node: VersionNode) {
  return Boolean(
    node.relatedThreadId ||
      node.relatedBranchId ||
      (node.relatedAnchorId && node.nodeType !== "anchor_selected")
  );
}

function sourceMessageIdForVersionNode(node: VersionNode) {
  const answerPrefixes = ["v-created-", "v-main-answer-"];
  const answerPrefix = answerPrefixes.find((prefix) => node.id.startsWith(prefix));

  if (answerPrefix) {
    return `rev-message-assistant-${node.id.slice(answerPrefix.length)}`;
  }

  return undefined;
}

function edgePath(route: TimelineEdgeRoute) {
  const yFan = route.offset * 0.38;
  const targetFan = route.targetOffset * 0.28;
  const startX = route.parent.dotX + 12;
  const startY = route.parent.dotY + yFan;
  const endX = route.child.dotX - 12;
  const endY = route.child.dotY + targetFan;
  const dx = endX - startX;
  const dy = endY - startY;
  const forwardPull = clamp(Math.abs(dx) * 0.52 + Math.abs(dy) * 0.16, 54, 170);
  const verticalBias = route.laneChanged ? clamp(Math.abs(dy) * 0.14, 8, 30) : 0;

  if (dx >= -8) {
    return [
      `M ${startX} ${startY}`,
      `C ${startX + forwardPull} ${startY + yFan + verticalBias}`,
      `${endX - forwardPull * 0.55} ${endY - targetFan - verticalBias}`,
      `${endX} ${endY}`
    ].join(" ");
  }

  const loopPull = clamp(Math.abs(dx) * 0.35 + 56, 60, 140);
  const arcY = Math.min(startY, endY) - 30 - Math.abs(route.offset) * 0.25;

  return [
    `M ${startX} ${startY}`,
    `C ${startX + loopPull} ${arcY}`,
    `${endX - loopPull} ${arcY}`,
    `${endX} ${endY}`
  ].join(" ");
}

function resolvedVisualParentId(view: HumanTimelineNode) {
  return view.visualParentId !== undefined
    ? view.visualParentId
    : view.node.parentId;
}

function TimelineGraphCanvas({
  positionedNodes,
  positionedById,
  laneLayouts,
  graphWidth,
  graphHeight,
  zoom,
  activeVersionNodeId,
  onRevert,
  onViewContextImpact,
  onPreviewDelete,
  onOpenThread,
  onStartNewLogic,
  onMoveToPreviousLogic,
  canMoveToPreviousLogic
}: {
  positionedNodes: PositionedTimelineNode[];
  positionedById: Map<string, PositionedTimelineNode>;
  laneLayouts: TimelineLaneLayout[];
  graphWidth: number;
  graphHeight: number;
  zoom: number;
  activeVersionNodeId: string | null;
  onRevert: (node: VersionNode) => void;
  onViewContextImpact: (node: VersionNode) => void;
  onPreviewDelete: (node: VersionNode) => void;
  onOpenThread: (node: VersionNode) => void;
  onStartNewLogic: (node: VersionNode) => void;
  onMoveToPreviousLogic: (node: VersionNode) => void;
  canMoveToPreviousLogic: (node: VersionNode) => boolean;
}) {
  const edgeRoutes = useMemo(() => {
    const rawRoutes = positionedNodes.flatMap((child) => {
      const parentId = resolvedVisualParentId(child.view);

      if (!parentId) {
        return [];
      }

      const parent = positionedById.get(parentId);

      if (!parent) {
        return [];
      }

      return [
        {
          key: `${parent.node.id}-${child.node.id}`,
          parent,
          child,
          offset: 0,
          targetOffset: 0,
          laneChanged: parent.view.laneId !== child.view.laneId,
          stateChanged:
            child.node.nodeType === "discarded" ||
            child.node.nodeType === "deleted" ||
            parent.node.nodeType === "discarded" ||
            parent.node.nodeType === "deleted"
        }
      ];
    });
    const outgoingGroups = new Map<string, TimelineEdgeRoute[]>();
    const incomingGroups = new Map<string, TimelineEdgeRoute[]>();

    rawRoutes.forEach((route) => {
      const outgoingGroup = outgoingGroups.get(route.parent.node.id) ?? [];
      const incomingGroup = incomingGroups.get(route.child.node.id) ?? [];

      outgoingGroup.push(route);
      incomingGroup.push(route);
      outgoingGroups.set(route.parent.node.id, outgoingGroup);
      incomingGroups.set(route.child.node.id, incomingGroup);
    });

    outgoingGroups.forEach((routes) => {
      routes
        .sort((a, b) => a.child.dotY - b.child.dotY || a.child.dotX - b.child.dotX)
        .forEach((route, index) => {
          route.offset = clampEdgeOffset(
            (index - (routes.length - 1) / 2) * EDGE_FAN_GAP
          );
        });
    });
    incomingGroups.forEach((routes) => {
      routes
        .sort((a, b) => a.parent.dotY - b.parent.dotY || a.parent.dotX - b.parent.dotX)
        .forEach((route, index) => {
          route.targetOffset = clampEdgeOffset(
            (index - (routes.length - 1) / 2) * EDGE_FAN_GAP
          );
        });
    });

    return rawRoutes;
  }, [positionedById, positionedNodes]);

  return (
    <div className="thin-scrollbar relative h-full overflow-auto bg-slate-50/40">
      {positionedNodes.length === 0 ? (
        <div className="grid h-full place-items-center rounded-lg border border-dashed border-line bg-slate-50 text-sm text-muted">
          Generate an answer to create the first reasoning point.
        </div>
      ) : (
        <div
          className="relative"
          style={{ width: graphWidth * zoom, height: graphHeight * zoom }}
        >
          <div
            className="timeline-grid relative"
            style={{
              width: graphWidth,
              height: graphHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "top left"
            }}
          >
            {laneLayouts.map(({ lane, top, height }) => {
              const stateClasses = laneStateClasses(lane);

              return (
                <div
                  key={lane.id}
                  className={`absolute left-0 right-0 border-b border-line/70 ${stateClasses.wrapper}`}
                  style={{
                    top: GRAPH_PADDING_Y + top,
                    height
                  }}
                >
                  <div
                    className={`sticky left-0 z-10 w-44 border-r px-4 py-3 backdrop-blur ${stateClasses.label}`}
                  >
                    <div
                      className={`text-xs font-bold uppercase tracking-wide ${stateClasses.title}`}
                    >
                      {lane.title}
                    </div>
                    <div
                      className={`mt-1 text-[11px] leading-4 ${stateClasses.description}`}
                    >
                      {lane.description}
                    </div>
                  </div>
                </div>
              );
            })}

            <svg
              className="pointer-events-none absolute inset-0"
              width={graphWidth}
              height={graphHeight}
              aria-hidden="true"
            >
              {edgeRoutes.map((route) => {
                const stroke = edgeToneByView(route.child.view);

                return (
                  <path
                    key={route.key}
                    d={edgePath(route)}
                    fill="none"
                    stroke={stroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={route.laneChanged ? 2.4 : 2}
                    strokeDasharray={
                      route.stateChanged ||
                      route.child.view.statusTone === "slate"
                        ? "6 5"
                        : undefined
                    }
                    opacity={
                      route.child.node.nodeType === "deleted"
                        ? 0.5
                        : route.child.node.nodeType === "discarded"
                          ? 0.6
                          : route.child.node.isActivePath
                            ? 0.78
                            : 0.45
                    }
                  />
                );
              })}
            </svg>

            {positionedNodes.map(({ node, view, left, top }) => {
              const canAssignLogic = canAssignLogicNode(node);

              return (
                <TimelineNode
                  key={node.id}
                  node={node}
                  view={view}
                  left={left}
                  top={top}
                  current={node.id === activeVersionNodeId}
                  onRevert={() => onRevert(node)}
                  onViewContextImpact={() => onViewContextImpact(node)}
                  onPreviewDelete={() => onPreviewDelete(node)}
                  onOpenThread={() => onOpenThread(node)}
                  onStartNewLogic={
                    canAssignLogic ? () => onStartNewLogic(node) : undefined
                  }
                  onMoveToPreviousLogic={
                    canAssignLogic ? () => onMoveToPreviousLogic(node) : undefined
                  }
                  canMoveToPreviousLogic={
                    canAssignLogic && canMoveToPreviousLogic(node)
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function VersionTimeline({
  isCollapsed = false,
  onCollapsedChange
}: VersionTimelineProps) {
  const [impactDialog, setImpactDialog] = useState<{
    mode: TimelineImpactMode;
    node: VersionNode;
    summary: TimelineImpactSummary;
  } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const [showRemovedPaths, setShowRemovedPaths] = useState(false);
  const [collapseLargeBranches, setCollapseLargeBranches] = useState(true);
  const [maxVisibleDepth, setMaxVisibleDepth] = useState<number | "all">(2);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [zoom, setZoom] = useState(0.82);
  const versionNodes = useAnswerAtlasStore((state) => state.versionNodes);
  const anchors = useAnswerAtlasStore((state) => state.anchors);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const branches = useAnswerAtlasStore((state) => state.branches);
  const comparisons = useAnswerAtlasStore((state) => state.comparisons);
  const documents = useAnswerAtlasStore((state) => state.documents);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const threadMessages = useAnswerAtlasStore((state) => state.messages);
  const logicAssignments = useAnswerAtlasStore(
    (state) => state.logicAssignments
  );
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const openComparisonWindow = useAnswerAtlasStore(
    (state) => state.openComparisonWindow
  );
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const revertToNode = useAnswerAtlasStore((state) => state.revertToNode);
  const setLogicAssignment = useAnswerAtlasStore(
    (state) => state.setLogicAssignment
  );
  const isNavigationCollapsed = useAnswerAtlasStore(
    (state) => state.isNavigationCollapsed
  );

  const humanTimeline = useMemo(
    () =>
      buildHumanTimeline(
        Object.values(versionNodes),
        {
          anchors,
          threads,
          branches,
          documents,
          conversationMessages,
          threadMessages,
          logicAssignments
        },
        {
          showInactive,
          showMemory,
          showRemovedPaths,
          maxVisibleDepth,
          collapseLargeBranches
        }
      ),
    [
      anchors,
      branches,
      collapseLargeBranches,
      conversationMessages,
      documents,
      logicAssignments,
      maxVisibleDepth,
      showInactive,
      showMemory,
      showRemovedPaths,
      threadMessages,
      threads,
      versionNodes
    ]
  );
  const humanNodes = useMemo(
    () =>
      humanTimeline.nodes.map((view) => ({
        node: view.node,
        view
      })),
    [humanTimeline.nodes]
  );
  const inactiveCount = humanTimeline.inactiveCount;
  const removedPathCount = humanTimeline.removedPathCount;
  const foldedBranchCount = humanTimeline.foldedBranchCount;
  const visibleLanes = humanTimeline.lanes;
  const laneLayouts = useMemo(() => {
    const maxStackByLane = new Map<TimelineLaneId, number>();

    humanNodes.forEach(({ view }) => {
      maxStackByLane.set(
        view.laneId,
        Math.max(maxStackByLane.get(view.laneId) ?? 1, view.stackIndex + 1)
      );
    });

    let nextTop = 0;

    return visibleLanes.map((lane) => {
      const stackCount = maxStackByLane.get(lane.id) ?? 1;
      const height = LANE_HEIGHT + Math.max(0, stackCount - 1) * STACK_OFFSET_Y;
      const layout = {
        lane,
        top: nextTop,
        height
      };

      nextTop += height;

      return layout;
    });
  }, [humanNodes, visibleLanes]);
  const positionedNodes = useMemo(() => {
    const laneIndex = new Map<TimelineLaneId, number>(
      laneLayouts.map((layout) => [layout.lane.id, layout.top])
    );

    return humanNodes.map(({ node, view }) => {
      const left = GRAPH_PADDING_X + view.logicColumn * SLOT_WIDTH;
      const top =
        GRAPH_PADDING_Y +
        (laneIndex.get(view.laneId) ?? 0) +
        LANE_NODE_TOP +
        view.stackIndex * STACK_OFFSET_Y;

      return {
        node,
        view,
        left,
        top,
        dotX: left + DOT_CENTER_X,
        dotY: top + DOT_CENTER_Y
      };
    });
  }, [humanNodes, laneLayouts]);
  const positionedById = useMemo(
    () =>
      new Map(positionedNodes.map((positioned) => [positioned.node.id, positioned])),
    [positionedNodes]
  );
  const graphWidth = Math.max(
    920,
    (Math.max(0, ...positionedNodes.map((item) => item.view.logicColumn)) + 1) *
      SLOT_WIDTH +
      GRAPH_PADDING_X * 2
  );
  const visibleGraphHeight =
    (laneLayouts.at(-1)?.top ?? 0) +
    (laneLayouts.at(-1)?.height ?? LANE_HEIGHT) +
    GRAPH_PADDING_Y * 2;
  const viewByNodeId = useMemo(
    () => new Map(humanTimeline.nodes.map((view) => [view.node.id, view])),
    [humanTimeline.nodes]
  );
  const buildImpactSummary = (
    node: VersionNode,
    mode: TimelineImpactMode
  ): TimelineImpactSummary => {
    const view = viewByNodeId.get(node.id);
    const targetTime = new Date(node.createdAt).getTime();
    const futureViews = humanTimeline.nodes.filter(
      (item) =>
        item.node.id !== node.id &&
        item.node.isActivePath &&
        new Date(item.node.createdAt).getTime() > targetTime
    );
    const descendantViews = humanTimeline.nodes.filter((item) => {
      let parentId = resolvedVisualParentId(item);

      while (parentId) {
        if (parentId === node.id) {
          return true;
        }

        const parent = viewByNodeId.get(parentId);
        parentId = parent ? resolvedVisualParentId(parent) : null;
      }

      return false;
    });
    const relatedViews = humanTimeline.nodes.filter(
      (item) =>
        item.node.id !== node.id &&
        ((node.relatedThreadId &&
          item.node.relatedThreadId === node.relatedThreadId) ||
          (node.relatedAnchorId &&
            item.node.relatedAnchorId === node.relatedAnchorId) ||
          (node.relatedBranchId &&
            item.node.relatedBranchId === node.relatedBranchId))
    );
    const affectedForDelete = [
      view,
      ...descendantViews,
      ...relatedViews
    ].filter(Boolean) as HumanTimelineNode[];
    const uniqueAffectedForDelete = Array.from(
      new Map(affectedForDelete.map((item) => [item.node.id, item])).values()
    );
    const relatedThreadCount = new Set(
      uniqueAffectedForDelete
        .map((item) => item.node.relatedThreadId)
        .filter(Boolean)
    ).size;
    const relatedSelectionCount = new Set(
      uniqueAffectedForDelete
        .map((item) => item.node.relatedAnchorId)
        .filter(Boolean)
    ).size;
    const relatedBranchCount = new Set(
      uniqueAffectedForDelete
        .map((item) => item.node.relatedBranchId)
        .filter(Boolean)
    ).size;
    const statusLabel =
      view?.statusLabel ??
      (node.isActivePath ? "active" : "inactive");
    const nodeTitle = view?.title ?? node.label;
    const nodeSubtitle = view?.subtitle ?? node.label;

    if (mode === "context") {
      const excludedReason = node.nodeType === "deleted"
        ? "deleted_memory_never_included"
        : node.nodeType === "discarded"
          ? "discarded_excluded_by_default"
          : !node.isActivePath
            ? "inactive_path_excluded"
            : "";

      return {
        nodeTitle,
        nodeSubtitle,
        statusLabel,
        memoryEffect: excludedReason
          ? `Excluded from future LLM context because ${excludedReason}.`
          : "Included if it is on the active path and matches the current context scope.",
        included: excludedReason
          ? ["Active ancestors and active document version remain usable."]
          : ["This node is currently eligible for active-path context."],
        excluded: excludedReason
          ? [`This node: ${excludedReason}`]
          : [
              "Deleted objects are still never included.",
              "Discarded paths remain excluded by default.",
              "Inactive future paths remain excluded."
            ],
        affected: [
          { label: "related nodes", count: relatedViews.length, tone: "blue" },
          {
            label: "local threads",
            count: relatedThreadCount,
            tone: "blue"
          },
          {
            label: "selection anchors",
            count: relatedSelectionCount,
            tone: "blue"
          }
        ],
        warnings: [
          "Context Review should show the exact inclusion or exclusion reason for each LLM call."
        ]
      };
    }

    if (mode === "delete") {
      const canConfirm = Boolean(node.relatedThreadId);

      return {
        nodeTitle,
        nodeSubtitle,
        statusLabel,
        memoryEffect: canConfirm
          ? "Confirmed delete marks the related local answer as deleted and future context never includes it."
          : "Full node cascade delete needs a workspace action before this node can be confirmed from the UI.",
        included: [
          "Logic map records remain visible as history.",
          "Unrelated active path content remains unchanged."
        ],
        excluded: [
          "Deleted local answer body is removed from future context.",
          "Related local messages are marked deleted by the current local delete action.",
          "Deleted paths are hidden unless Show removed paths is enabled."
        ],
        affected: [
          {
            label: "logic points",
            count: uniqueAffectedForDelete.length,
            tone: "red"
          },
          {
            label: "local threads",
            count: relatedThreadCount,
            tone: relatedThreadCount ? "red" : "slate"
          },
          {
            label: "selection anchors",
            count: relatedSelectionCount,
            tone: relatedSelectionCount ? "amber" : "slate"
          },
          {
            label: "branches",
            count: relatedBranchCount,
            tone: relatedBranchCount ? "amber" : "slate"
          }
        ],
        warnings: canConfirm
          ? [
              "This uses the existing local-answer delete path. Main-answer cascade delete is intentionally not forced here."
            ]
          : [
              "This node has no related local thread, so confirming is disabled until timeline.node.delete cascade exists.",
              "A real cascade must update chat messages, selections, branches, comparisons, and context cache together."
            ],
        confirmLabel: "Delete Related Local Answer",
        confirmDisabled: !canConfirm
      };
    }

    return {
      nodeTitle,
      nodeSubtitle,
      statusLabel,
      memoryEffect:
        "Confirmed revert switches the active path. Later active nodes become inactive and are excluded from future LLM context.",
      included: [
        "Target node and its active ancestors",
        "Document version associated with the target path",
        "Active messages up to this point"
      ],
      excluded: [
        `${futureViews.length} later active reasoning points may become inactive`,
        "Later chat messages in the affected logic path should be shown as inactive history",
        "Later local threads, notes, branches, comparisons, and pending merges from that logic path are excluded unless restored by returning to that path"
      ],
      affected: [
        { label: "future nodes", count: futureViews.length, tone: "slate" },
        {
          label: "related threads",
          count: relatedThreadCount,
          tone: relatedThreadCount ? "amber" : "slate"
        },
        {
          label: "related selections",
          count: relatedSelectionCount,
          tone: relatedSelectionCount ? "amber" : "slate"
        }
      ],
      warnings: [
        "Revert does not physically delete records.",
        "Inactive logic can still be viewed and returned to later."
      ],
      confirmLabel: "Return to This Logic Point"
    };
  };
  const openImpactDialog = (node: VersionNode, mode: TimelineImpactMode) => {
    setImpactDialog({
      mode,
      node,
      summary: buildImpactSummary(node, mode)
    });
  };
  const openRelatedThread = (node: VersionNode) => {
    const thread = node.relatedThreadId ? threads[node.relatedThreadId] : null;
    const anchor =
      (node.relatedAnchorId ? anchors[node.relatedAnchorId] : null) ??
      (thread?.anchorId ? anchors[thread.anchorId] : null);
    const sourceMessageId =
      anchor?.sourceMessageId ??
      thread?.sourceMessageId ??
      sourceMessageIdForVersionNode(node);

    if (node.relatedThreadId) {
      openThread(node.relatedThreadId);
    }

    const relatedComparison = anchor
      ? Object.values(comparisons)
          .filter(
            (comparison) =>
              comparison.status !== "deleted" &&
              comparison.anchorId === anchor.id
          )
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() -
              new Date(a.updatedAt).getTime()
          )[0]
      : null;

    if (relatedComparison) {
      openComparisonWindow(relatedComparison.id);
    }

    requestSourceFocus({
      anchorId: anchor?.id ?? thread?.anchorId ?? node.relatedAnchorId,
      sourceMessageId
    });
  };
  const sharesLogicScope = (
    first?: HumanTimelineNode,
    second?: HumanTimelineNode
  ) => {
    if (!first || !second) {
      return false;
    }

    if (first.hubKey && second.hubKey) {
      return first.hubKey === second.hubKey;
    }

    return Boolean(
      (first.node.relatedThreadId &&
        first.node.relatedThreadId === second.node.relatedThreadId) ||
        (first.node.relatedAnchorId &&
          first.node.relatedAnchorId === second.node.relatedAnchorId) ||
        (first.node.relatedBranchId &&
          first.node.relatedBranchId === second.node.relatedBranchId)
    );
  };
  const previousLogicViewForNode = (node: VersionNode) => {
    const view = viewByNodeId.get(node.id);

    if (!view) {
      return undefined;
    }

    const nodeTime = new Date(node.createdAt).getTime();

    return [...humanTimeline.nodes]
      .filter((item) => {
        if (item.node.id === node.id || !item.logicFocusKey) {
          return false;
        }

        if (!sharesLogicScope(item, view)) {
          return false;
        }

        if (item.logicFocusKey === view.logicFocusKey) {
          return false;
        }

        return new Date(item.node.createdAt).getTime() <= nodeTime;
      })
      .sort(
        (a, b) =>
          new Date(b.node.createdAt).getTime() -
          new Date(a.node.createdAt).getTime()
      )[0];
  };
  const canMoveToPreviousLogic = (node: VersionNode) =>
    Boolean(previousLogicViewForNode(node));
  const startSeparateLogic = (node: VersionNode) => {
    const view = viewByNodeId.get(node.id);

    setLogicAssignment(node.id, {
      logicFocusLabel: view?.shortTitle ?? view?.title ?? "separate logic",
      assignmentType: "user_new",
      reason: "User marked this node as the start of a separate logic path."
    });
  };
  const moveToPreviousLogic = (node: VersionNode) => {
    const previous = previousLogicViewForNode(node);

    if (!previous?.logicFocusKey) {
      return;
    }

    setLogicAssignment(node.id, {
      logicFocusKey: previous.logicFocusKey,
      logicFocusLabel: previous.logicFocusLabel ?? previous.shortTitle,
      targetNodeId: previous.node.id,
      assignmentType: "user_previous",
      reason: "User moved this node back to a previous logic path."
    });
  };
  const zoomOut = () =>
    setZoom((value) => Math.max(0.55, Math.round((value - 0.1) * 100) / 100));
  const zoomIn = () =>
    setZoom((value) => Math.min(1.25, Math.round((value + 0.1) * 100) / 100));
  const fitTimeline = () => setZoom(0.68);
  const setCollapsed = (collapsed: boolean) => {
    onCollapsedChange?.(collapsed);
  };
  const zoomControls = (
    <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1 text-xs font-bold text-slate-700">
      <button
        type="button"
        onClick={zoomOut}
        className="grid h-7 w-7 place-items-center rounded hover:bg-slate-50"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus size={14} />
      </button>
      <span className="min-w-10 text-center">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        onClick={zoomIn}
        className="grid h-7 w-7 place-items-center rounded hover:bg-slate-50"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={fitTimeline}
        className="h-7 rounded px-2 hover:bg-slate-50"
        title="Fit visible timeline"
      >
        Fit
      </button>
    </div>
  );
  const logicControlToggle = (
    <button
      type="button"
      onClick={() => setCollapsed(!isCollapsed)}
      className="flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
      aria-pressed={!isCollapsed}
      title={isCollapsed ? "Show logic map" : "Minimize logic map"}
    >
      <span>Visible logic</span>
      <span
        className={`h-5 w-9 rounded-full p-0.5 transition ${
          !isCollapsed ? "bg-atlasBlue" : "bg-slate-300"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow transition ${
            !isCollapsed ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );

  if (isCollapsed) {
    return (
      <section
        className={`panel flex min-h-0 items-center overflow-hidden rounded-lg max-[900px]:col-span-1 max-[900px]:col-start-auto ${
          isNavigationCollapsed
            ? "col-span-full"
            : "col-span-full min-[901px]:col-start-1"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-ink">
              Logic Map
            </h2>
            <p className="truncate text-xs text-muted">
              Minimized. Logic records, memory, and timeline data are unchanged.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {logicControlToggle}
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="h-8 rounded-md bg-atlasBlue px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              Show map
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`panel min-h-0 overflow-hidden rounded-lg max-[900px]:col-span-1 max-[900px]:col-start-auto max-[900px]:h-[300px] ${
        isNavigationCollapsed
          ? "col-span-full"
          : "col-span-full min-[901px]:col-start-1"
      }`}
    >
      <div className="flex h-full">
        <BranchLane
          inactiveCount={inactiveCount}
          removedPathCount={removedPathCount}
          foldedBranchCount={foldedBranchCount}
          showInactive={showInactive}
          showMemory={showMemory}
          showRemovedPaths={showRemovedPaths}
          collapseLargeBranches={collapseLargeBranches}
          maxVisibleDepth={maxVisibleDepth}
          onToggleInactive={() => setShowInactive((value) => !value)}
          onToggleMemory={() => setShowMemory((value) => !value)}
          onToggleRemovedPaths={() => setShowRemovedPaths((value) => !value)}
          onToggleCollapseLargeBranches={() =>
            setCollapseLargeBranches((value) => !value)
          }
          onMaxVisibleDepthChange={setMaxVisibleDepth}
        />
        <div className="relative min-w-0 flex-1">
          <div className="flex h-12 items-center justify-between border-b border-line px-4">
            <h2 className="text-lg font-bold text-ink">Logic Map</h2>
            <div className="flex items-center gap-2">
              {logicControlToggle}
              {zoomControls}
              <button
                onClick={() => setFullscreenOpen(true)}
                className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-700"
                title="Expand"
                aria-label="Expand"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div className="h-[calc(100%-48px)]">
            <TimelineGraphCanvas
              positionedNodes={positionedNodes}
              positionedById={positionedById}
              laneLayouts={laneLayouts}
              graphWidth={graphWidth}
              graphHeight={visibleGraphHeight}
              zoom={zoom}
              activeVersionNodeId={activeVersionNodeId}
              onRevert={(node) => openImpactDialog(node, "revert")}
              onViewContextImpact={(node) => openImpactDialog(node, "context")}
              onPreviewDelete={(node) => openImpactDialog(node, "delete")}
              onOpenThread={openRelatedThread}
              onStartNewLogic={startSeparateLogic}
              onMoveToPreviousLogic={moveToPreviousLogic}
              canMoveToPreviousLogic={canMoveToPreviousLogic}
            />
          </div>
        </div>
      </div>
      {fullscreenOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
            <div>
              <h2 className="text-lg font-bold text-ink">Logic Map</h2>
              <p className="text-xs text-muted">
                Compact graph with hover details. Independent local questions form separate logic rows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {zoomControls}
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-line text-slate-700 hover:bg-slate-50"
                title="Close fullscreen timeline"
                aria-label="Close fullscreen timeline"
              >
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <BranchLane
              inactiveCount={inactiveCount}
              removedPathCount={removedPathCount}
              foldedBranchCount={foldedBranchCount}
              showInactive={showInactive}
              showMemory={showMemory}
              showRemovedPaths={showRemovedPaths}
              collapseLargeBranches={collapseLargeBranches}
              maxVisibleDepth={maxVisibleDepth}
              onToggleInactive={() => setShowInactive((value) => !value)}
              onToggleMemory={() => setShowMemory((value) => !value)}
              onToggleRemovedPaths={() => setShowRemovedPaths((value) => !value)}
              onToggleCollapseLargeBranches={() =>
                setCollapseLargeBranches((value) => !value)
              }
              onMaxVisibleDepthChange={setMaxVisibleDepth}
            />
            <TimelineGraphCanvas
              positionedNodes={positionedNodes}
              positionedById={positionedById}
              laneLayouts={laneLayouts}
              graphWidth={graphWidth}
              graphHeight={visibleGraphHeight}
              zoom={zoom}
              activeVersionNodeId={activeVersionNodeId}
              onRevert={(node) => openImpactDialog(node, "revert")}
              onViewContextImpact={(node) => openImpactDialog(node, "context")}
              onPreviewDelete={(node) => openImpactDialog(node, "delete")}
              onOpenThread={openRelatedThread}
              onStartNewLogic={startSeparateLogic}
              onMoveToPreviousLogic={moveToPreviousLogic}
              canMoveToPreviousLogic={canMoveToPreviousLogic}
            />
          </div>
        </div>
      )}
      <TimelineImpactDialog
        open={Boolean(impactDialog)}
        mode={impactDialog?.mode ?? "context"}
        summary={impactDialog?.summary ?? null}
        onCancel={() => setImpactDialog(null)}
        onConfirm={() => {
          if (!impactDialog) {
            return;
          }

          if (impactDialog.mode === "revert") {
            revertToNode(impactDialog.node.id);
          } else if (
            impactDialog.mode === "delete" &&
            impactDialog.node.relatedThreadId
          ) {
            deleteAnswer(impactDialog.node.relatedThreadId);
          }

          setImpactDialog(null);
        }}
      />
    </section>
  );
}
