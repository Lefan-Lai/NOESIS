import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";
import { ComparisonService } from "@/services/revision/ComparisonService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const body = (await request.json().catch(() => ({}))) as { confirmed?: boolean };
  const result = ComparisonService.deleteComparison({
    state: revisionRepository.getState(),
    comparisonId,
    confirmed: body.confirmed === true,
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });
  revisionRepository.replaceState(result.state);

  return NextResponse.json({
    comparison: result.state.comparisonGraphs[comparisonId],
    state_transition: result.transition
  });
}
