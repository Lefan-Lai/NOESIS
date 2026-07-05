import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ localThreadId: string }> }
) {
  const { localThreadId } = await params;

  return NextResponse.json({
    merge_records: revisionRepository.getMergeRecordsForLocalThread(localThreadId)
  });
}
