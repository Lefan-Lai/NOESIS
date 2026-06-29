"use client";

import { Bot, Trash2, UserRound } from "lucide-react";
import type { ThreadMessage } from "@/types/thread";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import {
  DocumentAnswerRenderer,
  type TextSelectionDraft
} from "@/components/document/DocumentAnswerRenderer";

type ThreadMessageCardProps = {
  message: ThreadMessage;
  onAskAboutThis?: (selection: TextSelectionDraft) => void;
  onReviseThis?: (selection: TextSelectionDraft) => void;
  onCreateBranch?: (selection: TextSelectionDraft) => void;
  onAddNote?: (selection: TextSelectionDraft) => void;
};

export function ThreadMessageCard({
  message,
  onAskAboutThis,
  onReviseThis,
  onCreateBranch,
  onAddNote
}: ThreadMessageCardProps) {
  const isUser = message.role === "user";
  const Icon = isUser ? UserRound : Bot;
  const deleteThreadMessage = useAnswerAtlasStore(
    (state) => state.deleteThreadMessage
  );
  const canSelectMessage =
    !isUser && onAskAboutThis && onReviseThis && onCreateBranch && onAddNote;

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
      </div>
      {canSelectMessage ? (
        <DocumentAnswerRenderer
          answerId={message.id}
          text={message.content}
          onAskAboutThis={onAskAboutThis}
          onReviseThis={onReviseThis}
          onCreateBranch={onCreateBranch}
          onAddNote={onAddNote}
        />
      ) : (
        <div className="whitespace-pre-line text-slate-700">{message.content}</div>
      )}
    </article>
  );
}
