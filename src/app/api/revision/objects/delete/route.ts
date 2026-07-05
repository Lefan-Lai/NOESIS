import { NextResponse } from "next/server";
import type { RevisionObjectType } from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    object_type: RevisionObjectType;
    object_id: string;
    reason?: string;
    confirmed?: boolean;
  };

  const result = revisionRepository.deleteObject({
    objectType: body.object_type,
    objectId: body.object_id,
    reason: body.reason ?? "user_deleted_object",
    confirmed: body.confirmed === true,
    actorType: "user"
  });

  return NextResponse.json({
    object: result.object,
    state_transition: result.transition,
    timeline_node: result.timelineNode
  });
}
