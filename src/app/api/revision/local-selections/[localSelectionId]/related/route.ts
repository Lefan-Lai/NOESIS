import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ localSelectionId: string }> }
) {
  const { localSelectionId } = await params;

  return NextResponse.json(
    revisionRepository.getRelatedObjectsForLocalSelection(localSelectionId)
  );
}
