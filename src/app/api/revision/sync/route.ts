import { NextResponse } from "next/server";
import type { RevisionRepositoryState } from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<RevisionRepositoryState>;

  const state = revisionRepository.mergeState(body);

  return NextResponse.json({
    ok: true,
    counts: {
      events: Object.keys(state.eventLogs).length,
      timelineNodes: Object.keys(state.timelineNodes).length,
      timelineEdges: Object.keys(state.timelineEdges).length,
      llmCalls: Object.keys(state.llmCallRecords).length,
      contextSnapshots: Object.keys(state.contextSnapshots).length,
      manualEditDrafts: Object.keys(state.manualEditDrafts).length,
      mergeRecords: Object.keys(state.mergeRecords).length,
      comparisonGraphs: Object.keys(state.comparisonGraphs).length,
      comparisonRuns: Object.keys(state.comparisonRuns).length,
      comparisonExports: Object.keys(state.comparisonExports).length
    }
  });
}
