import { NextResponse } from "next/server";
import { MockLLMProvider } from "@/lib/llm/mockProvider";
import { OpenAIProvider } from "@/lib/llm/openaiProvider";
import { assertAllowedModel, getOpenAIModelCatalog } from "@/lib/llm/serverModelCatalog";
import type { SemanticAlignmentRow } from "@/types/comparison";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    anchorId?: string;
    row?: SemanticAlignmentRow;
    originalText?: string;
    revisedText?: string;
    localQuestion?: string;
    annotations?: string[];
    contextSummary?: string;
    model?: string;
  };

  if (
    !body.documentId?.trim() ||
    !body.anchorId?.trim() ||
    !body.row ||
    !body.originalText?.trim() ||
    !body.revisedText?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "documentId, anchorId, row, originalText, and revisedText are required"
      },
      { status: 400 }
    );
  }

  const catalog = await getOpenAIModelCatalog();
  const model = body.model
    ? await assertAllowedModel(body.model)
    : catalog.defaultModel;
  const input = {
    documentId: body.documentId,
    anchorId: body.anchorId,
    row: body.row,
    originalText: body.originalText,
    revisedText: body.revisedText,
    localQuestion: body.localQuestion,
    annotations: body.annotations ?? [],
    contextSummary: body.contextSummary,
    model
  };

  if (catalog.provider === "mock" || !process.env.OPENAI_API_KEY) {
    const provider = new MockLLMProvider();
    const output = await provider.generateSemanticDifferenceDetail(input);

    return NextResponse.json({
      provider: "mock",
      model,
      output
    });
  }

  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY
  });
  const output = await provider.generateSemanticDifferenceDetail(input);

  return NextResponse.json({
    provider: "openai",
    model,
    output
  });
}
