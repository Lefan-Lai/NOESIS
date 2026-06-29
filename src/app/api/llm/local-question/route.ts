import { NextResponse } from "next/server";
import { OpenAIProvider } from "@/lib/llm/openaiProvider";
import { MockLLMProvider } from "@/lib/llm/mockProvider";
import { assertAllowedModel, getOpenAIModelCatalog } from "@/lib/llm/serverModelCatalog";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    anchorText?: string;
    question?: string;
    model?: string;
    messages?: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>;
    contextItems?: Array<{
      type: string;
      text: string;
      reason?: string;
    }>;
  };

  if (!body.anchorText?.trim() || !body.question?.trim()) {
    return NextResponse.json(
      { error: "anchorText and question are required" },
      { status: 400 }
    );
  }

  const catalog = await getOpenAIModelCatalog();
  const model = body.model
    ? await assertAllowedModel(body.model)
    : catalog.defaultModel;

  if (catalog.provider === "mock" || !process.env.OPENAI_API_KEY) {
    const provider = new MockLLMProvider();
    const output = await provider.answerLocalQuestion({
      anchorText: body.anchorText,
      question: body.question,
      messages: body.messages ?? [],
      contextItems: body.contextItems ?? [],
      model
    });

    return NextResponse.json({
      provider: "mock",
      model,
      output
    });
  }

  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY
  });
  const output = await provider.answerLocalQuestion({
    anchorText: body.anchorText,
    question: body.question,
    messages: body.messages ?? [],
    contextItems: body.contextItems ?? [],
    model
  });

  return NextResponse.json({
    provider: "openai",
    model,
    output
  });
}
