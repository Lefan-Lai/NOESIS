import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ selectionId: string }> }
) {
  const { selectionId } = await params;

  return NextResponse.json(
    revisionRepository.getRelatedObjectsForSelection(selectionId)
  );
}
