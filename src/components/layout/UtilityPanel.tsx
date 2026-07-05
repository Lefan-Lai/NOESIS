"use client";

import { X } from "lucide-react";
import { RevisionExplorerPanel } from "@/components/thread/RevisionExplorerPanel";
import { useAnswerAtlasStore } from "@/store/useAnswerAtlasStore";

const panelCopy: Record<string, { title: string; body: string[] }> = {
  help: {
    title: "Help",
    body: [
      "Ask a question, choose a model, then generate a structured document answer.",
      "Hover a sentence and press the anchor button to open a local side thread.",
      "Annotations enter only this project's active-path LLM context.",
      "Discard hides local content but can keep it context-eligible; Delete excludes it."
    ]
  },
  history: {
    title: "History",
    body: [
      "Shows version nodes created by generation, selection, annotation, local answers, branches, merges, discard, delete, and revert.",
      "Future inactive nodes remain visible but are excluded from LLM context."
    ]
  },
  branches: {
    title: "Branches",
    body: [
      "Create Branch explores a selected sentence revision without changing the main document.",
      "Branch content belongs to the current project and current active path rules."
    ]
  },
  share: {
    title: "Share",
    body: [
      "Sharing is reserved for a later backend-backed version.",
      "The current MVP keeps API keys and local project context private."
    ]
  },
  workspace: {
    title: "Thread Navigator",
    body: [
      "Find and restore local or nested side threads in the current project.",
      "Thread memory stays scoped to its project, selection, and local workspace rules."
    ]
  },
  documents: {
    title: "Documents",
    body: [
      "Documents are generated inside the current project.",
      "New Thread clears the current workspace; New Project creates a separate isolated workspace."
    ]
  },
  graph: {
    title: "Graph",
    body: [
      "Graph explains relationships between document nodes, anchors, side threads, branches, and comparison trees.",
      "The comparison panel shows the selected sentence's local revision structure."
    ]
  },
  tags: {
    title: "Tags",
    body: [
      "Tags will classify anchors, annotations, and revision threads.",
      "This is planned as project-local metadata."
    ]
  },
  data: {
    title: "Data",
    body: [
      "Data will store projects, documents, snapshots, threads, annotations, and context-debug records.",
      "The current MVP keeps data in browser runtime state."
    ]
  },
  settings: {
    title: "Settings",
    body: [
      "Settings will configure model allowlists, provider behavior, context budgets, and UI preferences.",
      "Model availability is still controlled by the API key and server-side allowlist."
    ]
  }
};

export function UtilityPanel() {
  const activeUtilityPanel = useAnswerAtlasStore(
    (state) => state.activeUtilityPanel
  );
  const setActiveUtilityPanel = useAnswerAtlasStore(
    (state) => state.setActiveUtilityPanel
  );

  if (!activeUtilityPanel) {
    return null;
  }

  const copy = panelCopy[activeUtilityPanel];
  const isWorkspacePanel = activeUtilityPanel === "workspace";

  return (
    <aside
      className={`fixed right-4 top-20 z-40 rounded-lg border border-line bg-white shadow-panel ${
        isWorkspacePanel
          ? "w-[940px] max-w-[calc(100vw-32px)]"
          : "w-[360px] max-w-[calc(100vw-32px)]"
      }`}
    >
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <h2 className="font-bold text-ink">{copy.title}</h2>
        <button
          onClick={() => setActiveUtilityPanel(null)}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
          title="Close"
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </div>
      {isWorkspacePanel ? (
        <RevisionExplorerPanel />
      ) : (
        <div className="space-y-3 p-4 text-sm leading-6 text-slate-700">
          {copy.body.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}
    </aside>
  );
}
