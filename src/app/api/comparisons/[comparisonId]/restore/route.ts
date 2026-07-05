import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";
import { ComparisonService } from "@/services/revision/ComparisonService";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const result = ComparisonService.restoreComparison({
    state: revisionRepository.getState(),
    comparisonId,
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });
  revisionRepository.replaceState(result.state);

  return NextResponse.json({
    comparison: result.state.comparisonGraphs[comparisonId],
    state_transition: result.transition
  });
}
