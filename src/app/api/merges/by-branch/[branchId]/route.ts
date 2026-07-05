import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const { branchId } = await params;

  return NextResponse.json({
    merge_records: revisionRepository.getMergeRecordsForBranch(branchId)
  });
}
