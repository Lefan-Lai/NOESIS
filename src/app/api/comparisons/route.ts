import { NextResponse } from "next/server";
import type { AnnotationScopeType, ComparisonSourceType } from "@/types/revision";
import { revisionRepository } from "@/services/revision/revisionRepository";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    project_id: string;
    conversation_id?: string;
    title?: string;
    description?: string;
    scope_type?: AnnotationScopeType | "comparison" | "document";
    scope_id?: string;
    sources: Array<{ object_type: ComparisonSourceType; object_id: string }>;
    model?: string;
    model_provider?: "openai" | "mock";
    allow_non_active_sources?: boolean;
  };

  const result = revisionRepository.createComparison({
    projectId: body.project_id,
    conversationId: body.conversation_id,
    title: body.title,
    description: body.description,
    scopeType: body.scope_type,
    scopeId: body.scope_id,
    sources: body.sources.map((source) => ({
      objectType: source.object_type,
      objectId: source.object_id
    })),
    model: body.model ?? "gpt-5.5",
    modelProvider: body.model_provider ?? "mock",
    allowNonActiveSources: body.allow_non_active_sources,
    now: new Date().toISOString(),
    suffix: Date.now().toString(36)
  });

  return NextResponse.json({
    comparison: result.comparison,
    active_run: result.run
  });
}
