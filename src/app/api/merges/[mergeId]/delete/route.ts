import { NextResponse } from "next/server";
import { MergeService } from "@/services/revision/MergeService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mergeId: string }> }
) {
  const { mergeId } = await params;
  const result = MergeService.deleteMerge({
    state: revisionRepository.getState(),
    mergeId,
    now: new Date().toISOString(),
    suffix: `${mergeId}-${Date.now().toString(36)}`
  });

  revisionRepository.replaceState(result.state);

  return NextResponse.json({ merge_record: result.mergeRecord });
}
