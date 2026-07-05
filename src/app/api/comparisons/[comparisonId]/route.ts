import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const comparison = revisionRepository.getComparison(comparisonId);

  if (!comparison) {
    return NextResponse.json({ error: "Comparison not found" }, { status: 404 });
  }

  return NextResponse.json({
    comparison,
    active_run: comparison.activeRunId
      ? revisionRepository.getComparisonRun(comparison.activeRunId)
      : null
  });
}
