import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const run = revisionRepository.getComparisonRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Comparison run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
