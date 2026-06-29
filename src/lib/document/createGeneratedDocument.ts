import type { AnswerBlock, Document, VersionSnapshot } from "@/types/document";
import type { VersionNode } from "@/types/version";
import type { GenerateDocumentOutput } from "@/lib/llm/LLMProvider";

function splitIntoSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitGeneratedSentences(text: string) {
  return (
    text
      .replace(/\s+/g, " ")
      .match(/[^.!?。！？]+[.!?。！？]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  );
}

function normalizeSections(output: GenerateDocumentOutput) {
  if (output.sections?.length) {
    return output.sections;
  }

  const paragraphs =
    output.paragraphs?.length
      ? output.paragraphs
      : (output.answer ?? "")
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean);

  return paragraphs.map((paragraph, index) => ({
    heading: index === 0 ? "Generated Answer" : `Section ${index + 1}`,
    summary: index === 0 ? "Main generated answer" : `Generated section ${index + 1}`,
    paragraphs: [paragraph],
    sentenceSummaries: splitGeneratedSentences(paragraph).map((sentence) =>
      sentence.length > 58 ? `${sentence.slice(0, 55)}...` : sentence
    )
  }));
}

export function createGeneratedDocumentState(
  output: GenerateDocumentOutput,
  idSuffix: string,
  now = new Date().toISOString(),
  options?: {
    documentId?: string;
    rootVersionNodeId?: string;
    parentVersionNodeId?: string;
  }
) {
  const documentId = options?.documentId ?? `doc-${idSuffix}`;
  const rootVersionNodeId =
    options?.parentVersionNodeId ? `v-main-answer-${idSuffix}` : `v-created-${idSuffix}`;
  const documentRootVersionNodeId = options?.rootVersionNodeId ?? rootVersionNodeId;
  const rawText =
    output.answer ??
    output.sections
      ?.flatMap((section) => section.paragraphs)
      .join("\n\n") ??
    output.paragraphs?.join("\n\n") ??
    "";
  const blocks: AnswerBlock[] = [];
  let order = 1;

  normalizeSections(output).forEach((section, paragraphIndex) => {
    const heading: AnswerBlock = {
      id: `p-${idSuffix}-${paragraphIndex + 1}`,
      documentId,
      blockType: "heading",
      text: section.heading || `Section ${paragraphIndex + 1}`,
      summary: section.summary,
      order,
      anchorable: false,
      createdInVersionNodeId: rootVersionNodeId,
      deletedInVersionNodeId: null,
      createdAt: now,
      updatedAt: now
    };
    blocks.push(heading);
    order += 1;

    let sentenceIndex = 0;

    for (const paragraph of section.paragraphs) {
      for (const sentence of splitGeneratedSentences(paragraph)) {
        blocks.push({
          id: `s-${idSuffix}-${order}`,
          documentId,
          blockType: "sentence",
          text: sentence,
          summary:
            section.sentenceSummaries?.[sentenceIndex] ??
            (sentence.length > 58 ? `${sentence.slice(0, 55)}...` : sentence),
          order,
          anchorable: true,
          createdInVersionNodeId: rootVersionNodeId,
          deletedInVersionNodeId: null,
          createdAt: now,
          updatedAt: now
        });
        order += 1;
        sentenceIndex += 1;
      }
    }
  });

  const document: Document = {
    id: documentId,
    title: output.title || "Generated Document",
    rawText,
    rootVersionNodeId: documentRootVersionNodeId,
    activeVersionNodeId: rootVersionNodeId,
    createdAt: now,
    updatedAt: now
  };

  const versionNode: VersionNode = {
    id: rootVersionNodeId,
    documentId,
    parentId: options?.parentVersionNodeId ?? null,
    childIds: [],
    nodeType: options?.parentVersionNodeId
      ? "document_revised"
      : "document_created",
    label: options?.parentVersionNodeId
      ? "Main answer updated"
      : "LLM document generated",
    isActivePath: true,
    createdAt: now
  };

  const snapshot: VersionSnapshot = {
    id: `snap-${rootVersionNodeId}`,
    documentId,
    versionNodeId: rootVersionNodeId,
    blocks,
    createdAt: now
  };

  return {
    document,
    blocks,
    versionNode,
    snapshot
  };
}
