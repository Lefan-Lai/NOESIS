import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId") ?? undefined;
  const cursor = url.searchParams.has("cursor")
    ? Number(url.searchParams.get("cursor"))
    : undefined;
  const limit = url.searchParams.has("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  try {
    return NextResponse.json(
      revisionRepository.getComparisonGraphWindow({
        runId,
        groupId,
        cursor,
        limit
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Comparison run not found" },
      { status: 404 }
    );
  }
}
