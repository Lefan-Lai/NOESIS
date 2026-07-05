import { NextResponse } from "next/server";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ llmCallId: string }> }
) {
  const { llmCallId } = await params;
  const call = revisionRepository.getLLMCallRecord(llmCallId);

  if (!call) {
    return NextResponse.json(
      { error: "llm call record not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    llm_call: {
      id: call.id,
      project_id: call.projectId,
      call_type: call.callType,
      purpose: call.purpose,
      model: call.model,
      provider: call.provider,
      status: call.status,
      thread_id: call.threadId,
      session_id: call.sessionId,
      window_id: call.windowId,
      document_id: call.documentId,
      active_version_node_id: call.activeVersionNodeId,
      comparison_id: call.comparisonId,
      context_snapshot_id: call.contextSnapshotId,
      output_message_id: call.outputMessageId,
      output_object_id: call.outputObjectId,
      created_at: call.createdAt,
      completed_at: call.completedAt
    }
  });
}
