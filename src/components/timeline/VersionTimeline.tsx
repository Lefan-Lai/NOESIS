"use client";

import { useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import type { VersionNode } from "@/types/version";
import { BranchLane } from "./BranchLane";
import { TimelineNode } from "./TimelineNode";
import { RevertNodeDialog } from "./RevertNodeDialog";

export function VersionTimeline() {
  const [revertTarget, setRevertTarget] = useState<VersionNode | null>(null);
  const versionNodes = useAnswerAtlasStore((state) => state.versionNodes);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const openThread = useAnswerAtlasStore((state) => state.openThread);
  const deleteAnswer = useAnswerAtlasStore((state) => state.deleteAnswer);
  const revertToNode = useAnswerAtlasStore((state) => state.revertToNode);
  const isNavigationCollapsed = useAnswerAtlasStore(
    (state) => state.isNavigationCollapsed
  );

  const nodes = useMemo(
    () =>
      Object.values(versionNodes).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [versionNodes]
  );

  return (
    <section
      className={`panel min-h-0 overflow-hidden rounded-lg max-[900px]:col-span-1 max-[900px]:col-start-auto max-[900px]:h-[300px] ${
        isNavigationCollapsed
          ? "col-span-full"
          : "col-span-full min-[901px]:col-start-1"
      }`}
    >
      <div className="flex h-full">
        <BranchLane />
        <div className="relative min-w-0 flex-1">
          <div className="flex h-12 items-center justify-between border-b border-line px-4">
            <h2 className="text-lg font-bold text-ink">Version Timeline</h2>
            <button
              className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-700"
              title="Expand"
              aria-label="Expand"
            >
              <Maximize2 size={16} />
            </button>
          </div>
          <div className="timeline-grid thin-scrollbar relative h-[calc(100%-48px)] overflow-x-auto overflow-y-hidden p-6">
            {nodes.length === 0 ? (
              <div className="grid h-full place-items-center rounded-lg border border-dashed border-line bg-slate-50 text-sm text-muted">
                Generate an answer to create the first version node.
              </div>
            ) : (
              <>
                <div className="absolute left-8 right-8 top-[84px] h-0.5 bg-blue-200" />
                <div className="flex min-w-[1040px] items-start justify-between gap-5">
                  {nodes.map((node) => (
                    <TimelineNode
                      key={node.id}
                      node={node}
                      current={node.id === activeVersionNodeId}
                      onRevert={() => setRevertTarget(node)}
                      onOpenThread={() => {
                        if (node.relatedThreadId) {
                          openThread(node.relatedThreadId);
                        }
                      }}
                      onDeleteAnswer={() => {
                        if (
                          node.relatedThreadId &&
                          window.confirm("Delete this related local answer?")
                        ) {
                          deleteAnswer(node.relatedThreadId);
                        }
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <RevertNodeDialog
        open={Boolean(revertTarget)}
        nodeLabel={revertTarget?.label ?? ""}
        onCancel={() => setRevertTarget(null)}
        onConfirm={() => {
          if (revertTarget) {
            revertToNode(revertTarget.id);
          }

          setRevertTarget(null);
        }}
      />
    </section>
  );
}
