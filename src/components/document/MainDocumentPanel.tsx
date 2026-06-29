"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";
import { getBlocksVisibleAtVersion } from "@/lib/version/getBlocksVisibleAtVersion";
import {
  DocumentAnswerRenderer,
  type TextSelectionDraft
} from "./DocumentAnswerRenderer";
import { DocumentToolbar } from "./DocumentToolbar";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  History,
  RotateCcw,
  Send,
  Sparkles,
  UserRound
} from "lucide-react";

type MainDocumentPanelProps = {
  documentId: string;
};

export function MainDocumentPanel({ documentId }: MainDocumentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const documents = useAnswerAtlasStore((state) => state.documents);
  const versionNodes = useAnswerAtlasStore((state) => state.versionNodes);
  const snapshots = useAnswerAtlasStore((state) => state.snapshots);
  const activeVersionNodeId = useAnswerAtlasStore(
    (state) => state.activeVersionNodeId
  );
  const generateDocumentFromPrompt = useAnswerAtlasStore(
    (state) => state.generateDocumentFromPrompt
  );
  const regenerateMainAnswer = useAnswerAtlasStore(
    (state) => state.regenerateMainAnswer
  );
  const isGeneratingDocument = useAnswerAtlasStore(
    (state) => state.isGeneratingDocument
  );
  const availableModels = useAnswerAtlasStore((state) => state.availableModels);
  const mainWindowId = useAnswerAtlasStore((state) => state.mainWindowId);
  const windows = useAnswerAtlasStore((state) => state.windows);
  const sessions = useAnswerAtlasStore((state) => state.sessions);
  const conversationMessages = useAnswerAtlasStore(
    (state) => state.conversationMessages
  );
  const setWindowModel = useAnswerAtlasStore((state) => state.setWindowModel);
  const openSelectionBranch = useAnswerAtlasStore(
    (state) => state.openSelectionBranch
  );
  const addNoteForSelection = useAnswerAtlasStore(
    (state) => state.addNoteForSelection
  );
  const document = documents[documentId] ?? Object.values(documents)[0];
  const mainWindow = windows[mainWindowId];
  const mainSession = mainWindow
    ? sessions[mainWindow.conversationSessionId]
    : null;
  const mainMessages = useMemo(
    () =>
      Object.values(conversationMessages)
        .filter(
          (message) =>
            message.sessionId === mainSession?.id &&
            message.contentState !== "deleted"
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [conversationMessages, mainSession?.id]
  );
  const userQuestions = useMemo(
    () =>
      mainMessages.filter(
        (message) =>
          message.role === "user" && message.contentState !== "deleted"
      ),
    [mainMessages]
  );
  const latestAssistantMessage = useMemo(
    () =>
      [...mainMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" && message.contentState !== "deleted"
        ),
    [mainMessages]
  );

  useEffect(() => {
    if (!document) {
      setPrompt("");
    }
  }, [document]);

  useEffect(() => {
    chatAreaRef.current?.scrollTo({
      top: chatAreaRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [mainMessages.length, isGeneratingDocument]);

  const blocks = useMemo(() => {
    if (!document || !activeVersionNodeId) {
      return [];
    }

    return getBlocksVisibleAtVersion(
      { snapshots, versionNodes },
      document.id,
      document.rootVersionNodeId,
      activeVersionNodeId
    );
  }, [activeVersionNodeId, document, snapshots, versionNodes]);

  const sentenceCount = blocks.filter((block) => block.blockType === "sentence").length;
  const wordCount = blocks
    .filter((block) => block.blockType === "sentence")
    .reduce((total, block) => total + block.text.split(/\s+/).filter(Boolean).length, 0);

  async function handleGenerate() {
    const currentPrompt = prompt.trim();

    if (!currentPrompt) {
      return;
    }

    setPrompt("");
    await generateDocumentFromPrompt(currentPrompt);
  }

  function scrollToQuestion(messageId: string) {
    globalThis.document
      ?.getElementById(`main-message-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleAddNote(selection: TextSelectionDraft) {
    const note = window.prompt("Add a note for future LLM context");

    if (note?.trim()) {
      addNoteForSelection(selection, note);
    }
  }

  return (
    <main className="panel min-h-0 overflow-hidden rounded-lg max-[900px]:h-[520px]">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <h2 className="truncate text-lg font-bold text-ink">
            {mainWindow?.title ?? "Main Answer Window"}
            <span className="ml-2 text-sm font-medium text-muted">
              {document?.title ?? "empty session"}
            </span>
          </h2>
          <div className="flex gap-1 text-slate-600">
            <button
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100"
              title="Forward"
              aria-label="Forward"
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <DocumentToolbar />
        <div
          ref={chatAreaRef}
          className="thin-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4"
        >
          {mainMessages.length === 0 ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-atlasBlue">
                  <Sparkles size={24} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-ink">
                  Start with a question
                </h3>
                <p className="text-sm leading-6 text-muted">
                  Choose a model, ask a question, and Answer Atlas will generate
                  the document, outline, sentence anchors, side threads, and
                  comparison workspace from the model response.
                </p>
              </div>
            </div>
          ) : (
            <div id="answer-body" className="mx-auto max-w-4xl space-y-4 py-2">
              {mainMessages.map((message) => {
                const isUser = message.role === "user";
                const Icon = isUser ? UserRound : Bot;
                const canSelectAssistantAnswer =
                  !isUser &&
                  document &&
                  message.id === latestAssistantMessage?.id;

                return (
                  <article
                    id={`main-message-${message.id}`}
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                        isUser
                          ? "border-blue-200 bg-blue-50 text-slate-800"
                          : "border-line bg-white text-slate-800"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 font-semibold text-ink">
                        <span className="flex items-center gap-2">
                          <Icon
                            size={16}
                            className={isUser ? "text-atlasBlue" : "text-atlasPurple"}
                          />
                          {isUser ? "You" : "Assistant"}
                        </span>
                        {!isUser && message.modelName && (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-atlasBlue">
                            {message.modelName === "gpt-5.5"
                              ? "GPT-5.5"
                              : message.modelName}
                          </span>
                        )}
                      </div>
                      {canSelectAssistantAnswer ? (
                        <DocumentAnswerRenderer
                          answerId={document.id}
                          text={message.content}
                          onAskAboutThis={(selection) =>
                            openSelectionBranch(selection, "ask")
                          }
                          onReviseThis={(selection) =>
                            openSelectionBranch(selection, "revise")
                          }
                          onCreateBranch={(selection) =>
                            openSelectionBranch(selection, "branch")
                          }
                          onAddNote={handleAddNote}
                        />
                      ) : (
                        <div className="whitespace-pre-line text-slate-700">
                          {message.content}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              {isGeneratingDocument && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-muted shadow-sm">
                    Assistant is thinking...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-line bg-slate-50/70 p-3">
          <div className="flex gap-2">
            <div className="group relative">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Previous questions"
                aria-label="Previous questions"
                disabled={userQuestions.length === 0}
              >
                <History size={16} />
              </button>
              {userQuestions.length > 0 && (
                <div className="invisible absolute bottom-11 left-0 z-30 w-72 rounded-lg border border-line bg-white p-2 opacity-0 shadow-panel transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Previous Questions
                  </div>
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {userQuestions.map((message, index) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => scrollToQuestion(message.id)}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm leading-5 text-slate-700 hover:bg-slate-50"
                      >
                        <span className="mr-2 font-semibold text-atlasBlue">
                          {index + 1}.
                        </span>
                        {message.content}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleGenerate();
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-atlasBlue"
              placeholder="Ask a question..."
            />
            <select
              value={mainWindow?.modelConfigId ?? "gpt-5.5"}
              onChange={(event) =>
                mainWindow && setWindowModel(mainWindow.id, event.target.value)
              }
              className="h-9 max-w-[170px] rounded-md border border-line bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-atlasBlue"
              title="Main window model"
              aria-label="Main window model"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model === "gpt-5.5" ? "GPT-5.5" : model}
                </option>
              ))}
            </select>
            <button
              onClick={regenerateMainAnswer}
              disabled={isGeneratingDocument || userQuestions.length === 0}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-700 disabled:opacity-50"
              title="Regenerate"
              aria-label="Regenerate"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGeneratingDocument || !prompt.trim()}
              className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-atlasBlue px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send size={16} />
              {isGeneratingDocument ? "Sending" : "Send"}
            </button>
          </div>
        </div>
        <div className="flex h-10 items-center gap-5 border-t border-line px-4 text-xs text-muted">
          <span>Words: {wordCount}</span>
          <span>Sentences: {sentenceCount}</span>
          <span>Active node: {activeVersionNodeId ?? "none"}</span>
        </div>
      </div>
    </main>
  );
}
