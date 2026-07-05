import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;

  try {
    return NextResponse.json(
      revisionRepository.getComparisonGraphSummary(comparisonId)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Comparison graph not found" },
      { status: 404 }
    );
  }
}
