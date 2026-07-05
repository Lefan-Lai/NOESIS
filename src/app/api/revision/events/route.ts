import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const objectType = url.searchParams.get("objectType");
  const objectId = url.searchParams.get("objectId");

  if (objectType && objectId) {
    return NextResponse.json({
      events: revisionRepository.getEventsForObject(objectType, objectId)
    });
  }

  if (projectId) {
    return NextResponse.json({
      events: revisionRepository.getEventsForProject(projectId)
    });
  }

  return NextResponse.json(
    { error: "projectId or objectType/objectId is required" },
    { status: 400 }
  );
}
