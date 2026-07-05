import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  const timelineLimit = Number(url.searchParams.get("timelineLimit") ?? 50);

  return NextResponse.json(
    revisionRepository.openProjectWorkspace({
      projectId,
      conversationId,
      timelineLimit
    })
  );
}
