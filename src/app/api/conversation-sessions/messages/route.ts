import { NextResponse } from "next/server";
import { LLMOrchestrator } from "@/services/llm/LLMOrchestrator";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    windowId?: string;
    sessionId?: string;
    windowType?: string;
    model?: string;
    userMessage?: string;
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

  if (!body.windowId?.trim() || !body.sessionId?.trim() || !body.userMessage?.trim()) {
    return NextResponse.json(
      { error: "windowId, sessionId, and userMessage are required" },
      { status: 400 }
    );
  }

  const systemPrompt =
    body.windowType === "tree_compare"
      ? "You are an assistant inside a Layered Comparison Board window. Answer questions using the provided comparison board JSON, selected row if present, and scoped session history. Explain differences in terms of meaning, structure, evidence, risks, and merge consequences. Do not invent content outside the provided board and source context."
      : body.windowType === "local_branch"
        ? "You are an assistant inside a Local Branch Window. Continue this branch conversation using only this window's session history and scoped context. Help the user inspect, revise, validate, or expand the selected block."
        : "You are an assistant inside a Main Answer Window. Continue this window conversation using only this session history and scoped context.";

  const orchestrator = new LLMOrchestrator();
  const result = await orchestrator.sendChatMessage({
    systemPrompt,
    userMessage: body.userMessage,
    model: body.model,
    messages: body.messages ?? [],
    contextItems: body.contextItems ?? []
  });

  return NextResponse.json(result);
}
