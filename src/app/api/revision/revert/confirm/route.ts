import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    project_id: string;
    conversation_id?: string;
    target_node_id: string;
  };

  const result = revisionRepository.confirmRevert({
    projectId: body.project_id,
    conversationId: body.conversation_id,
    targetNodeId: body.target_node_id
  });

  return NextResponse.json({
    revert_record: result.revertRecord,
    timeline_path: result.timelinePath,
    timeline_node: result.timelineNode,
    preview: result.preview
  });
}
