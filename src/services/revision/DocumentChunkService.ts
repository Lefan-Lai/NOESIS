import type {
  DocumentChunkModel,
  DocumentVersionModel,
  RevisionRepositoryState
} from "@/types/revision";
import { hashContent } from "./DiffService";
import { MigrationTrackingService } from "./MigrationTrackingService";
import { WorkspaceObservabilityService } from "./WorkspaceObservabilityService";

const TARGET_MIN_TOKENS = 500;
const TARGET_MAX_TOKENS = 1000;

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

function paragraphRanges(content: string) {
  const ranges: Array<{
    text: string;
    startOffset: number;
    endOffset: number;
    paragraphIndex: number;
    sectionTitle?: string;
  }> = [];
  const paragraphPattern = /[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g;
  let match: RegExpExecArray | null;
  let paragraphIndex = 0;
  let currentSectionTitle: string | undefined;

  while ((match = paragraphPattern.exec(content)) !== null) {
    const text = match[0].trim();

    if (!text) {
      continue;
    }

    if (text.length <= 120 && !/[。.!?？]$/.test(text)) {
      currentSectionTitle = text;
    }

    ranges.push({
      text,
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      paragraphIndex,
      sectionTitle: currentSectionTitle
    });
    paragraphIndex += 1;
  }

  if (ranges.length === 0 && content.trim()) {
    ranges.push({
      text: content.trim(),
      startOffset: 0,
      endOffset: content.length,
      paragraphIndex: 0
    });
  }

  return ranges;
}

function buildChunks(
  version: DocumentVersionModel,
  now: string
): DocumentChunkModel[] {
  const paragraphs = paragraphRanges(version.content);
  const chunks: DocumentChunkModel[] = [];
  let buffer: typeof paragraphs = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }

    const content = buffer.map((paragraph) => paragraph.text).join("\n\n");
    const startOffset = buffer[0].startOffset;
    const endOffset = buffer[buffer.length - 1].endOffset;
    const chunkIndex = chunks.length;
    const chunk: DocumentChunkModel = {
      id: `document-chunk-${version.id}-${chunkIndex}`,
      documentChunkId: `document-chunk-${version.id}-${chunkIndex}`,
      projectId: version.projectId,
      conversationId: version.conversationId,
      documentVersionId: version.id,
      chunkIndex,
      startOffset,
      endOffset,
      content,
      contentHash: hashContent(content),
      tokenEstimate: tokenEstimate(content),
      sectionTitle: buffer[0].sectionTitle,
      paragraphIndex: buffer[0].paragraphIndex,
      status: version.status === "deleted" ? "deleted" : "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        source_document_version_id: version.id,
        source_content_hash: version.contentHash
      }
    };
    chunks.push(chunk);
    buffer = [];
    bufferTokens = 0;
  };

  for (const paragraph of paragraphs) {
    const nextTokens = tokenEstimate(paragraph.text);
    const shouldFlush =
      buffer.length > 0 &&
      bufferTokens >= TARGET_MIN_TOKENS &&
      bufferTokens + nextTokens > TARGET_MAX_TOKENS;

    if (shouldFlush) {
      flush();
    }

    buffer.push(paragraph);
    bufferTokens += nextTokens;
  }

  flush();

  return chunks;
}

export class DocumentChunkService {
  static createChunksForDocumentVersion(input: {
    state: RevisionRepositoryState;
    documentVersionId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const version = input.state.documentVersions[input.documentVersionId];

    if (!version) {
      throw new Error("DocumentVersion not found");
    }

    const existing = Object.values(input.state.documentChunks).filter(
      (chunk) => chunk.documentVersionId === version.id
    );

    if (existing.length > 0) {
      return {
        state: input.state,
        chunks: existing.sort((a, b) => a.chunkIndex - b.chunkIndex),
        created: false
      };
    }

    const chunks = buildChunks(version, now);
    let state: RevisionRepositoryState = {
      ...input.state,
      documentChunks: {
        ...input.state.documentChunks,
        ...Object.fromEntries(chunks.map((chunk) => [chunk.id, chunk]))
      }
    };
    state = WorkspaceObservabilityService.recordMetric({
      state,
      name: "document_chunk_create_latency_ms",
      value: 0,
      unit: "ms",
      projectId: version.projectId,
      conversationId: version.conversationId,
      now,
      metadata: {
        chunk_count: chunks.length,
        document_version_id: version.id
      }
    }).state;
    state = MigrationTrackingService.createSystemEvent({
      state,
      eventType: "document.chunks.created",
      objectType: "document_version",
      objectId: version.id,
      projectId: version.projectId,
      now,
      payload: {
        conversation_id: version.conversationId,
        document_version_id: version.id,
        chunk_count: chunks.length,
        chunk_ids: chunks.map((chunk) => chunk.id),
        content_hash: version.contentHash
      }
    });

    return {
      state,
      chunks,
      created: true
    };
  }

  static getChunksForVersion(
    state: Pick<RevisionRepositoryState, "documentChunks">,
    documentVersionId: string
  ) {
    return Object.values(state.documentChunks)
      .filter((chunk) => chunk.documentVersionId === documentVersionId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  static getChunkAroundOffset(
    state: Pick<RevisionRepositoryState, "documentChunks">,
    documentVersionId: string,
    offset: number
  ) {
    return DocumentChunkService.getChunksForVersion(state, documentVersionId).find(
      (chunk) => chunk.startOffset <= offset && chunk.endOffset >= offset
    );
  }

  static getChunksForRange(
    state: Pick<RevisionRepositoryState, "documentChunks">,
    documentVersionId: string,
    startOffset: number,
    endOffset: number
  ) {
    return DocumentChunkService.getChunksForVersion(state, documentVersionId).filter(
      (chunk) =>
        chunk.endOffset >= startOffset &&
        chunk.startOffset <= endOffset &&
        chunk.status !== "deleted"
    );
  }
}
