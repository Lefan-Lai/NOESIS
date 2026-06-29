import type {
  ArgumentComparisonInput,
  ArgumentComparisonOutput,
  ChatMessageInput,
  ChatMessageOutput,
  GenerateDocumentInput,
  GenerateDocumentOutput,
  LLMProvider,
  LocalQuestionInput,
  LocalQuestionOutput
} from "./LLMProvider";
import { createArgumentComparisonFromTexts } from "@/lib/comparison/createArgumentComparison";

export class MockLLMProvider implements LLMProvider {
  async generateDocument(
    input: GenerateDocumentInput
  ): Promise<GenerateDocumentOutput> {
    const turnCount = input.messages?.filter((message) => message.role !== "system").length ?? 0;
    return {
      title: input.prompt,
      answer: `Mock session turn ${turnCount + 1}: ${input.prompt}\n\nThis main answer is rendered as normal document text. The app may still derive semantic blocks and structure metadata in the background, but those metadata are not displayed as JSON in the main answer body.\n\nYou can select any passage with the mouse to open a local branch window.`
    };
  }

  async answerLocalQuestion(
    input: LocalQuestionInput
  ): Promise<LocalQuestionOutput> {
    const trimmedAnchor = input.anchorText.replace(/\s+/g, " ").trim();
    const turnCount = input.messages?.filter((message) => message.role !== "system").length ?? 0;

    return {
      answer: `Mock branch turn ${turnCount + 1}: I would answer using this branch window's own message history, selected block, and active annotations. The selected block is: "${trimmedAnchor}".`,
      revisedText: `Branch revision considering "${input.question}": ${trimmedAnchor}`
    };
  }

  async generateArgumentComparison(
    input: ArgumentComparisonInput
  ): Promise<ArgumentComparisonOutput> {
    return {
      comparison: createArgumentComparisonFromTexts({
        idSuffix: `mock-${Date.now().toString(36)}`,
        documentId: input.documentId,
        anchorId: input.anchorId,
        originalText: input.originalText,
        revisedText: input.revisedText,
        createdInVersionNodeId: input.createdInVersionNodeId
      })
    };
  }

  async sendChatMessage(input: ChatMessageInput): Promise<ChatMessageOutput> {
    const turnCount = input.messages?.filter((message) => message.role !== "system").length ?? 0;

    return {
      answer: `Mock chat turn ${turnCount + 1}: ${input.userMessage}. This response used the current window session, selected model, and scoped context.`
    };
  }
}
