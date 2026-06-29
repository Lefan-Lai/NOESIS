import { OpenAIProvider } from "@/lib/llm/openaiProvider";
import { MockLLMProvider } from "@/lib/llm/mockProvider";
import { assertAllowedModel, getOpenAIModelCatalog } from "@/lib/llm/serverModelCatalog";

type ConversationRole = "user" | "assistant" | "system";

export type OrchestratorContextItem = {
  type: string;
  text: string;
  reason?: string;
};

export type OrchestratorMessage = {
  role: ConversationRole;
  content: string;
};

export class LLMOrchestrator {
  async sendChatMessage(params: {
    systemPrompt: string;
    userMessage: string;
    model?: string;
    messages?: OrchestratorMessage[];
    contextItems?: OrchestratorContextItem[];
  }) {
    const catalog = await getOpenAIModelCatalog();
    const model = params.model
      ? await assertAllowedModel(params.model)
      : catalog.defaultModel;
    const input = {
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage,
      model,
      messages: params.messages ?? [],
      contextItems: params.contextItems ?? []
    };

    if (catalog.provider === "mock" || !process.env.OPENAI_API_KEY) {
      const provider = new MockLLMProvider();
      const output = await provider.sendChatMessage(input);

      return {
        provider: "mock" as const,
        model,
        output
      };
    }

    const provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY
    });
    const output = await provider.sendChatMessage(input);

    return {
      provider: "openai" as const,
      model,
      output
    };
  }
}
