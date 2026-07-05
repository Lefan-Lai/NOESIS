import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopeType = url.searchParams.get("scope_type");
  const scopeId = url.searchParams.get("scope_id");

  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: "scope_type and scope_id are required" }, { status: 400 });
  }

  return NextResponse.json({
    comparisons: revisionRepository.getComparisonsByScope(scopeType, scopeId)
  });
}
