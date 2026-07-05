import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const state = revisionRepository.getState();

  return NextResponse.json({
    runs: Object.values(state.comparisonRuns)
      .filter((run) => run.comparisonId === comparisonId)
      .sort((a, b) => a.runNumber - b.runNumber)
  });
}
