import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const body = (await request.json().catch(() => ({}))) as { run_id?: string };
  const comparison = revisionRepository.getComparison(comparisonId);
  const runId = body.run_id ?? comparison?.activeRunId;

  if (!runId) {
    return NextResponse.json({ error: "Comparison run not found" }, { status: 404 });
  }

  const result = revisionRepository.keepComparisonSummaryAsNote({
    comparisonRunId: runId,
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });

  return NextResponse.json({ annotation: result.annotation });
}
