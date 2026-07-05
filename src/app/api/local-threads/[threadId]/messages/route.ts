import { NextResponse } from "next/server";
import { OpenAIProvider } from "@/lib/llm/openaiProvider";
import { MockLLMProvider } from "@/lib/llm/mockProvider";
import {
  assertAllowedModel,
  getOpenAIModelCatalog
} from "@/lib/llm/serverModelCatalog";
import { LocalThreadMessageService } from "@/services/revision/LocalThreadMessageService";
import { LocalThreadQueryService } from "@/services/revision/LocalThreadQueryService";
import { revisionRepository } from "@/services/revision/revisionRepository";
import type { DocumentVersionModel } from "@/types/revision";

function makeIdSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const after = url.searchParams.get("after") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const state = revisionRepository.getState();
  const thread = state.localThreads[threadId];

  if (!thread) {
    return NextResponse.json({ error: "Local thread not found" }, { status: 404 });
  }

  return NextResponse.json(
    LocalThreadQueryService.getMessagePage({
      state,
      threadId,
      before,
      after,
      limit
    })
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await request.json()) as {
    question?: string;
    model?: string;
    windowId?: string;
    documentId?: string;
    activeVersionNodeId?: string;
    activeDocumentVersion?: DocumentVersionModel;
  };

  if (!body.question?.trim()) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 }
    );
  }

  const state = revisionRepository.getState();
  const localThread = state.localThreads[threadId];

  if (!localThread || localThread.status !== "active") {
    return NextResponse.json(
      { error: "active local thread not found" },
      { status: 404 }
    );
  }

  const selection = state.textSelections[localThread.sourceSelectionId];

  if (!selection) {
    return NextResponse.json(
      { error: "source text selection not found" },
      { status: 404 }
    );
  }

  const localSelection = localThread.parentLocalSelectionId
    ? state.localSelections[localThread.parentLocalSelectionId]
    : undefined;

  const catalog = await getOpenAIModelCatalog();
  const model = body.model
    ? await assertAllowedModel(body.model)
    : catalog.defaultModel;
  const now = new Date().toISOString();
  const suffix = makeIdSuffix();
  const started = LocalThreadMessageService.createStartedLocalSend({
    state,
    projectId: localThread.projectId,
    localThreadId: threadId,
    question: body.question,
    model,
    windowId: body.windowId,
    documentId: body.documentId,
    activeVersionNodeId: body.activeVersionNodeId,
    activeDocumentVersion: body.activeDocumentVersion,
    now,
    suffix
  });

  revisionRepository.mergeState(started.state);

  const contextItems = started.contextSnapshot.includedItems.map((item) => ({
    type: item.type,
    text: item.text,
    reason: item.reason
  }));
  const messages = Object.values(started.state.revisionMessages)
    .filter(
      (message) =>
        message.threadId === threadId &&
        message.status !== "deleted" &&
        message.includeInContext
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .map((message) => ({
      role: message.role === "tool" ? ("assistant" as const) : message.role,
      content: message.content
    }));
  const provider =
    catalog.provider === "mock" || !process.env.OPENAI_API_KEY
      ? new MockLLMProvider()
      : new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY
        });
  const output = await provider.answerLocalQuestion({
    anchorText: localSelection?.selectedText ?? selection.selectedText,
    question: body.question,
    messages,
    contextItems,
    model
  });
  const completedAt = new Date().toISOString();
  const completed = LocalThreadMessageService.completeLocalSend({
    state: started.state,
    projectId: localThread.projectId,
    localThreadId: threadId,
    question: body.question,
    answer: output.answer,
    model,
    provider: provider instanceof MockLLMProvider ? "mock" : "openai",
    llmCallId: started.llmCallRecord.id,
    contextSnapshotId: started.contextSnapshot.id,
    userMessageId: started.userMessage.id,
    userTimelineNodeId: started.timelineNodes[0].id,
    now: completedAt,
    suffix
  });

  revisionRepository.mergeState(completed.state);

  return NextResponse.json({
    provider: provider instanceof MockLLMProvider ? "mock" : "openai",
    model,
    output,
    records: {
      userMessage: started.userMessage,
      assistantMessage: completed.assistantMessage,
      localThread: completed.localThread,
      selection: completed.selection,
      localSelection,
      contextSnapshot: started.contextSnapshot,
      llmCallRecord: completed.llmCallRecord,
      events: [...started.events, ...completed.events],
      timelineNodes: [...started.timelineNodes, ...completed.timelineNodes],
      timelineEdges: [...started.timelineEdges, ...completed.timelineEdges]
    },
    state: completed.state
  });
}
