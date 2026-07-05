import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    project_id: string;
    conversation_id?: string;
    target_node_id: string;
  };

  return NextResponse.json(
    revisionRepository.previewRevert({
      projectId: body.project_id,
      conversationId: body.conversation_id,
      targetNodeId: body.target_node_id
    })
  );
}
