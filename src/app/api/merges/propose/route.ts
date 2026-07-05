import { NextResponse } from "next/server";
import type { MergeMode, MergeSourceType } from "@/types/revision";
import { MergeService } from "@/services/revision/MergeService";
import { revisionRepository } from "@/services/revision/revisionRepository";

type ProposeBody = {
  projectId: string;
  conversationId?: string;
  sourceType: MergeSourceType;
  sourceId: string;
  mergeMode?: MergeMode;
  manualTargetRange?: {
    start: number;
    end: number;
    selectionId?: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as ProposeBody;

  if (!body.projectId || !body.sourceType || !body.sourceId) {
    return NextResponse.json(
      { error: "projectId, sourceType, and sourceId are required" },
      { status: 400 }
    );
  }

  const result = MergeService.createMergeProposal({
    state: revisionRepository.getState(),
    projectId: body.projectId,
    conversationId: body.conversationId,
    sourceType: body.sourceType,
    sourceId: body.sourceId,
    mergeMode: body.mergeMode,
    manualTargetRange: body.manualTargetRange,
    now: new Date().toISOString(),
    suffix: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  });

  revisionRepository.replaceState(result.state);

  return NextResponse.json({
    merge_record: result.mergeRecord,
    diff: result.diff,
    conflict: result.conflict
  });
}
