import { describe, expect, it } from "vitest";
import { initialData, mockDocument } from "@/data/mockData";
import { buildContextPreview } from "@/lib/context/buildContextForLLM";
import { checkoutVersionNode } from "@/lib/version/checkoutVersionNode";
import { computeActivePath } from "@/lib/version/computeActivePath";
import { createRevisionBranch } from "@/lib/thread/createBranch";
import { createAnnotation, deleteAnnotation } from "@/lib/thread/annotations";
import { deleteLocalAnswerPermanently } from "@/lib/thread/deleteAnswer";
import { discardThread } from "@/lib/thread/discardThread";
import {
  filterUsableModels,
  PREFERRED_DEFAULT_MODEL,
  prioritizePreferredDefaultModel
} from "@/lib/llm/modelCatalog";
import { applyBoardJsonFilter } from "@/components/comparison/LayeredComparisonBoard";
import type { ComparisonRow } from "@/types/comparison";
import type { Annotation } from "@/types/thread";
import type { VersionNode } from "@/types/version";

function cloneData() {
  return structuredClone({
    documents: {
      [mockDocument.id]: mockDocument
    },
    anchors: initialData.anchors,
    threads: initialData.threads,
    messages: initialData.messages,
    annotations: {} as Record<string, Annotation>,
    versionNodes: initialData.versionNodes,
    snapshots: initialData.snapshots,
    comparisons: initialData.comparisons
  });
}

describe("Answer Atlas context and version rules", () => {
  it("retains discarded answers but excludes them from context by default", () => {
    const state = cloneData();
    const thread = state.threads["thread-s4"];
    const messages = Object.values(state.messages).filter(
      (message) => message.threadId === thread.id
    );
    const result = discardThread(thread, messages);

    state.threads[thread.id] = result.thread;
    for (const message of result.messages) {
      state.messages[message.id] = message;
    }

    const preview = buildContextPreview(
      {
        documentId: mockDocument.id,
        activeVersionNodeId: mockDocument.activeVersionNodeId,
        anchorId: "anchor-s4",
        purpose: "local_question"
      },
      state
    );

    expect(result.thread.status).toBe("discarded");
    expect(result.thread.visibility).toBe("hidden");
    expect(result.thread.contextPolicy).toBe("exclude");
    expect(result.messages.every((message) => !message.includeInContext)).toBe(true);
    expect(
      preview.includedItems.some((item) => item.sourceId === "msg-s4-assistant")
    ).toBe(false);
    expect(
      preview.excludedItems.some((item) => item.sourceId === "msg-s4-assistant")
    ).toBe(true);
  });

  it("excludes deleted answers from future LLM context", () => {
    const state = cloneData();
    const thread = state.threads["thread-s4"];
    const messages = Object.values(state.messages).filter(
      (message) => message.threadId === thread.id
    );
    const result = deleteLocalAnswerPermanently(thread, messages);

    state.threads[thread.id] = result.thread;
    for (const message of result.messages) {
      state.messages[message.id] = message;
    }

    const preview = buildContextPreview(
      {
        documentId: mockDocument.id,
        activeVersionNodeId: mockDocument.activeVersionNodeId,
        anchorId: "anchor-s4",
        purpose: "local_question"
      },
      state
    );

    expect(result.thread.status).toBe("deleted");
    expect(result.thread.contextPolicy).toBe("exclude");
    expect(result.messages.every((message) => message.content === "")).toBe(true);
    expect(
      preview.includedItems.some((item) => item.sourceId === "msg-s4-assistant")
    ).toBe(false);
  });

  it("revert marks future nodes inactive and removes them from active path", () => {
    const state = cloneData();
    const result = checkoutVersionNode(
      state.documents[mockDocument.id],
      state.versionNodes,
      "v-selected"
    );

    expect(result.document.activeVersionNodeId).toBe("v-selected");
    expect(result.activePath).toEqual(["v-created", "v-selected"]);
    expect(result.versionNodes["v-local-answer"].isActivePath).toBe(false);
    expect(result.versionNodes["v-branch-created"].isActivePath).toBe(false);
  });

  it("creates a new active branch from the reverted node", () => {
    const state = cloneData();
    const checkout = checkoutVersionNode(
      state.documents[mockDocument.id],
      state.versionNodes,
      "v-selected"
    );
    const branchResult = createRevisionBranch({
      documentId: mockDocument.id,
      activeVersionNodeId: checkout.document.activeVersionNodeId,
      anchorId: "anchor-s4",
      thread: state.threads["thread-s4"],
      idSuffix: "test"
    });
    const versionNodes: Record<string, VersionNode> = {
      ...checkout.versionNodes,
      [branchResult.node.id]: branchResult.node,
      "v-selected": {
        ...checkout.versionNodes["v-selected"],
        childIds: [
          ...checkout.versionNodes["v-selected"].childIds,
          branchResult.node.id
        ]
      }
    };
    const activePath = computeActivePath(
      versionNodes,
      mockDocument.rootVersionNodeId,
      branchResult.node.id
    );

    expect(activePath).toEqual(["v-created", "v-selected", "v-branch-test"]);
    expect(activePath.includes("v-local-answer")).toBe(false);
  });

  it("uses layered comparison board as the default comparison data", () => {
    const state = cloneData();
    const comparison = Object.values(state.comparisons)[0];

    expect(comparison.board.board_id).toBe("comparison-s4");
    expect(comparison.board.summary.overall_summary).toContain("revision");
    expect(comparison.board.levels.length).toBeGreaterThan(0);
    expect(comparison.board.levels[0].rows.length).toBeGreaterThan(0);
  });

  it("includes active sentence annotations in LLM context", () => {
    const state = cloneData();
    const annotation = createAnnotation({
      documentId: mockDocument.id,
      anchorId: "anchor-s4",
      blockId: "s4",
      content: "Future revisions should make this sentence more cautious.",
      createdInVersionNodeId: mockDocument.activeVersionNodeId,
      idSuffix: "test"
    });
    state.annotations[annotation.id] = annotation;

    const preview = buildContextPreview(
      {
        documentId: mockDocument.id,
        activeVersionNodeId: mockDocument.activeVersionNodeId,
        anchorId: "anchor-s4",
        purpose: "local_question"
      },
      state
    );

    expect(
      preview.includedItems.some((item) => item.sourceId === annotation.id)
    ).toBe(true);
  });

  it("excludes deleted annotations from LLM context", () => {
    const state = cloneData();
    const annotation = createAnnotation({
      documentId: mockDocument.id,
      anchorId: "anchor-s4",
      blockId: "s4",
      content: "Do not make absolute claims.",
      createdInVersionNodeId: mockDocument.activeVersionNodeId,
      idSuffix: "deleted-test"
    });
    state.annotations[annotation.id] = deleteAnnotation(annotation);

    const preview = buildContextPreview(
      {
        documentId: mockDocument.id,
        activeVersionNodeId: mockDocument.activeVersionNodeId,
        anchorId: "anchor-s4",
        purpose: "local_question"
      },
      state
    );

    expect(
      preview.includedItems.some((item) => item.sourceId === annotation.id)
    ).toBe(false);
  });

  it("filters selectable models by API visibility and configured allowlist", () => {
    const models = filterUsableModels(
      [
        { id: "gpt-allowed" },
        { id: "gpt-not-allowed" },
        { id: "text-embedding-3-large" }
      ],
      ["gpt-allowed", "gpt-missing"]
    );

    expect(models).toEqual(["gpt-allowed"]);
  });

  it("promotes GPT-5.5 as the default selectable model", () => {
    const models = prioritizePreferredDefaultModel(["gpt-4.1", "gpt-5"]);

    expect(models[0]).toBe(PREFERRED_DEFAULT_MODEL);
    expect(models).toEqual(["gpt-5.5", "gpt-4.1", "gpt-5"]);
  });

  it("filters layered comparison board rows by difference and importance", () => {
    const baseRow: ComparisonRow = {
      row_id: "row-base",
      shared_topic: "Topic",
      original: {
        title: "Original",
        short_summary: "Original summary",
        full_text: "Original text"
      },
      revised: {
        title: "Revised",
        short_summary: "Revised summary",
        full_text: "Revised text"
      },
      difference: "same",
      importance: "low",
      short_explanation: "Same meaning"
    };
    const rows: ComparisonRow[] = [
      { ...baseRow, row_id: "same" },
      { ...baseRow, row_id: "changed", difference: "refined" },
      { ...baseRow, row_id: "replaced", difference: "replaced", importance: "high" },
      {
        ...baseRow,
        row_id: "added",
        difference: "added",
        original: null
      },
      {
        ...baseRow,
        row_id: "removed",
        difference: "removed",
        revised: null
      },
      {
        ...baseRow,
        row_id: "conflict",
        difference: "conflict",
        importance: "high"
      },
      { ...baseRow, row_id: "important", importance: "high" }
    ];

    expect(applyBoardJsonFilter(rows, "changed").map((row) => row.row_id))
      .toEqual(["changed", "replaced"]);
    expect(applyBoardJsonFilter(rows, "added").map((row) => row.row_id))
      .toEqual(["added"]);
    expect(applyBoardJsonFilter(rows, "removed").map((row) => row.row_id))
      .toEqual(["removed"]);
    expect(applyBoardJsonFilter(rows, "conflicts").map((row) => row.row_id))
      .toEqual(["conflict"]);
    expect(applyBoardJsonFilter(rows, "important").map((row) => row.row_id))
      .toEqual(["replaced", "conflict", "important"]);
  });
});
