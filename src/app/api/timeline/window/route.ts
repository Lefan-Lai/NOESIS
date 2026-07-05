import { NextResponse } from "next/server";
import { TimelineService } from "@/services/revision/TimelineService";
import { WorkspaceProjectionService } from "@/services/revision/WorkspaceProjectionService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  const anchorNodeId = url.searchParams.get("anchorNodeId") ?? undefined;
  const direction =
    (url.searchParams.get("direction") as "before" | "after" | "around" | null) ??
    "around";
  const limit = Number(url.searchParams.get("limit") ?? 50);

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const state = revisionRepository.getState();
  const projectedState = WorkspaceProjectionService.rebuildTimelineNodeProjections({
    state,
    projectId,
    conversationId
  });
  revisionRepository.replaceState(projectedState);

  return NextResponse.json(
    TimelineService.getTimelineWindow({
      state: projectedState,
      projectId,
      conversationId,
      anchorNodeId,
      direction,
      limit
    })
  );
}
