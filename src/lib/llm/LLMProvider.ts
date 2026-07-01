import type {
  ArgumentComparison,
  SemanticAlignmentRow,
  SemanticDifferenceDetail
} from "@/types/comparison";

export type GenerateDocumentInput = {
  prompt: string;
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  contextItems?: Array<{
    type: string;
    text: string;
    reason?: string;
  }>;
  model?: string;
};

export type GenerateDocumentSection = {
  heading: string;
  summary?: string;
  paragraphs: string[];
  sentenceSummaries?: string[];
};

export type GenerateDocumentOutput = {
  title: string;
  answer?: string;
  sections?: GenerateDocumentSection[];
  paragraphs?: string[];
};

export type LocalQuestionInput = {
  anchorText: string;
  question: string;
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  contextItems?: Array<{
    type: string;
    text: string;
    reason?: string;
  }>;
  model?: string;
};

export type LocalQuestionOutput = {
  answer: string;
  revisedText?: string;
};

export type ArgumentComparisonInput = {
  documentId: string;
  anchorId: string;
  createdInVersionNodeId: string;
  originalText: string;
  revisedText: string;
  localQuestion?: string;
  localAnswer?: string;
  contextItems?: Array<{
    type: string;
    text: string;
    reason?: string;
  }>;
  model?: string;
};

export type ArgumentComparisonOutput = {
  comparison: ArgumentComparison;
};

export type SemanticDifferenceDetailInput = {
  documentId: string;
  anchorId: string;
  row: SemanticAlignmentRow;
  originalText: string;
  revisedText: string;
  localQuestion?: string;
  annotations?: string[];
  contextSummary?: string;
  model?: string;
};

export type SemanticDifferenceDetailOutput = {
  detail: SemanticDifferenceDetail;
};

export type ChatMessageInput = {
  systemPrompt: string;
  userMessage: string;
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  contextItems?: Array<{
    type: string;
    text: string;
    reason?: string;
  }>;
  model?: string;
};

export type ChatMessageOutput = {
  answer: string;
};

export interface LLMProvider {
  generateDocument(input: GenerateDocumentInput): Promise<GenerateDocumentOutput>;
  answerLocalQuestion(input: LocalQuestionInput): Promise<LocalQuestionOutput>;
  generateArgumentComparison(
    input: ArgumentComparisonInput
  ): Promise<ArgumentComparisonOutput>;
  generateSemanticDifferenceDetail(
    input: SemanticDifferenceDetailInput
  ): Promise<SemanticDifferenceDetailOutput>;
  sendChatMessage(input: ChatMessageInput): Promise<ChatMessageOutput>;
}
