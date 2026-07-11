"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppHeader } from "./AppHeader";
import { MainDocumentPanel } from "@/components/document/MainDocumentPanel";
import { SideThreadPanel } from "@/components/thread/SideThreadPanel";
import { ArgumentEvidenceComparison } from "@/components/comparison/ArgumentEvidenceComparison";
import { RevisionBranchPanel } from "@/components/branch/RevisionBranchPanel";
import { VersionTimeline } from "@/components/timeline/VersionTimeline";
import { DiffModal } from "@/components/diff/DiffModal";
import { MergeModal } from "@/components/merge/MergeModal";
import { ContextDebugPanel } from "@/components/debug/ContextDebugPanel";
import { UtilityPanel } from "./UtilityPanel";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

type AppShellProps = {
  documentId: string;
};

const TOP_PANEL_MIN_WIDTH = 240;
const LOGIC_MAP_MIN_HEIGHT = 140;
const MAIN_WORKSPACE_MIN_HEIGHT = 280;

function defaultTopRatios(panelCount: number) {
  if (panelCount >= 3) {
    return [0.46, 0.27, 0.27];
  }

  if (panelCount === 2) {
    return [0.62, 0.38];
  }

  return [1];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function Splitter({
  orientation,
  onPointerDown
}: {
  orientation: "vertical" | "horizontal";
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const isVertical = orientation === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={`group relative z-20 shrink-0 bg-transparent ${
        isVertical
          ? "w-2 cursor-col-resize max-[900px]:hidden"
          : "h-2 cursor-row-resize"
      }`}
    >
      <div
        className={`absolute rounded-full bg-slate-200 transition group-hover:bg-atlasBlue ${
          isVertical
            ? "left-1/2 top-2 bottom-2 w-px -translate-x-1/2"
            : "left-2 right-2 top-1/2 h-px -translate-y-1/2"
        }`}
      />
    </div>
  );
}

export function AppShell({ documentId }: AppShellProps) {
  const topWorkspaceRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const refreshContextPreview = useAnswerAtlasStore(
    (state) => state.refreshContextPreview
  );
  const loadModels = useAnswerAtlasStore((state) => state.loadModels);
  const currentDocumentId = useAnswerAtlasStore((state) => state.currentDocumentId);
  const isSideThreadOpen = useAnswerAtlasStore((state) => state.isSideThreadOpen);
  const isSideThreadMinimized = useAnswerAtlasStore(
    (state) => state.isSideThreadMinimized
  );
  const restoreSideThread = useAnswerAtlasStore((state) => state.restoreSideThread);
  const selectedThreadId = useAnswerAtlasStore((state) => state.selectedThreadId);
  const activeRevisionBranchId = useAnswerAtlasStore(
    (state) => state.activeRevisionBranchId
  );
  const activeTreeWindowId = useAnswerAtlasStore(
    (state) => state.activeTreeWindowId
  );
  const [isLogicMapCollapsed, setIsLogicMapCollapsed] = useState(false);
  const threads = useAnswerAtlasStore((state) => state.threads);
  const discardThread = useAnswerAtlasStore((state) => state.discardThread);
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const sideThreadVisible = isSideThreadOpen && !isSideThreadMinimized;
  const rightPanelVisible = Boolean(activeRevisionBranchId || activeTreeWindowId);
  const topPanelCount = 1 + Number(sideThreadVisible) + Number(rightPanelVisible);
  const [topRatios, setTopRatios] = useState(() =>
    defaultTopRatios(topPanelCount)
  );
  const [verticalRatios, setVerticalRatios] = useState([0.76, 0.24]);
  const activeTopRatios = useMemo(() => {
    if (topRatios.length >= topPanelCount) {
      return topRatios.slice(0, topPanelCount);
    }

    return defaultTopRatios(topPanelCount);
  }, [topPanelCount, topRatios]);
  const topGridColumns = useMemo(() => {
    const panelColumns = activeTopRatios.map(
      (ratio) => `minmax(${TOP_PANEL_MIN_WIDTH}px, ${ratio}fr)`
    );

    if (panelColumns.length <= 1) {
      return panelColumns[0] ?? "minmax(0, 1fr)";
    }

    return panelColumns.flatMap((column, index) =>
      index === panelColumns.length - 1 ? [column] : [column, "8px"]
    ).join(" ");
  }, [activeTopRatios]);
  const workspaceRows = isLogicMapCollapsed
    ? "minmax(0,1fr) 44px"
    : `minmax(${MAIN_WORKSPACE_MIN_HEIGHT}px, ${verticalRatios[0]}fr) 8px minmax(${LOGIC_MAP_MIN_HEIGHT}px, ${verticalRatios[1]}fr)`;

  useEffect(() => {
    loadModels();
    refreshContextPreview();
  }, [loadModels, refreshContextPreview]);

  useEffect(() => {
    setTopRatios(defaultTopRatios(topPanelCount));
  }, [topPanelCount]);

  useEffect(() => {
    if (isLogicMapCollapsed) {
      return;
    }

    setVerticalRatios([0.76, 0.24]);
  }, [isLogicMapCollapsed]);

  function beginColumnResize(
    splitterIndex: number,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const container = topWorkspaceRef.current;

    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startRatios = activeTopRatios;
    const splitterWidth = 8 * Math.max(0, topPanelCount - 1);
    const availableWidth = rect.width - splitterWidth;
    const totalRatio = startRatios.reduce((sum, ratio) => sum + ratio, 0);
    const startWidths = startRatios.map(
      (ratio) => (ratio / totalRatio) * availableWidth
    );
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const leftStart = startWidths[splitterIndex];
      const rightStart = startWidths[splitterIndex + 1];
      const pairTotal = leftStart + rightStart;
      const pairMinWidth = Math.min(
        TOP_PANEL_MIN_WIDTH,
        Math.max(120, pairTotal / 2 - 1)
      );
      const nextLeft = clamp(
        leftStart + deltaX,
        pairMinWidth,
        pairTotal - pairMinWidth
      );
      const nextRight = pairTotal - nextLeft;
      const nextWidths = [...startWidths];

      nextWidths[splitterIndex] = nextLeft;
      nextWidths[splitterIndex + 1] = nextRight;
      setTopRatios(nextWidths.map((width) => width / availableWidth));
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function beginRowResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const container = contentAreaRef.current;

    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const startY = event.clientY;
    const splitterHeight = 8;
    const availableHeight = rect.height - splitterHeight;
    const totalRatio = verticalRatios[0] + verticalRatios[1];
    const startTopHeight = (verticalRatios[0] / totalRatio) * availableHeight;
    const startBottomHeight = (verticalRatios[1] / totalRatio) * availableHeight;
    const pairTotal = startTopHeight + startBottomHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const topMinHeight = Math.min(
        MAIN_WORKSPACE_MIN_HEIGHT,
        Math.max(180, pairTotal - LOGIC_MAP_MIN_HEIGHT)
      );
      const mapMinHeight = Math.min(
        LOGIC_MAP_MIN_HEIGHT,
        Math.max(120, pairTotal - topMinHeight)
      );
      const nextTop = clamp(
        startTopHeight + deltaY,
        topMinHeight,
        pairTotal - mapMinHeight
      );
      const nextBottom = pairTotal - nextTop;

      setVerticalRatios([nextTop / availableHeight, nextBottom / availableHeight]);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div className="h-screen overflow-hidden p-1.5 text-ink">
      <div className="mx-auto flex h-full min-h-0 max-w-[1920px] flex-col overflow-hidden rounded-lg border border-line bg-white/72 shadow-panel">
        <AppHeader />
        {isSideThreadMinimized && selectedThreadId && threads[selectedThreadId] && (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 shadow-sm">
            <button
              onClick={restoreSideThread}
              className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-atlasBlue"
            >
              Side Thread
            </button>
            <button
              onClick={() => discardThread(selectedThreadId)}
              className="rounded-md border border-orange-200 px-3 py-1.5 text-sm font-semibold text-atlasOrange"
            >
              Discard
            </button>
            <button
              onClick={() => {
                if (window.confirm("Delete this minimized thread answer?")) {
                  deleteAnswer(selectedThreadId);
                }
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-semibold text-atlasRed"
            >
              Delete
            </button>
          </div>
        )}
        <div
          ref={contentAreaRef}
          className="grid min-h-0 flex-1 overflow-hidden p-2 pt-0 max-[900px]:pt-2"
          style={{ gridTemplateRows: workspaceRows }}
        >
          <div
            ref={topWorkspaceRef}
            className="grid min-h-0 overflow-hidden max-[900px]:flex max-[900px]:flex-col max-[900px]:gap-2"
            style={{ gridTemplateColumns: topGridColumns }}
          >
            <div className="min-h-0 min-w-0">
              <MainDocumentPanel documentId={documentId || currentDocumentId || ""} />
            </div>
            {sideThreadVisible && (
              <>
                <Splitter
                  orientation="vertical"
                  onPointerDown={(event) => beginColumnResize(0, event)}
                />
                <div className="min-h-0 min-w-0">
                  <SideThreadPanel />
                </div>
              </>
            )}
            {rightPanelVisible && (
              <>
                <Splitter
                  orientation="vertical"
                  onPointerDown={(event) =>
                    beginColumnResize(sideThreadVisible ? 1 : 0, event)
                  }
                />
                <div className="min-h-0 min-w-0">
                  {activeRevisionBranchId ? (
                    <RevisionBranchPanel />
                  ) : (
                    <ArgumentEvidenceComparison />
                  )}
                </div>
              </>
            )}
          </div>
          {!isLogicMapCollapsed && (
            <Splitter orientation="horizontal" onPointerDown={beginRowResize} />
          )}
          <div className="min-h-0 min-w-0">
            <VersionTimeline
              isCollapsed={isLogicMapCollapsed}
              onCollapsedChange={setIsLogicMapCollapsed}
            />
          </div>
        </div>
        <ContextDebugPanel />
        <UtilityPanel />
        <DiffModal />
        <MergeModal />
      </div>
    </div>
  );
}
