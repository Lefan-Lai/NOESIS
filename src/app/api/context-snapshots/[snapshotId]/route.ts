import { NextResponse } from "next/server";
import { ContextSnapshotService } from "@/services/revision/ContextSnapshotService";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params;
  const snapshot = revisionRepository.getState().contextSnapshots[snapshotId];

  if (!snapshot) {
    return NextResponse.json({ error: "Context snapshot not found" }, { status: 404 });
  }

  return NextResponse.json({
    snapshotId,
    summary: ContextSnapshotService.getContextReviewSummary(snapshot)
  });
}
