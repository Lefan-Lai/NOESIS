import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";
import { toTimelineApiGraph } from "@/services/revision/timelineApiShape";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  return NextResponse.json(
    toTimelineApiGraph(revisionRepository.getProjectTimelineGraph(projectId))
  );
}
