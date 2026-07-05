import { NextResponse } from "next/server";
import type { ComparisonSourceType } from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const objectType = url.searchParams.get("object_type") as ComparisonSourceType | null;
  const objectId = url.searchParams.get("object_id");

  if (!objectType || !objectId) {
    return NextResponse.json({ error: "object_type and object_id are required" }, { status: 400 });
  }

  return NextResponse.json({
    comparisons: revisionRepository.getComparisonsForObject(objectType, objectId)
  });
}
