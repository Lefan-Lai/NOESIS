import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    model_provider?: "openai" | "mock";
    allow_non_active_sources?: boolean;
  };
  const result = revisionRepository.regenerateComparison(comparisonId, {
    model: body.model ?? "gpt-5.5",
    modelProvider: body.model_provider ?? "mock",
    allowNonActiveSources: body.allow_non_active_sources,
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });

  return NextResponse.json({
    comparison: result.comparison,
    active_run: result.run
  });
}
