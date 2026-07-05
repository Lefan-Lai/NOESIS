import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ llmCallId: string }> }
) {
  const { llmCallId } = await params;
  const snapshot = revisionRepository.getContextSnapshotForLLMCall(llmCallId);

  if (!snapshot) {
    return NextResponse.json(
      { error: "context snapshot not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ snapshot });
}
