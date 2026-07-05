import { NextResponse } from "next/server";
import { TimelineService } from "@/services/revision/TimelineService";
import { WorkspaceProjectionService } from "@/services/revision/WorkspaceProjectionService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const conversationId = url.searchParams.get("conversationId") ?? undefined;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const projectedState = WorkspaceProjectionService.rebuildTimelineNodeProjections({
    state: revisionRepository.getState(),
    projectId,
    conversationId,
    now
  });
  const snapshotResult = TimelineService.createActivePathOverviewSnapshot({
    state: projectedState,
    projectId,
    conversationId,
    now
  });
  revisionRepository.replaceState(snapshotResult.state);

  return NextResponse.json({
    overview: snapshotResult.overview,
    snapshot: snapshotResult.snapshot
  });
}
