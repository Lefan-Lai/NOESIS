"use client";

import { useEffect } from "react";
import { AppHeader } from "./AppHeader";
import { MainDocumentPanel } from "@/components/document/MainDocumentPanel";
import { SideThreadPanel } from "@/components/thread/SideThreadPanel";
import { ArgumentEvidenceComparison } from "@/components/comparison/ArgumentEvidenceComparison";
import { VersionTimeline } from "@/components/timeline/VersionTimeline";
import { DiffModal } from "@/components/diff/DiffModal";
import { ContextDebugPanel } from "@/components/debug/ContextDebugPanel";
import { UtilityPanel } from "./UtilityPanel";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

type AppShellProps = {
  documentId: string;
};

export function AppShell({ documentId }: AppShellProps) {
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
  const threads = useAnswerAtlasStore((state) => state.threads);
  const discardThread = useAnswerAtlasStore((state) => state.discardThread);
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const sideThreadVisible = isSideThreadOpen && !isSideThreadMinimized;
  const gridClass = sideThreadVisible
    ? "grid-cols-[minmax(520px,1.08fr)_minmax(340px,0.78fr)_minmax(520px,1.08fr)]"
    : "grid-cols-[minmax(620px,1.08fr)_minmax(520px,0.92fr)]";

  useEffect(() => {
    loadModels();
    refreshContextPreview();
  }, [loadModels, refreshContextPreview]);

  return (
    <div className="min-h-screen overflow-auto p-2 text-ink">
      <div className="mx-auto flex h-[calc(100vh-16px)] min-h-[760px] max-w-[1920px] flex-col overflow-hidden rounded-lg border border-line bg-white/72 shadow-panel max-[1280px]:min-h-[1180px] max-[900px]:h-auto max-[900px]:min-h-0 max-[900px]:overflow-visible">
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
          className={`grid min-h-0 flex-1 ${gridClass} grid-rows-[minmax(0,1fr)_260px] gap-3 p-3 pt-0 max-[1280px]:grid-rows-[minmax(430px,1fr)_minmax(460px,1fr)_250px] max-[900px]:grid-cols-1 max-[900px]:grid-rows-none max-[900px]:auto-rows-auto max-[900px]:pt-3`}
        >
          <MainDocumentPanel documentId={documentId || currentDocumentId || ""} />
          {sideThreadVisible && <SideThreadPanel />}
          <ArgumentEvidenceComparison />
          <VersionTimeline />
        </div>
        <ContextDebugPanel />
        <UtilityPanel />
        <DiffModal />
      </div>
    </div>
  );
}
