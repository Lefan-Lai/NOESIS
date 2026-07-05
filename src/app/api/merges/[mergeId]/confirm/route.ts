import { NextResponse } from "next/server";
import { MergeService } from "@/services/revision/MergeService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mergeId: string }> }
) {
  const { mergeId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };
  const current = revisionRepository.getMergeRecord(mergeId);

  if (!current) {
    return NextResponse.json({ error: "MergeRecord not found" }, { status: 404 });
  }

  if (body.projectId && current.projectId !== body.projectId) {
    return NextResponse.json({ error: "Project mismatch" }, { status: 403 });
  }

  const result = MergeService.confirmMerge({
    state: revisionRepository.getState(),
    mergeId,
    now: new Date().toISOString(),
    suffix: `${mergeId}-${Date.now().toString(36)}`
  });

  revisionRepository.replaceState(result.state);

  if (!result.ok) {
    return NextResponse.json({
      conflict: true,
      merge_record: result.mergeRecord,
      conflict_status: result.conflictStatus,
      conflict_reason: result.conflictReason
    });
  }

  return NextResponse.json({
    conflict: false,
    merge_record: result.mergeRecord,
    document_version: result.documentVersion,
    diff: result.diff
  });
}
