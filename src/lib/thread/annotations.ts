import type { Annotation } from "@/types/thread";

type CreateAnnotationParams = {
  documentId: string;
  anchorId: string;
  blockId?: string;
  content: string;
  createdInVersionNodeId: string;
  idSuffix: string;
  now?: string;
};

export function createAnnotation({
  documentId,
  anchorId,
  blockId,
  content,
  createdInVersionNodeId,
  idSuffix,
  now = new Date().toISOString()
}: CreateAnnotationParams): Annotation {
  return {
    id: `annotation-${idSuffix}`,
    documentId,
    anchorId,
    blockId,
    content,
    status: "active",
    contextPolicy: "include",
    includeInContext: true,
    createdInVersionNodeId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

export function deleteAnnotation(
  annotation: Annotation,
  now = new Date().toISOString()
): Annotation {
  return {
    ...annotation,
    content: "",
    status: "deleted",
    contextPolicy: "exclude",
    includeInContext: false,
    deletedAt: now,
    updatedAt: now
  };
}
