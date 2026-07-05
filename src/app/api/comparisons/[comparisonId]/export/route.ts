import { NextResponse } from "next/server";
import type { ComparisonExportType } from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  const { comparisonId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    run_id?: string;
    export_type?: ComparisonExportType;
  };
  const result = revisionRepository.exportComparison({
    comparisonId,
    runId: body.run_id,
    exportType: body.export_type ?? "json",
    now: new Date().toISOString(),
    suffix: `${comparisonId}-${Date.now().toString(36)}`
  });

  return NextResponse.json({ export: result.export });
}
