"use client";

import { create } from "zustand";
import type { ArgumentComparison } from "@/types/comparison";
import type {
  ConversationMessage,
  ConversationSession,
  ContextScope,
  WindowInstance
} from "@/types/conversation";
import type {
  Anchor,
  AnswerBlock,
  Document,
  VersionSnapshot
} from "@/types/document";
import type { PatchOperation } from "@/types/diff";
import type {
  Annotation,
  DeletedAnswerTombstone,
  LocalThread,
  ThreadMessage
} from "@/types/thread";
import type { Branch, VersionNode } from "@/types/version";
import { buildContextPreview } from "@/lib/context/buildContextForLLM";
import type { ContextPreview } from "@/types/context";
import { checkoutVersionNode } from "@/lib/version/checkoutVersionNode";
import { computeActivePath, markActivePath } from "@/lib/version/computeActivePath";
import { getBlocksVisibleAtVersion } from "@/lib/version/getBlocksVisibleAtVersion";
import { createRevisionBranch } from "@/lib/thread/createBranch";
import { deleteLocalAnswerPermanently } from "@/lib/thread/deleteAnswer";
import { discardThread } from "@/lib/thread/discardThread";
import {
  createRevisionPatch,
  mergeThreadIntoDocument
} from "@/lib/thread/mergeThread";
import { createAnnotation, deleteAnnotation as deleteAnnotationModel } from "@/lib/thread/annotations";
import { createGeneratedDocumentState } from "@/lib/document/createGeneratedDocument";

type Records<T extends { id: string }> = Record<string, T>;

function toRecord<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

type ProjectSnapshot = {
  mainWindowId: string;
  activeTreeWindowId: string | null;
  currentDocumentId: string | null;
  activeVersionNodeId: string | null;
  selectedAnchorId: string | null;
  selectedThreadId: string | null;
  windows: Records<WindowInstance>;
  sessions: Records<ConversationSession>;
  conversationMessages: Records<ConversationMessage>;
  documents: Records<Document>;
  blocks: Records<AnswerBlock>;
  anchors: Records<Anchor>;
  threads: Records<LocalThread>;
  messages: Records<ThreadMessage>;
  annotations: Records<Annotation>;
  versionNodes: Records<VersionNode>;
  branches: Records<Branch>;
  comparisons: Records<ArgumentComparison>;
  snapshots: Records<VersionSnapshot>;
  tombstones: Records<DeletedAnswerTombstone>;
  revisionSuggestions: Record<string, string>;
};

type Project = {
  id: string;
  name: string;
  updatedAt: string;
  snapshot: ProjectSnapshot;
};

export type TextSelectionInput = {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
  createdFromWindowId?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
};

export type SelectionBranchMode = "ask" | "revise" | "branch";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MAIN_WINDOW_ID = "window-main";
const DEFAULT_MAIN_SESSION_ID = "session-main";

function mainContextScope(): ContextScope {
  return {
    scopeType: "main_answer_context",
    includeDiscarded: true,
    includeDeleted: false
  };
}

function branchContextScope(params: {
  currentDocumentId?: string;
  selectedBlockId?: string;
  branchId?: string;
}): ContextScope {
  return {
    scopeType: "selected_block_context",
    currentDocumentId: params.currentDocumentId,
    selectedBlockId: params.selectedBlockId,
    branchId: params.branchId,
    includeDiscarded: true,
    includeDeleted: false
  };
}

function treeContextScope(params: {
  currentDocumentId?: string;
  comparisonId?: string;
}): ContextScope {
  return {
    scopeType: "tree_comparison_context",
    currentDocumentId: params.currentDocumentId,
    comparisonId: params.comparisonId,
    includeDiscarded: true,
    includeDeleted: false
  };
}

function createDefaultConversationState(now = new Date().toISOString()) {
  const contextScope = mainContextScope();
  const mainWindow: WindowInstance = {
    id: DEFAULT_MAIN_WINDOW_ID,
    workspaceId: "default",
    windowType: "main_answer",
    title: "Main Answer Window",
    conversationSessionId: DEFAULT_MAIN_SESSION_ID,
    modelConfigId: DEFAULT_MODEL,
    contextScope,
    layout: {
      isMinimized: false
    },
    createdAt: now,
    updatedAt: now
  };
  const mainSession: ConversationSession = {
    id: DEFAULT_MAIN_SESSION_ID,
    workspaceId: "default",
    windowId: DEFAULT_MAIN_WINDOW_ID,
    sessionType: "main_chat",
    modelConfigId: DEFAULT_MODEL,
    contextScope,
    createdAt: now,
    updatedAt: now
  };

  return {
    mainWindowId: mainWindow.id,
    windows: {
      [mainWindow.id]: mainWindow
    },
    sessions: {
      [mainSession.id]: mainSession
    }
  };
}

function threadWindowId(threadId: string) {
  return `window-${threadId}`;
}

function threadSessionId(threadId: string) {
  return `session-${threadId}`;
}

function treeWindowId(comparisonId: string) {
  return `window-tree-${comparisonId}`;
}

function treeSessionId(comparisonId: string) {
  return `session-tree-${comparisonId}`;
}

function emptyProjectSnapshot(): ProjectSnapshot {
  const conversationState = createDefaultConversationState();

  return {
    mainWindowId: conversationState.mainWindowId,
    activeTreeWindowId: null,
    currentDocumentId: null,
    activeVersionNodeId: null,
    selectedAnchorId: null,
    selectedThreadId: null,
    windows: conversationState.windows,
    sessions: conversationState.sessions,
    conversationMessages: {},
    documents: {},
    blocks: {},
    anchors: {},
    threads: {},
    messages: {},
    annotations: {},
    versionNodes: {},
    branches: {},
    comparisons: {},
    snapshots: {},
    tombstones: {},
    revisionSuggestions: {}
  };
}

function captureProjectSnapshot(state: AnswerAtlasState): ProjectSnapshot {
  return {
    mainWindowId: state.mainWindowId,
    activeTreeWindowId: state.activeTreeWindowId,
    currentDocumentId: state.currentDocumentId,
    activeVersionNodeId: state.activeVersionNodeId,
    selectedAnchorId: state.selectedAnchorId,
    selectedThreadId: state.selectedThreadId,
    windows: state.windows,
    sessions: state.sessions,
    conversationMessages: state.conversationMessages,
    documents: state.documents,
    blocks: state.blocks,
    anchors: state.anchors,
    threads: state.threads,
    messages: state.messages,
    annotations: state.annotations,
    versionNodes: state.versionNodes,
    branches: state.branches,
    comparisons: state.comparisons,
    snapshots: state.snapshots,
    tombstones: state.tombstones,
    revisionSuggestions: state.revisionSuggestions
  };
}

function applyProjectSnapshot(
  state: AnswerAtlasState,
  snapshot: ProjectSnapshot
): AnswerAtlasState {
  return {
    ...state,
    ...snapshot,
    isDiffModalOpen: false,
    pendingPatch: [],
    contextPreview: null,
    isSideThreadOpen: false,
    isSideThreadMinimized: false,
    isGeneratingComparison: false
  };
}

export type AnswerAtlasState = {
  currentProjectId: string;
  projects: Records<Project>;
  mainWindowId: string;
  activeTreeWindowId: string | null;
  currentDocumentId: string | null;
  activeVersionNodeId: string | null;
  selectedAnchorId: string | null;
  selectedThreadId: string | null;
  windows: Records<WindowInstance>;
  sessions: Records<ConversationSession>;
  conversationMessages: Records<ConversationMessage>;
  documents: Records<Document>;
  blocks: Records<AnswerBlock>;
  anchors: Records<Anchor>;
  threads: Records<LocalThread>;
  messages: Records<ThreadMessage>;
  annotations: Records<Annotation>;
  versionNodes: Records<VersionNode>;
  branches: Records<Branch>;
  comparisons: Records<ArgumentComparison>;
  snapshots: Records<VersionSnapshot>;
  tombstones: Records<DeletedAnswerTombstone>;
  showContextDebugPanel: boolean;
  isDiffModalOpen: boolean;
  pendingPatch: PatchOperation[];
  contextPreview: ContextPreview | null;
  availableModels: string[];
  selectedModel: string;
  llmProvider: "openai" | "mock";
  modelSource: "openai-api" | "mock-fallback";
  isLoadingModels: boolean;
  isGeneratingDocument: boolean;
  isAskingLocalQuestion: boolean;
  isGeneratingComparison: boolean;
  isSendingWindowMessage: Record<string, boolean>;
  isNavigationCollapsed: boolean;
  isSideThreadOpen: boolean;
  isSideThreadMinimized: boolean;
  isComparisonExpanded: boolean;
  activeUtilityPanel:
    | null
    | "help"
    | "history"
    | "branches"
    | "share"
    | "workspace"
    | "documents"
    | "graph"
    | "tags"
    | "data"
    | "settings";
  revisionSuggestions: Record<string, string>;
  createProject: () => void;
  switchProject: (projectId: string) => void;
  resetWorkspace: () => void;
  toggleNavigation: () => void;
  closeSideThread: () => void;
  minimizeSideThread: () => void;
  restoreSideThread: () => void;
  toggleComparisonExpanded: () => void;
  setActiveUtilityPanel: (panel: AnswerAtlasState["activeUtilityPanel"]) => void;
  loadModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;
  setWindowModel: (windowId: string, model: string) => void;
  generateDocumentFromPrompt: (prompt: string) => Promise<void>;
  regenerateMainAnswer: () => Promise<void>;
  openSelectionBranch: (
    selection: TextSelectionInput,
    mode: SelectionBranchMode
  ) => void;
  addNoteForSelection: (selection: TextSelectionInput, content: string) => void;
  selectSentence: (blockId: string) => void;
  selectAnchor: (anchorId: string) => void;
  openThread: (threadId: string) => void;
  askLocalQuestion: (question: string) => Promise<void>;
  regenerateLocalQuestion: () => Promise<void>;
  askTreeQuestion: (question: string) => Promise<void>;
  deleteThreadMessage: (messageId: string) => void;
  addAnnotation: (content: string) => void;
  deleteAnnotation: (annotationId: string) => void;
  keepAsNote: (threadId: string) => void;
  createBranch: (threadId: string) => void;
  requestMerge: (threadId: string) => void;
  confirmMerge: () => void;
  closeDiffModal: () => void;
  discardThread: (threadId: string) => void;
  deleteAnswer: (threadId: string) => void;
  revertToNode: (nodeId: string) => void;
  toggleContextDebugPanel: () => void;
  refreshContextPreview: () => void;
};

function makeIdSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addChildToParent(
  nodes: Records<VersionNode>,
  parentId: string,
  childId: string
) {
  const parent = nodes[parentId];

  if (!parent) {
    return nodes;
  }

  const childIds = parent.childIds.includes(childId)
    ? parent.childIds
    : [...parent.childIds, childId];

  return {
    ...nodes,
    [parentId]: {
      ...parent,
      childIds
    }
  };
}

function appendVersionNodeAndCheckout(
  state: AnswerAtlasState,
  node: VersionNode
) {
  const document = state.currentDocumentId
    ? state.documents[state.currentDocumentId]
    : null;

  if (!document) {
    return state;
  }

  let versionNodes = {
    ...state.versionNodes,
    [node.id]: node
  };

  if (node.parentId) {
    versionNodes = addChildToParent(versionNodes, node.parentId, node.id);
  }

  const activePath = computeActivePath(
    versionNodes,
    document.rootVersionNodeId,
    node.id
  );

  return {
    ...state,
    activeVersionNodeId: node.id,
    documents: {
      ...state.documents,
      [document.id]: {
        ...document,
        activeVersionNodeId: node.id,
        updatedAt: new Date().toISOString()
      }
    },
    versionNodes: markActivePath(versionNodes, activePath)
  };
}

function sessionMessagesForModel(
  messages: Records<ConversationMessage>,
  sessionId?: string
) {
  if (!sessionId) {
    return [];
  }

  return Object.values(messages)
    .filter(
      (message) =>
        message.sessionId === sessionId &&
        message.contentState !== "deleted" &&
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
}

function generatedOutputToText(output: {
  title?: string;
  answer?: string;
  sections?: Array<{
    heading: string;
    paragraphs: string[];
  }>;
  paragraphs?: string[];
}) {
  if (output.answer) {
    return output.answer;
  }

  if (output.sections?.length) {
    return output.sections
      .flatMap((section) => [section.heading, ...section.paragraphs])
      .join("\n\n");
  }

  return [output.title, ...(output.paragraphs ?? [])]
    .filter(Boolean)
    .join("\n\n");
}

function appendConversationMessages({
  state,
  sessionId,
  userMessage,
  assistantMessage,
  model
}: {
  state: AnswerAtlasState;
  sessionId: string;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  model: string;
}) {
  const session = state.sessions[sessionId];
  const window = session ? state.windows[session.windowId] : null;
  const now = assistantMessage.createdAt;

  return {
    ...state,
    conversationMessages: {
      ...state.conversationMessages,
      [userMessage.id]: userMessage,
      [assistantMessage.id]: assistantMessage
    },
    sessions: session
      ? {
          ...state.sessions,
          [session.id]: {
            ...session,
            modelConfigId: model,
            updatedAt: now
          }
        }
      : state.sessions,
    windows: window
      ? {
          ...state.windows,
          [window.id]: {
            ...window,
            modelConfigId: model,
            updatedAt: now
          }
        }
      : state.windows
  };
}

function createThreadForAnchor(
  state: AnswerAtlasState,
  anchor: Anchor,
  versionNodeId: string
) {
  const now = new Date().toISOString();
  const threadId = `thread-${anchor.id}`;
  const windowId = threadWindowId(threadId);
  const sessionId = threadSessionId(threadId);

  if (state.threads[threadId]) {
    return threadId;
  }

  const thread: LocalThread = {
    id: threadId,
    documentId: anchor.documentId,
    anchorId: anchor.id,
    status: "active",
    visibility: "visible",
    contextPolicy: "include",
    createdInVersionNodeId: versionNodeId,
    conversationSessionId: sessionId,
    sourceType: anchor.anchorType === "text_selection" ? "text_selection" : "sentence",
    selectedText: anchor.selectedText,
    parentThreadId: anchor.sourceThreadId,
    sourceMessageId: anchor.sourceMessageId,
    relatedBranchId: null,
    createdAt: now,
    updatedAt: now
  };
  const contextScope = branchContextScope({
    currentDocumentId: anchor.documentId,
    selectedBlockId: anchor.blockId
  });
  const window: WindowInstance = {
    id: windowId,
    workspaceId: state.currentProjectId,
    windowType: "local_branch",
    title: "Local Branch Window",
    conversationSessionId: sessionId,
    modelConfigId: state.selectedModel,
    contextScope,
    linkedDocumentId: anchor.documentId,
    linkedThreadId: threadId,
    selectedBlockId: anchor.blockId,
    layout: {
      isMinimized: false
    },
    createdAt: now,
    updatedAt: now
  };
  const session: ConversationSession = {
    id: sessionId,
    workspaceId: state.currentProjectId,
    windowId,
    sessionType: "branch_chat",
    modelConfigId: state.selectedModel,
    contextScope,
    createdAt: now,
    updatedAt: now
  };

  state.threads = {
    ...state.threads,
    [threadId]: thread
  };
  state.windows = {
    ...state.windows,
    [windowId]: window
  };
  state.sessions = {
    ...state.sessions,
    [sessionId]: session
  };

  return threadId;
}

const initialConversationState = createDefaultConversationState();

export const useAnswerAtlasStore = create<AnswerAtlasState>((set, get) => ({
  currentProjectId: "default",
  projects: {
    default: {
      id: "default",
      name: "Default",
      updatedAt: new Date().toISOString(),
      snapshot: emptyProjectSnapshot()
    }
  },
  mainWindowId: initialConversationState.mainWindowId,
  activeTreeWindowId: null,
  currentDocumentId: null,
  activeVersionNodeId: null,
  selectedAnchorId: null,
  selectedThreadId: null,
  windows: initialConversationState.windows,
  sessions: initialConversationState.sessions,
  conversationMessages: {},
  documents: {},
  blocks: {},
  anchors: {},
  threads: {},
  messages: {},
  annotations: {},
  versionNodes: {},
  branches: {},
  comparisons: {},
  snapshots: {},
  tombstones: {},
  showContextDebugPanel: false,
  isDiffModalOpen: false,
  pendingPatch: [],
  contextPreview: null,
  availableModels: [DEFAULT_MODEL],
  selectedModel: DEFAULT_MODEL,
  llmProvider: "mock",
  modelSource: "mock-fallback",
  isLoadingModels: false,
  isGeneratingDocument: false,
  isAskingLocalQuestion: false,
  isGeneratingComparison: false,
  isSendingWindowMessage: {},
  isNavigationCollapsed: false,
  isSideThreadOpen: false,
  isSideThreadMinimized: false,
  isComparisonExpanded: false,
  activeUtilityPanel: null,
  revisionSuggestions: {},

  createProject: () => {
    set((state) => {
      const now = new Date().toISOString();
      const newProjectId = `project-${makeIdSuffix()}`;
      const currentProject = state.projects[state.currentProjectId];
      const projects = {
        ...state.projects,
        [state.currentProjectId]: currentProject
          ? {
              ...currentProject,
              updatedAt: now,
              snapshot: captureProjectSnapshot(state)
            }
          : currentProject,
        [newProjectId]: {
          id: newProjectId,
          name: `Project ${Object.keys(state.projects).length + 1}`,
          updatedAt: now,
          snapshot: emptyProjectSnapshot()
        }
      };

      return applyProjectSnapshot(
        {
          ...state,
          currentProjectId: newProjectId,
          projects
        },
        projects[newProjectId].snapshot
      );
    });

    get().refreshContextPreview();
  },

  switchProject: (projectId) => {
    set((state) => {
      const target = state.projects[projectId];
      const current = state.projects[state.currentProjectId];

      if (!target || projectId === state.currentProjectId) {
        return state;
      }

      const now = new Date().toISOString();
      const projects = {
        ...state.projects,
        [state.currentProjectId]: current
          ? {
              ...current,
              updatedAt: now,
              snapshot: captureProjectSnapshot(state)
            }
          : current
      };

      return applyProjectSnapshot(
        {
          ...state,
          currentProjectId: projectId,
          projects
        },
        target.snapshot
      );
    });

    get().refreshContextPreview();
  },

  resetWorkspace: () => {
    set((state) => {
      const now = new Date().toISOString();
      const snapshot = emptyProjectSnapshot();
      const project = state.projects[state.currentProjectId];
      const projects = {
        ...state.projects,
        [state.currentProjectId]: project
          ? {
              ...project,
              updatedAt: now,
              snapshot
            }
          : project
      };

      return applyProjectSnapshot(
        {
          ...state,
          projects
        },
        snapshot
      );
    });

    get().refreshContextPreview();
  },

  toggleNavigation: () => {
    set((state) => ({
      isNavigationCollapsed: !state.isNavigationCollapsed
    }));
  },

  closeSideThread: () => {
    set({
      isSideThreadOpen: false,
      isSideThreadMinimized: false
    });
  },

  minimizeSideThread: () => {
    set({
      isSideThreadOpen: false,
      isSideThreadMinimized: true
    });
  },

  restoreSideThread: () => {
    set({
      isSideThreadOpen: true,
      isSideThreadMinimized: false
    });
  },

  toggleComparisonExpanded: () => {
    set((state) => ({
      isComparisonExpanded: !state.isComparisonExpanded
    }));
  },

  setActiveUtilityPanel: (panel) => {
    set((state) => ({
      activeUtilityPanel: state.activeUtilityPanel === panel ? null : panel
    }));
  },

  loadModels: async () => {
    set({ isLoadingModels: true });

    try {
      const response = await fetch("/api/models");
      const catalog = (await response.json()) as {
        models?: string[];
        defaultModel?: string;
        provider?: "openai" | "mock";
        source?: "openai-api" | "mock-fallback";
      };
      const models = catalog.models?.length ? catalog.models : [DEFAULT_MODEL];

      set((state) => ({
        availableModels: models,
        selectedModel: models.includes(state.selectedModel)
          ? state.selectedModel
          : catalog.defaultModel ?? models[0],
        windows: Object.fromEntries(
          Object.values(state.windows).map((window) => [
            window.id,
            {
              ...window,
              modelConfigId: models.includes(window.modelConfigId)
                ? window.modelConfigId
                : catalog.defaultModel ?? models[0]
            }
          ])
        ),
        sessions: Object.fromEntries(
          Object.values(state.sessions).map((session) => [
            session.id,
            {
              ...session,
              modelConfigId: models.includes(session.modelConfigId)
                ? session.modelConfigId
                : catalog.defaultModel ?? models[0]
            }
          ])
        ),
        llmProvider: catalog.provider ?? "mock",
        modelSource: catalog.source ?? "mock-fallback",
        isLoadingModels: false
      }));
    } catch {
      set({
        availableModels: [DEFAULT_MODEL],
        selectedModel: DEFAULT_MODEL,
        llmProvider: "mock",
        modelSource: "mock-fallback",
        isLoadingModels: false
      });
    }
  },

  setSelectedModel: (model) => {
    set((state) => {
      if (!state.availableModels.includes(model)) {
        return state;
      }

      const mainWindow = state.windows[state.mainWindowId];
      const mainSession = mainWindow
        ? state.sessions[mainWindow.conversationSessionId]
        : null;

      return {
        ...state,
        selectedModel: model,
        windows: mainWindow
          ? {
              ...state.windows,
              [mainWindow.id]: {
                ...mainWindow,
                modelConfigId: model,
                updatedAt: new Date().toISOString()
              }
            }
          : state.windows,
        sessions: mainSession
          ? {
              ...state.sessions,
              [mainSession.id]: {
                ...mainSession,
                modelConfigId: model,
                updatedAt: new Date().toISOString()
              }
            }
          : state.sessions
      };
    });
  },

  setWindowModel: (windowId, model) => {
    set((state) => {
      const window = state.windows[windowId];
      const session = window ? state.sessions[window.conversationSessionId] : null;

      if (!window || !session || !state.availableModels.includes(model)) {
        return state;
      }

      const now = new Date().toISOString();

      return {
        ...state,
        selectedModel: windowId === state.mainWindowId ? model : state.selectedModel,
        windows: {
          ...state.windows,
          [windowId]: {
            ...window,
            modelConfigId: model,
            updatedAt: now
          }
        },
        sessions: {
          ...state.sessions,
          [session.id]: {
            ...session,
            modelConfigId: model,
            updatedAt: now
          }
        }
      };
    });
  },

  generateDocumentFromPrompt: async (prompt) => {
    if (!prompt.trim()) {
      return;
    }

    set({ isGeneratingDocument: true });

    try {
      const state = get();
      const mainWindow = state.windows[state.mainWindowId];
      const mainSession = mainWindow
        ? state.sessions[mainWindow.conversationSessionId]
        : null;
      const model = mainWindow?.modelConfigId ?? state.selectedModel;
      const previousMessages = sessionMessagesForModel(
        state.conversationMessages,
        mainSession?.id
      );
      const contextItems =
        state.currentDocumentId && state.activeVersionNodeId
          ? buildContextPreview(
              {
                documentId: state.currentDocumentId,
                activeVersionNodeId: state.activeVersionNodeId,
                purpose: "general_followup"
              },
              state
            ).includedItems.map((item) => ({
              type: item.type,
              text: item.text,
              reason: item.reason
            }))
          : [];
      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const userConversationMessage: ConversationMessage = {
        id: `conv-user-${suffix}`,
        sessionId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        role: "user",
        content: prompt,
        contentState: "normal",
        includeInContext: true,
        createdAt: now
      };

      set((current) => ({
        ...current,
        conversationMessages: {
          ...current.conversationMessages,
          [userConversationMessage.id]: userConversationMessage
        }
      }));

      const response = await fetch("/api/llm/generate-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          model,
          messages: previousMessages,
          contextItems
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate document");
      }

      const data = (await response.json()) as {
        model: string;
        provider: "openai" | "mock";
        output: {
          title: string;
          answer?: string;
          paragraphs: string[];
          sections?: Array<{
            heading: string;
            summary?: string;
            paragraphs: string[];
            sentenceSummaries?: string[];
          }>;
        };
      };
      const generated = createGeneratedDocumentState(
        data.output,
        suffix,
        now,
        state.currentDocumentId && state.activeVersionNodeId
          ? {
              documentId: state.currentDocumentId,
              rootVersionNodeId:
                state.documents[state.currentDocumentId]?.rootVersionNodeId,
              parentVersionNodeId: state.activeVersionNodeId
            }
          : undefined
      );
      const assistantText = generatedOutputToText(data.output);
      const assistantCreatedAt = new Date().toISOString();
      const assistantConversationMessage: ConversationMessage = {
        id: `conv-assistant-${suffix}`,
        sessionId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        role: "assistant",
        content: assistantText,
        modelConfigId: data.model,
        modelName: data.model,
        contentState: "normal",
        includeInContext: true,
        createdAt: assistantCreatedAt
      };

      set((current) => {
        const withConversation = appendConversationMessages({
          state: current,
          sessionId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
          userMessage: userConversationMessage,
          assistantMessage: assistantConversationMessage,
          model: data.model
        });
        const nextState = generated.versionNode.parentId
          ? appendVersionNodeAndCheckout(
              {
                ...withConversation,
                currentDocumentId: generated.document.id,
                documents: {
                  ...current.documents,
                  [generated.document.id]: {
                    ...(current.documents[generated.document.id] ?? generated.document),
                    title: generated.document.title,
                    rawText: generated.document.rawText,
                    updatedAt: generated.document.updatedAt
                  }
                },
                blocks: {
                  ...current.blocks,
                  ...toRecord(generated.blocks)
                },
                snapshots: {
                  ...current.snapshots,
                  [generated.snapshot.id]: generated.snapshot
                }
              },
              generated.versionNode
            )
          : {
              ...withConversation,
              currentDocumentId: generated.document.id,
              activeVersionNodeId: generated.document.activeVersionNodeId,
              documents: {
                ...current.documents,
                [generated.document.id]: generated.document
              },
              blocks: {
                ...toRecord(generated.blocks)
              },
              anchors: {},
              threads: {},
              messages: {},
              annotations: {},
              versionNodes: {
                [generated.versionNode.id]: generated.versionNode
              },
              branches: {},
              comparisons: {},
              snapshots: {
                [generated.snapshot.id]: generated.snapshot
              },
              revisionSuggestions: {},
              activeTreeWindowId: null,
              isSideThreadOpen: false,
              isSideThreadMinimized: false
            };

        return {
          ...nextState,
          llmProvider: data.provider,
          selectedModel: data.model,
          isGeneratingDocument: false
        };
      });
    } catch {
      set({ isGeneratingDocument: false });
    }

    get().refreshContextPreview();
  },

  regenerateMainAnswer: async () => {
    const state = get();
    const mainWindow = state.windows[state.mainWindowId];
    const sessionId = mainWindow?.conversationSessionId;
    const lastUserMessage = Object.values(state.conversationMessages)
      .filter(
        (message) =>
          message.sessionId === sessionId &&
          message.role === "user" &&
          message.contentState !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

    if (lastUserMessage) {
      await get().generateDocumentFromPrompt(lastUserMessage.content);
    }
  },

  openSelectionBranch: (selection, mode) => {
    set((state) => {
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;
      const document = documentId ? state.documents[documentId] : null;

      if (!documentId || !activeVersionNodeId || !document || !selection.selectedText.trim()) {
        return state;
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const anchorId = `selection-${suffix}`;
      const nodeId = `v-selection-${suffix}`;
      const anchor: Anchor = {
        id: anchorId,
        documentId,
        selectedText: selection.selectedText,
        anchorType: "text_selection",
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        contextBefore: selection.contextBefore,
        contextAfter: selection.contextAfter,
        createdFromWindowId: selection.createdFromWindowId ?? state.mainWindowId,
        sourceThreadId: selection.sourceThreadId,
        sourceMessageId: selection.sourceMessageId,
        createdAt: now
      };
      const node: VersionNode = {
        id: nodeId,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "anchor_selected",
        label: "Selected text",
        relatedAnchorId: anchorId,
        isActivePath: true,
        createdAt: now
      };
      let nextState = appendVersionNodeAndCheckout(
        {
          ...state,
          anchors: {
            ...state.anchors,
            [anchorId]: anchor
          }
        },
        node
      );
      const threadId = createThreadForAnchor(nextState, anchor, nodeId);
      const windowId = threadWindowId(threadId);
      const title =
        mode === "revise"
          ? "Revise Selection"
          : mode === "branch"
            ? "Selection Branch"
            : "Ask about Selection";

      nextState = {
        ...nextState,
        threads: {
          ...nextState.threads,
          [threadId]: {
            ...nextState.threads[threadId],
            sourceType: "text_selection",
            selectedText: selection.selectedText,
            parentThreadId: selection.sourceThreadId,
            sourceMessageId: selection.sourceMessageId
          }
        },
        windows: {
          ...nextState.windows,
          [windowId]: {
            ...nextState.windows[windowId],
            title,
            selectedBlockId: undefined,
            contextScope: branchContextScope({
              currentDocumentId: documentId
            }),
            updatedAt: now
          }
        },
        selectedAnchorId: anchorId,
        selectedThreadId: threadId,
        isSideThreadOpen: true,
        isSideThreadMinimized: false
      };

      if (mode !== "branch") {
        return nextState;
      }

      const result = createRevisionBranch({
        documentId,
        activeVersionNodeId: nodeId,
        anchorId,
        thread: nextState.threads[threadId],
        idSuffix: makeIdSuffix()
      });

      return appendVersionNodeAndCheckout(
        {
          ...nextState,
          branches: {
            ...nextState.branches,
            [result.branch.id]: {
              ...result.branch,
              workspaceId: state.currentProjectId,
              sourceType: "text_selection",
              sourceSelectionId: anchorId,
              selectedText: selection.selectedText,
              conversationSessionId: nextState.threads[threadId].conversationSessionId,
              contextPolicy: "include_in_context"
            }
          },
          threads: {
            ...nextState.threads,
            [threadId]: {
              ...result.thread,
              sourceType: "text_selection",
              selectedText: selection.selectedText,
              parentThreadId: selection.sourceThreadId,
              sourceMessageId: selection.sourceMessageId
            }
          },
          windows: {
            ...nextState.windows,
            [windowId]: {
              ...nextState.windows[windowId],
              linkedBranchId: result.branch.id,
              contextScope: branchContextScope({
                currentDocumentId: documentId,
                branchId: result.branch.id
              }),
              updatedAt: now
            }
          }
        },
        result.node
      );
    });

    get().refreshContextPreview();
  },

  addNoteForSelection: (selection, content) => {
    set((state) => {
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (
        !documentId ||
        !activeVersionNodeId ||
        !selection.selectedText.trim() ||
        !content.trim()
      ) {
        return state;
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const anchorId = `selection-note-${suffix}`;
      const annotationId = `annotation-${suffix}`;
      const anchor: Anchor = {
        id: anchorId,
        documentId,
        selectedText: selection.selectedText,
        anchorType: "text_selection",
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        contextBefore: selection.contextBefore,
        contextAfter: selection.contextAfter,
        createdFromWindowId: selection.createdFromWindowId ?? state.mainWindowId,
        sourceThreadId: selection.sourceThreadId,
        sourceMessageId: selection.sourceMessageId,
        createdAt: now
      };
      const annotation: Annotation = {
        id: annotationId,
        documentId,
        anchorId,
        content,
        status: "active",
        contextPolicy: "include",
        includeInContext: true,
        createdInVersionNodeId: activeVersionNodeId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      const node: VersionNode = {
        id: `v-selection-note-${suffix}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "annotation_added",
        label: "Selection note added",
        relatedAnchorId: anchorId,
        isActivePath: true,
        createdAt: now
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          anchors: {
            ...state.anchors,
            [anchorId]: anchor
          },
          annotations: {
            ...state.annotations,
            [annotationId]: annotation
          }
        },
        node
      );
    });

    get().refreshContextPreview();
  },

  selectSentence: (blockId) => {
    set((state) => {
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;
      const block = state.blocks[blockId];

      if (!documentId || !activeVersionNodeId || !block) {
        return state;
      }

      const existingAnchor = Object.values(state.anchors).find(
        (anchor) => anchor.blockId === blockId
      );

      if (existingAnchor) {
        const thread =
          Object.values(state.threads).find(
            (item) => item.anchorId === existingAnchor.id
          ) ?? null;

        return {
          ...state,
          selectedAnchorId: existingAnchor.id,
          selectedThreadId: thread?.id ?? null,
          isSideThreadOpen: true,
          isSideThreadMinimized: false
        };
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const anchorId = `anchor-${blockId}`;
      const nodeId = `v-anchor-${suffix}`;
      const anchor: Anchor = {
        id: anchorId,
        documentId,
        blockId,
        selectedText: block.text,
        anchorType: "sentence",
        createdAt: now
      };
      const node: VersionNode = {
        id: nodeId,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "anchor_selected",
        label: "Selected passage",
        relatedAnchorId: anchorId,
        isActivePath: true,
        createdAt: now
      };
      const nextState = appendVersionNodeAndCheckout(
        {
          ...state,
          anchors: {
            ...state.anchors,
            [anchorId]: anchor
          }
        },
        node
      );
      const threadId = createThreadForAnchor(nextState, anchor, nodeId);

      return {
        ...nextState,
        selectedAnchorId: anchorId,
        selectedThreadId: threadId,
        isSideThreadOpen: true,
        isSideThreadMinimized: false
      };
    });

    get().refreshContextPreview();
  },

  selectAnchor: (anchorId) => {
    set((state) => {
      const anchor = state.anchors[anchorId];
      const activeVersionNodeId = state.activeVersionNodeId;

      if (!anchor || !activeVersionNodeId) {
        return state;
      }

      const threadId =
        Object.values(state.threads).find((thread) => thread.anchorId === anchorId)
          ?.id ?? createThreadForAnchor(state, anchor, activeVersionNodeId);

      return {
        ...state,
        selectedAnchorId: anchorId,
        selectedThreadId: threadId,
        isSideThreadOpen: true,
        isSideThreadMinimized: false
      };
    });

    get().refreshContextPreview();
  },

  openThread: (threadId) => {
    const thread = get().threads[threadId];

    set({
      selectedThreadId: threadId,
      selectedAnchorId: thread?.anchorId ?? get().selectedAnchorId,
      isSideThreadOpen: true,
      isSideThreadMinimized: false
    });
  },

  askLocalQuestion: async (question) => {
    const state = get();
    const threadId = state.selectedThreadId;
    const documentId = state.currentDocumentId;
    const activeVersionNodeId = state.activeVersionNodeId;

    if (!threadId || !documentId || !activeVersionNodeId || !question.trim()) {
      return;
    }

    const thread = state.threads[threadId];
    const anchor = thread ? state.anchors[thread.anchorId] : null;
    const block = anchor?.blockId ? state.blocks[anchor.blockId] : null;
    const selectedText = anchor?.selectedText ?? block?.text ?? "";
    const window = state.windows[threadWindowId(threadId)];
    const session = window ? state.sessions[window.conversationSessionId] : null;
    const model = window?.modelConfigId ?? state.selectedModel;

    if (!thread || !anchor || !selectedText) {
      return;
    }

    set({ isAskingLocalQuestion: true });

    const now = new Date().toISOString();
    const suffix = makeIdSuffix();
    const preview = buildContextPreview(
      {
        documentId,
        activeVersionNodeId,
        anchorId: anchor.id,
        purpose: "local_question"
      },
      state
    );
    const currentDocument = state.documents[documentId];
    const contextItems = [
      ...(currentDocument?.rawText
        ? [
            {
              type: "full_answer",
              text: currentDocument.rawText,
              reason: "The full main answer containing the selected passage."
            }
          ]
        : []),
      {
        type: "selected_passage",
        text: selectedText,
        reason:
          anchor.anchorType === "text_selection"
            ? `Mouse-selected text offsets ${anchor.startOffset ?? 0}-${anchor.endOffset ?? 0}.`
            : "Selected sentence anchor."
      },
      ...preview.includedItems.map((item) => ({
        type: item.type,
        text: item.text,
        reason: item.reason
      }))
    ];
    let answer =
      "The model was not reached, so this fallback note records the local question for later regeneration.";
    let revisedText: string | undefined;

    try {
      const response = await fetch("/api/llm/local-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          anchorText: selectedText,
          question,
          model,
          messages: sessionMessagesForModel(
            state.conversationMessages,
            session?.id
          ),
          contextItems
        })
      });

      if (response.ok) {
        const data = (await response.json()) as {
          output: {
            answer: string;
            revisedText?: string;
          };
          model: string;
          provider: "openai" | "mock";
        };
        answer = data.output.answer;
        revisedText = data.output.revisedText;
        set({
          selectedModel: data.model,
          llmProvider: data.provider
        });
      }
    } catch {
      // Keep the local thread usable even when the network/API is unavailable.
    }

    const userMessage: ThreadMessage = {
      id: `msg-user-${suffix}`,
      threadId,
      sessionId: session?.id,
      role: "user",
      content: question,
      contentState: "normal",
      includeInContext: true,
      createdAt: now
    };
    const assistantMessage: ThreadMessage = {
      id: `msg-assistant-${suffix}`,
      threadId,
      sessionId: session?.id,
      role: "assistant",
      content: answer,
      modelConfigId: get().selectedModel,
      modelName: get().selectedModel,
      contentState: "normal",
      includeInContext: true,
      createdAt: now
    };
    const userConversationMessage: ConversationMessage = {
      id: `conv-user-${suffix}`,
      sessionId: session?.id ?? threadSessionId(threadId),
      role: "user",
      content: question,
      contentState: "normal",
      includeInContext: true,
      createdAt: now
    };
    const assistantConversationMessage: ConversationMessage = {
      id: `conv-assistant-${suffix}`,
      sessionId: session?.id ?? threadSessionId(threadId),
      role: "assistant",
      content: answer,
      modelConfigId: get().selectedModel,
      modelName: get().selectedModel,
      contentState: "normal",
      includeInContext: true,
      createdAt: now
    };
    const node: VersionNode = {
      id: `v-local-answer-${suffix}`,
      documentId,
      parentId: activeVersionNodeId,
      childIds: [],
      nodeType: "local_answer_generated",
      label: "Local answer generated",
      relatedAnchorId: state.threads[threadId]?.anchorId,
      relatedThreadId: threadId,
      isActivePath: true,
      createdAt: now
    };

    set((current) =>
      appendVersionNodeAndCheckout(
        appendConversationMessages({
          state: {
            ...current,
            isAskingLocalQuestion: false,
            isGeneratingComparison: Boolean(revisedText),
            messages: {
              ...current.messages,
              [userMessage.id]: userMessage,
              [assistantMessage.id]: assistantMessage
            },
            threads: {
              ...current.threads,
              [threadId]: {
                ...current.threads[threadId],
                conversationSessionId: session?.id ?? threadSessionId(threadId),
                status: "active",
                visibility: "visible",
                contextPolicy: "include",
                updatedAt: now
              }
            }
          },
          sessionId: session?.id ?? threadSessionId(threadId),
          userMessage: userConversationMessage,
          assistantMessage: assistantConversationMessage,
          model: get().selectedModel
        }),
        node
      )
    );

    if (revisedText) {
      set((current) => ({
        revisionSuggestions: {
          ...current.revisionSuggestions,
          [threadId]: revisedText
        }
      }));

      try {
        const comparisonResponse = await fetch("/api/llm/argument-comparison", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            documentId,
            anchorId: anchor.id,
            createdInVersionNodeId: node.id,
            originalText: selectedText,
            revisedText,
            localQuestion: question,
            localAnswer: answer,
            model: get().selectedModel,
            contextItems
          })
        });

        if (comparisonResponse.ok) {
          const data = (await comparisonResponse.json()) as {
            output: {
              comparison: ArgumentComparison;
            };
            model: string;
            provider: "openai" | "mock";
          };

          set((current) => ({
            ...current,
            selectedModel: data.model,
            llmProvider: data.provider,
            activeTreeWindowId: treeWindowId(data.output.comparison.id),
            comparisons: {
              ...current.comparisons,
              [data.output.comparison.id]: data.output.comparison
            },
            windows: {
              ...current.windows,
              [treeWindowId(data.output.comparison.id)]: {
                id: treeWindowId(data.output.comparison.id),
                workspaceId: current.currentProjectId,
                windowType: "tree_compare",
                title: "Semantic Difference Map",
                conversationSessionId: treeSessionId(data.output.comparison.id),
                modelConfigId: data.model,
                contextScope: treeContextScope({
                  currentDocumentId: documentId,
                  comparisonId: data.output.comparison.id
                }),
                linkedDocumentId: documentId,
                selectedComparisonId: data.output.comparison.id,
                layout: {
                  isMinimized: false
                },
                createdAt: now,
                updatedAt: now
              }
            },
            sessions: {
              ...current.sessions,
              [treeSessionId(data.output.comparison.id)]: {
                id: treeSessionId(data.output.comparison.id),
                workspaceId: current.currentProjectId,
                windowId: treeWindowId(data.output.comparison.id),
                sessionType: "tree_chat",
                modelConfigId: data.model,
                contextScope: treeContextScope({
                  currentDocumentId: documentId,
                  comparisonId: data.output.comparison.id
                }),
                createdAt: now,
                updatedAt: now
              }
            }
          }));
        }
      } catch {
        // If comparison generation fails, keep the revised answer but do not
        // invent a client-side comparison that did not come through the LLM API.
      }
    }

    set({ isAskingLocalQuestion: false, isGeneratingComparison: false });

    get().refreshContextPreview();
  },

  regenerateLocalQuestion: async () => {
    const state = get();
    const threadId = state.selectedThreadId;
    const lastUserMessage = Object.values(state.messages)
      .filter(
        (message) =>
          message.threadId === threadId &&
          message.role === "user" &&
          message.contentState !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

    if (lastUserMessage) {
      await get().askLocalQuestion(lastUserMessage.content);
    }
  },

  askTreeQuestion: async (question) => {
    const state = get();
    const comparison =
      (state.activeTreeWindowId
        ? Object.values(state.comparisons).find(
            (item) => treeWindowId(item.id) === state.activeTreeWindowId
          )
        : null) ??
      Object.values(state.comparisons).find(
        (item) => item.anchorId === state.selectedAnchorId
      );
    const windowId = comparison ? treeWindowId(comparison.id) : state.activeTreeWindowId;
    const window = windowId ? state.windows[windowId] : null;
    const session = window ? state.sessions[window.conversationSessionId] : null;

    if (!question.trim() || !comparison || !window || !session) {
      return;
    }

    const now = new Date().toISOString();
    const suffix = makeIdSuffix();
    const userConversationMessage: ConversationMessage = {
      id: `conv-tree-user-${suffix}`,
      sessionId: session.id,
      role: "user",
      content: question,
      contentState: "normal",
      includeInContext: true,
      createdAt: now
    };

    set((current) => ({
      isSendingWindowMessage: {
        ...current.isSendingWindowMessage,
        [window.id]: true
      }
    }));

    try {
      const response = await fetch("/api/conversation-sessions/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          windowId: window.id,
          sessionId: session.id,
          windowType: window.windowType,
          model: window.modelConfigId,
          userMessage: question,
          messages: sessionMessagesForModel(
            state.conversationMessages,
            session.id
          ),
          contextItems: [
            {
              type: "comparison_board",
              text: JSON.stringify(comparison.board),
              reason:
                "Semantic Difference Map context: compact semantic alignment rows, differences, risk, and selected revision evidence."
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error("Failed to ask tree question");
      }

      const data = (await response.json()) as {
        provider: "openai" | "mock";
        model: string;
        output: {
          answer: string;
        };
      };
      const assistantConversationMessage: ConversationMessage = {
        id: `conv-tree-assistant-${suffix}`,
        sessionId: session.id,
        role: "assistant",
        content: data.output.answer,
        modelConfigId: data.model,
        modelName: data.model,
        contentState: "normal",
        includeInContext: true,
        createdAt: new Date().toISOString()
      };

      set((current) => ({
        ...appendConversationMessages({
          state: current,
          sessionId: session.id,
          userMessage: userConversationMessage,
          assistantMessage: assistantConversationMessage,
          model: data.model
        }),
        llmProvider: data.provider,
        isSendingWindowMessage: {
          ...current.isSendingWindowMessage,
          [window.id]: false
        }
      }));
    } catch {
      set((current) => ({
        isSendingWindowMessage: {
          ...current.isSendingWindowMessage,
          [window.id]: false
        }
      }));
    }
  },

  deleteThreadMessage: (messageId) => {
    set((state) => {
      const message = state.messages[messageId];

      if (!message) {
        return state;
      }

      return {
        ...state,
        messages: {
          ...state.messages,
          [messageId]: {
            ...message,
            content: "",
            contentState: "deleted",
            includeInContext: false
          }
        },
        conversationMessages: Object.fromEntries(
          Object.values(state.conversationMessages).map((conversationMessage) => [
            conversationMessage.id,
            conversationMessage.sessionId === message.sessionId &&
            conversationMessage.content === message.content &&
            conversationMessage.role === message.role
              ? {
                  ...conversationMessage,
                  contentState: "deleted",
                  includeInContext: false
                }
              : conversationMessage
          ])
        )
      };
    });

    get().refreshContextPreview();
  },

  addAnnotation: (content) => {
    set((state) => {
      const selectedAnchorId = state.selectedAnchorId;
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;
      const anchor = selectedAnchorId ? state.anchors[selectedAnchorId] : null;

      if (!content.trim() || !documentId || !activeVersionNodeId || !anchor) {
        return state;
      }

      const suffix = makeIdSuffix();
      const annotation = createAnnotation({
        documentId,
        anchorId: anchor.id,
        blockId: anchor.blockId,
        content,
        createdInVersionNodeId: activeVersionNodeId,
        idSuffix: suffix
      });
      const node: VersionNode = {
        id: `v-annotation-${suffix}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "annotation_added",
        label: "Annotation added",
        relatedAnchorId: anchor.id,
        isActivePath: true,
        createdAt: annotation.createdAt
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          annotations: {
            ...state.annotations,
            [annotation.id]: annotation
          }
        },
        node
      );
    });

    get().refreshContextPreview();
  },

  deleteAnnotation: (annotationId) => {
    set((state) => {
      const annotation = state.annotations[annotationId];
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (!annotation || !documentId || !activeVersionNodeId) {
        return state;
      }

      const deletedAnnotation = deleteAnnotationModel(annotation);
      const node: VersionNode = {
        id: `v-annotation-deleted-${makeIdSuffix()}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "annotation_deleted",
        label: "Annotation deleted",
        relatedAnchorId: annotation.anchorId,
        isActivePath: true,
        createdAt: deletedAnnotation.updatedAt
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          annotations: {
            ...state.annotations,
            [annotationId]: deletedAnnotation
          }
        },
        node
      );
    });

    get().refreshContextPreview();
  },

  keepAsNote: (threadId) => {
    set((state) => {
      const thread = state.threads[threadId];

      if (!thread) {
        return state;
      }

      const now = new Date().toISOString();

      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...thread,
            status: "kept_as_note",
            visibility: "visible",
            contextPolicy: "include",
            updatedAt: now
          }
        }
      };
    });

    get().refreshContextPreview();
  },

  createBranch: (threadId) => {
    set((state) => {
      const thread = state.threads[threadId];
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (!thread || !documentId || !activeVersionNodeId) {
        return state;
      }

      const result = createRevisionBranch({
        documentId,
        activeVersionNodeId,
        anchorId: thread.anchorId,
        thread,
        idSuffix: makeIdSuffix()
      });
      const nextState = appendVersionNodeAndCheckout(
        {
          ...state,
          branches: {
            ...state.branches,
            [result.branch.id]: result.branch
          },
          windows: state.windows[threadWindowId(threadId)]
            ? {
                ...state.windows,
                [threadWindowId(threadId)]: {
                  ...state.windows[threadWindowId(threadId)],
                  linkedBranchId: result.branch.id,
                  contextScope: branchContextScope({
                    currentDocumentId: documentId,
                    selectedBlockId:
                      state.anchors[thread.anchorId]?.blockId,
                    branchId: result.branch.id
                  }),
                  updatedAt: new Date().toISOString()
                }
              }
            : state.windows,
          threads: {
            ...state.threads,
            [threadId]: result.thread
          }
        },
        result.node
      );

      return nextState;
    });

    get().refreshContextPreview();
  },

  requestMerge: (threadId) => {
    const state = get();
    const thread = state.threads[threadId];
    const anchor = thread ? state.anchors[thread.anchorId] : null;
    const document = state.currentDocumentId
      ? state.documents[state.currentDocumentId]
      : null;
    const activeVersionNodeId = state.activeVersionNodeId;

    if (!thread || !anchor || !document || !activeVersionNodeId) {
      return;
    }

    if (!anchor.blockId) {
      set({
        pendingPatch: [],
        isDiffModalOpen: false
      });
      return;
    }

    const visibleBlocks = getBlocksVisibleAtVersion(
      state,
      document.id,
      document.rootVersionNodeId,
      activeVersionNodeId
    );
    const patch = createRevisionPatch(
      visibleBlocks,
      anchor.blockId,
      state.revisionSuggestions[threadId] ?? anchor.selectedText
    );

    set({
      pendingPatch: patch,
      isDiffModalOpen: patch.length > 0
    });
  },

  confirmMerge: () => {
    set((state) => {
      const threadId = state.selectedThreadId;
      const thread = threadId ? state.threads[threadId] : null;
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (
        !thread ||
        !documentId ||
        !activeVersionNodeId ||
        state.pendingPatch.length === 0
      ) {
        return {
          ...state,
          isDiffModalOpen: false,
          pendingPatch: []
        };
      }

      const document = state.documents[documentId];
      const visibleBlocks = getBlocksVisibleAtVersion(
        state,
        documentId,
        document.rootVersionNodeId,
        activeVersionNodeId
      );
      const branch = thread.relatedBranchId
        ? state.branches[thread.relatedBranchId]
        : undefined;
      const result = mergeThreadIntoDocument({
        documentId,
        parentVersionNodeId: activeVersionNodeId,
        thread,
        branch,
        blocks: visibleBlocks,
        patch: state.pendingPatch,
        idSuffix: makeIdSuffix()
      });
      const nextState = appendVersionNodeAndCheckout(
        {
          ...state,
          blocks: toRecord(result.snapshot.blocks),
          threads: {
            ...state.threads,
            [thread.id]: result.thread
          },
          branches: result.branch
            ? {
                ...state.branches,
                [result.branch.id]: result.branch
              }
            : state.branches,
          snapshots: {
            ...state.snapshots,
            [result.snapshot.id]: result.snapshot
          },
          isDiffModalOpen: false,
          pendingPatch: []
        },
        result.node
      );

      return nextState;
    });

    get().refreshContextPreview();
  },

  closeDiffModal: () => {
    set({
      isDiffModalOpen: false,
      pendingPatch: []
    });
  },

  discardThread: (threadId) => {
    set((state) => {
      const thread = state.threads[threadId];
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (!thread || !documentId || !activeVersionNodeId) {
        return state;
      }

      const threadMessages = Object.values(state.messages).filter(
        (message) => message.threadId === threadId
      );
      const result = discardThread(thread, threadMessages);
      const messages = {
        ...state.messages
      };

      for (const message of result.messages) {
        messages[message.id] = message;
      }

      const node: VersionNode = {
        id: `v-discarded-${makeIdSuffix()}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "discarded",
        label: "Discarded local answer",
        relatedAnchorId: thread.anchorId,
        relatedThreadId: threadId,
        relatedBranchId: thread.relatedBranchId,
        isActivePath: true,
        createdAt: new Date().toISOString()
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          threads: {
            ...state.threads,
            [threadId]: result.thread
          },
          messages
        },
        node
      );
    });

    get().refreshContextPreview();
  },

  deleteAnswer: (threadId) => {
    set((state) => {
      const thread = state.threads[threadId];
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;

      if (!thread || !documentId || !activeVersionNodeId) {
        return state;
      }

      const threadMessages = Object.values(state.messages).filter(
        (message) => message.threadId === threadId
      );
      const result = deleteLocalAnswerPermanently(thread, threadMessages);
      const messages = {
        ...state.messages
      };

      for (const message of result.messages) {
        messages[message.id] = message;
      }

      const node: VersionNode = {
        id: `v-deleted-${makeIdSuffix()}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "deleted",
        label: "Deleted local answer",
        relatedAnchorId: thread.anchorId,
        relatedThreadId: threadId,
        relatedBranchId: thread.relatedBranchId,
        isActivePath: true,
        createdAt: new Date().toISOString()
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          threads: {
            ...state.threads,
            [threadId]: result.thread
          },
          messages,
          conversationMessages: Object.fromEntries(
            Object.values(state.conversationMessages).map((message) => [
              message.id,
              message.sessionId === thread.conversationSessionId
                ? {
                    ...message,
                    contentState: "deleted",
                    includeInContext: false
                  }
                : message
            ])
          ),
          tombstones: {
            ...state.tombstones,
            [result.tombstone.id]: result.tombstone
          }
        },
        node
      );
    });

    get().refreshContextPreview();
  },

  revertToNode: (nodeId) => {
    set((state) => {
      const documentId = state.currentDocumentId;

      if (!documentId) {
        return state;
      }

      const document = state.documents[documentId];
      const result = checkoutVersionNode(document, state.versionNodes, nodeId);

      return {
        ...state,
        activeVersionNodeId: nodeId,
        documents: {
          ...state.documents,
          [documentId]: result.document
        },
        versionNodes: result.versionNodes
      };
    });

    get().refreshContextPreview();
  },

  toggleContextDebugPanel: () => {
    set((state) => ({
      showContextDebugPanel: !state.showContextDebugPanel
    }));
  },

  refreshContextPreview: () => {
    const state = get();
    const documentId = state.currentDocumentId;
    const activeVersionNodeId = state.activeVersionNodeId;

    if (!documentId || !activeVersionNodeId) {
      set({ contextPreview: null });
      return;
    }

    set({
      contextPreview: buildContextPreview(
        {
          documentId,
          activeVersionNodeId,
          anchorId: state.selectedAnchorId ?? undefined,
          purpose: "local_question"
        },
        state
      )
    });
  }
}));
