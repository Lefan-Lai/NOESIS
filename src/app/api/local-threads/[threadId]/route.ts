import { NextResponse } from "next/server";
import { LocalThreadQueryService } from "@/services/revision/LocalThreadQueryService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);

  try {
    const result = LocalThreadQueryService.openLocalThread({
      state: revisionRepository.getState(),
      threadId,
      limit
    });
    revisionRepository.replaceState(result.state);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local thread not found" },
      { status: 404 }
    );
  }
}
