"use client";

import { useState } from "react";
import { Bot, Eye, Trash2, UserRound } from "lucide-react";
import type { ThreadMessage } from "@/types/thread";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { MarkdownText } from "@/components/MarkdownText";
import {
  DocumentAnswerRenderer,
  type TextSelectionDraft
} from "@/components/document/DocumentAnswerRenderer";

type ThreadMessageCardProps = {
  message: ThreadMessage;
  sourceLocalThreadId?: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceThreadType?: "local" | "nested_local";
  onAskAboutThis?: (selection: TextSelectionDraft) => void;
  onReviseThis?: (selection: TextSelectionDraft) => void;
  onCreateBranch?: (selection: TextSelectionDraft) => void;
  onAddNote?: (selection: TextSelectionDraft) => void;
  onMergeSelection?: (selection: TextSelectionDraft) => void;
};

export function ThreadMessageCard({
  message,
  sourceLocalThreadId,
  parentSelectionId,
  parentLocalSelectionId,
  sourceThreadType = "local",
  onAskAboutThis,
  onReviseThis,
  onCreateBranch,
  onAddNote,
  onMergeSelection
}: ThreadMessageCardProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [contextData, setContextData] = useState<null | {
    snapshot: {
      model: string;
      callType: string;
      threadId?: string;
      tokenEstimate: number;
      includedItems: Array<{
        id: string;
        type: string;
        sourceId?: string;
        text: string;
        reason: string;
      }>;
      excludedItems: Array<{
        id: string;
        type: string;
        sourceId?: string;
        text: string;
        reason: string;
      }>;
    };
  }>(null);
  const isUser = message.role === "user";
  const Icon = isUser ? UserRound : Bot;
  const deleteThreadMessage = useAnswerAtlasStore(
    (state) => state.deleteThreadMessage
  );
  const canSelectMessage =
    !isUser && onAskAboutThis && onReviseThis && onCreateBranch && onAddNote;
  const canReviewContext = !isUser && message.llmCallId;
  const sourceAnswerId = message.revisionMessageId ?? message.id;
  const includedNotes =
    contextData?.snapshot.includedItems.filter((item) =>
      item.type.includes("note")
    ) ?? [];
  const excludedNotes =
    contextData?.snapshot.excludedItems.filter((item) =>
      item.type.includes("note")
    ) ?? [];

  async function toggleContextReview() {
    if (!message.llmCallId) {
      return;
    }

    if (contextOpen) {
      setContextOpen(false);
      return;
    }

    setContextOpen(true);

    if (contextData) {
      return;
    }

    const response = await fetch(
      `/api/revision/llm-calls/${message.llmCallId}/context-snapshot`
    );

    if (response.ok) {
      setContextData((await response.json()) as typeof contextData);
    }
  }

  return (
    <article
      className={`rounded-lg border p-3 text-sm leading-6 ${
        isUser
          ? "border-blue-100 bg-blue-50/70"
          : "border-line bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-ink">
          <Icon size={17} className={isUser ? "text-atlasBlue" : "text-atlasPurple"} />
          {isUser ? "Your Question" : "LLM Answer"}
        </div>
        <time className="text-xs text-muted">
          {new Intl.DateTimeFormat("en", {
            hour: "numeric",
            minute: "2-digit"
          }).format(new Date(message.createdAt))}
        </time>
        {!isUser && message.modelName && (
          <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-semibold text-atlasPurple">
            {message.modelName}
          </span>
        )}
        <button
          onClick={() => deleteThreadMessage(message.id)}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-atlasRed"
          title="Delete message"
          aria-label="Delete message"
        >
          <Trash2 size={14} />
        </button>
        {canReviewContext && (
          <button
            onClick={toggleContextReview}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-atlasBlue"
            title="Context Review"
            aria-label="Context Review"
          >
            <Eye size={14} />
          </button>
        )}
      </div>
      {canSelectMessage ? (
        <DocumentAnswerRenderer
          answerId={message.id}
          text={message.content}
          toolbarMode="local_answer"
          source={{
            conversationId: message.sessionId,
            sourceType: "message",
            sourceId: sourceAnswerId,
            sourceMessageId: sourceAnswerId,
            sourceAnswerId,
            sourceLocalThreadId,
            parentSelectionId,
            parentLocalSelectionId,
            sourceThreadType
          }}
          onAskAboutThis={onAskAboutThis}
          onReviseThis={onReviseThis}
          onCreateBranch={onCreateBranch}
          onAddNote={onAddNote}
          onMergeSelection={onMergeSelection}
        />
      ) : (
        <MarkdownText text={message.content} />
      )}
      {contextOpen && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-slate-700">
          {contextData ? (
            <>
              <div className="mb-2 flex flex-wrap gap-2 font-semibold text-atlasBlue">
                <span>Model: {contextData.snapshot.model}</span>
                <span>Thread: {contextData.snapshot.threadId ?? "local"}</span>
                <span>Tokens: {contextData.snapshot.tokenEstimate}</span>
                <span>Scope: local_thread</span>
              </div>
              <div className="mb-2">
                <div className="font-bold text-ink">Included</div>
                <ul className="mt-1 space-y-1">
                  {contextData.snapshot.includedItems.map((item) => (
                    <li key={item.id}>
                      <span className="font-semibold">{item.type}</span>:{" "}
                      {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
              {includedNotes.length > 0 && (
                <div className="mb-2">
                  <div className="font-bold text-ink">Included Notes</div>
                  <ul className="mt-1 space-y-1">
                    {includedNotes.map((item) => (
                      <li key={item.id}>
                        <span className="font-semibold">{item.sourceId}</span>:{" "}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="font-bold text-ink">Excluded</div>
                {contextData.snapshot.excludedItems.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {contextData.snapshot.excludedItems.map((item) => (
                      <li key={item.id}>
                        <span className="font-semibold">{item.type}</span>:{" "}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted">No excluded items recorded.</div>
                )}
              </div>
              {excludedNotes.length > 0 && (
                <div className="mt-2">
                  <div className="font-bold text-ink">Excluded Notes</div>
                  <ul className="mt-1 space-y-1">
                    {excludedNotes.map((item) => (
                      <li key={item.id}>
                        <span className="font-semibold">{item.sourceId}</span>:{" "}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="font-semibold text-muted">Loading context...</div>
          )}
        </div>
      )}
    </article>
  );
}
