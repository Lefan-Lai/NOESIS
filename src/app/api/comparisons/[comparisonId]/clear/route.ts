import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const result = revisionRepository.clearComparison(comparisonId, {
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });

  return NextResponse.json({ comparison: result.comparison });
}
