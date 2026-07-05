import { NextResponse } from "next/server";
import type {
  AnnotationScopeType,
  AnnotationSourceType
} from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeType = searchParams.get("scopeType") as AnnotationScopeType | null;
  const scopeId = searchParams.get("scopeId");
  const sourceType = searchParams.get("sourceType") as AnnotationSourceType | null;
  const sourceId = searchParams.get("sourceId");

  return NextResponse.json(
    revisionRepository.getRelatedAnnotations({
      scopeType: scopeType ?? undefined,
      scopeId: scopeId ?? undefined,
      sourceType: sourceType ?? undefined,
      sourceId: sourceId ?? undefined
    })
  );
}
