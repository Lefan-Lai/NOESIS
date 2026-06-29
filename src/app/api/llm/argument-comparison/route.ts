import { NextResponse } from "next/server";
import { OpenAIProvider } from "@/lib/llm/openaiProvider";
import { MockLLMProvider } from "@/lib/llm/mockProvider";
import { assertAllowedModel, getOpenAIModelCatalog } from "@/lib/llm/serverModelCatalog";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    anchorId?: string;
    createdInVersionNodeId?: string;
    originalText?: string;
    revisedText?: string;
    localQuestion?: string;
    localAnswer?: string;
    model?: string;
    contextItems?: Array<{
      type: string;
      text: string;
      reason?: string;
    }>;
  };

  if (
    !body.documentId?.trim() ||
    !body.anchorId?.trim() ||
    !body.createdInVersionNodeId?.trim() ||
    !body.originalText?.trim() ||
    !body.revisedText?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "documentId, anchorId, createdInVersionNodeId, originalText, and revisedText are required"
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
    createdInVersionNodeId: body.createdInVersionNodeId,
    originalText: body.originalText,
    revisedText: body.revisedText,
    localQuestion: body.localQuestion,
    localAnswer: body.localAnswer,
    contextItems: body.contextItems ?? [],
    model
  };

  if (catalog.provider === "mock" || !process.env.OPENAI_API_KEY) {
    const provider = new MockLLMProvider();
    const output = await provider.generateArgumentComparison(input);

    return NextResponse.json({
      provider: "mock",
      model,
      output
    });
  }

  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY
  });
  const output = await provider.generateArgumentComparison(input);

  return NextResponse.json({
    provider: "openai",
    model,
    output
  });
}
