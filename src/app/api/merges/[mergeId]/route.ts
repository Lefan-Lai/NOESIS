import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mergeId: string }> }
) {
  const { mergeId } = await params;
  const mergeRecord = revisionRepository.getMergeRecord(mergeId);

  if (!mergeRecord) {
    return NextResponse.json({ error: "MergeRecord not found" }, { status: 404 });
  }

  return NextResponse.json({ merge_record: mergeRecord });
}
