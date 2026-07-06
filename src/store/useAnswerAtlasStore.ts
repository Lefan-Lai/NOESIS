"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
import type {
  BuildContextParams,
  ContextPreview,
  ContextSnapshot,
  ContextSnapshotItem,
  LLMCallRecord
} from "@/types/context";
import type {
  DocumentVersionModel,
  EventLogRecord,
  MainConversationModel,
  MessageModel,
  RevisionTimelineEdge,
  RevisionTimelineNode,
  RevisionRepositoryState,
  AnnotationModel,
  TextSelectionModel,
  LocalThreadModel,
  LocalSelectionModel,
  RevisionBranchModel,
  MergeRecordModel,
  MergeMode,
  MergeSourceType,
  ComparisonGraphModel,
  ComparisonRunModel,
  ComparisonExportModel,
  ManualEditDraftModel,
  ObjectStateTransitionModel,
  TimelinePathModel,
  RevertRecordModel,
  ActionIdempotencyRecord,
  MigrationJobModel,
  MigrationBatchModel,
  MigrationIssueModel,
  BackfillRecordModel,
  FeatureFlagModel,
  WorkspaceIndexDefinition,
  WorkspaceMetricRecord,
  TimelineNodeProjectionModel,
  TimelineGraphSnapshotModel,
  ObjectRelationIndexModel,
  ContextItemIndexModel,
  ThreadSummaryModel,
  DocumentChunkModel,
  ContextBuildCacheModel
} from "@/types/revision";
import type { TextDiff } from "@/services/revision/DiffService";
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
import { createArgumentComparisonFromTexts } from "@/lib/comparison/createArgumentComparison";
import { MainConversationRevisionService } from "@/services/revision/MainConversationRevisionService";
import { revisionRepository } from "@/services/revision/revisionRepository";
import { TextSelectionService } from "@/services/revision/TextSelectionService";
import { LocalThreadService } from "@/services/revision/LocalThreadService";
import { LocalSelectionService } from "@/services/revision/LocalSelectionService";
import { RevisionBranchService } from "@/services/revision/RevisionBranchService";
import { AnnotationService } from "@/services/revision/AnnotationService";
import { DocumentVersionService } from "@/services/revision/DocumentVersionService";
import { MergeService } from "@/services/revision/MergeService";
import { ComparisonService } from "@/services/revision/ComparisonService";
import { executeWorkspaceAction } from "@/services/revision/WorkspaceActionExecutor";
import type {
  ExecuteWorkspaceActionPayload,
  ExecuteWorkspaceActionResult,
  WorkspaceActionId
} from "@/types/workspaceActions";

type Records<T extends { id: string }> = Record<string, T>;

function toRecord<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export type LogicAssignment = {
  id: string;
  nodeId: string;
  logicFocusKey: string;
  logicFocusLabel: string;
  targetNodeId?: string | null;
  source: "user";
  assignmentType: "user_new" | "user_previous";
  reason: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectSnapshot = {
  mainWindowId: string;
  activeTreeWindowId: string | null;
  currentDocumentId: string | null;
  activeVersionNodeId: string | null;
  selectedAnchorId: string | null;
  selectedThreadId: string | null;
  activeRevisionBranchId: string | null;
  activeMergeRecordId: string | null;
  windows: Records<WindowInstance>;
  sessions: Records<ConversationSession>;
  conversationMessages: Records<ConversationMessage>;
  documents: Records<Document>;
  blocks: Records<AnswerBlock>;
  anchors: Records<Anchor>;
  threads: Records<LocalThread>;
  messages: Records<ThreadMessage>;
  annotations: Records<Annotation>;
  revisionAnnotations: Records<AnnotationModel>;
  versionNodes: Records<VersionNode>;
  branches: Records<Branch>;
  comparisons: Records<ArgumentComparison>;
  snapshots: Records<VersionSnapshot>;
  tombstones: Records<DeletedAnswerTombstone>;
  contextSnapshots: Records<ContextSnapshot>;
  llmCallRecords: Records<LLMCallRecord>;
  mainConversations: Records<MainConversationModel>;
  revisionMessages: Records<MessageModel>;
  documentVersions: Records<DocumentVersionModel>;
  manualEditDrafts: Records<ManualEditDraftModel>;
  textSelections: Records<TextSelectionModel>;
  localThreads: Records<LocalThreadModel>;
  localSelections: Records<LocalSelectionModel>;
  revisionBranches: Records<RevisionBranchModel>;
  mergeRecords: Records<MergeRecordModel>;
  comparisonGraphs: Records<ComparisonGraphModel>;
  comparisonRuns: Records<ComparisonRunModel>;
  comparisonExports: Records<ComparisonExportModel>;
  objectStateTransitions: Records<ObjectStateTransitionModel>;
  timelinePaths: Records<TimelinePathModel>;
  revertRecords: Records<RevertRecordModel>;
  eventLogs: Records<EventLogRecord>;
  timelineNodes: Records<RevisionTimelineNode>;
  timelineEdges: Records<RevisionTimelineEdge>;
  actionIdempotencyRecords: Records<ActionIdempotencyRecord>;
  migrationJobs: Records<MigrationJobModel>;
  migrationBatches: Records<MigrationBatchModel>;
  migrationIssues: Records<MigrationIssueModel>;
  backfillRecords: Records<BackfillRecordModel>;
  featureFlags: Records<FeatureFlagModel>;
  workspaceIndexes: Records<WorkspaceIndexDefinition>;
  workspaceMetrics: Records<WorkspaceMetricRecord>;
  timelineNodeProjections: Records<TimelineNodeProjectionModel>;
  timelineGraphSnapshots: Records<TimelineGraphSnapshotModel>;
  objectRelationIndex: Records<ObjectRelationIndexModel>;
  contextItemIndex: Records<ContextItemIndexModel>;
  threadSummaries: Records<ThreadSummaryModel>;
  documentChunks: Records<DocumentChunkModel>;
  contextBuildCaches: Records<ContextBuildCacheModel>;
  revisionSuggestions: Record<string, string>;
  logicAssignments: Records<LogicAssignment>;
};

export type ReviewFocus = {
  id: string;
  source: "semantic_difference_map" | "manual";
  semanticRowId?: string;
  anchorId?: string;
  documentId?: string;
  originalBlockId?: string;
  revisedBlockId?: string;
  originalText?: string;
  revisedText?: string;
  originalIndex?: number;
  revisedIndex?: number;
  primaryChange?: string;
  createdAt: string;
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
  textHash?: string;
  conversationId?: string;
  sourceType?: TextSelectionModel["sourceType"];
  sourceId?: string;
  sourceDocumentVersionId?: string;
  sourceDocumentVersionNumber?: number;
  sourcePathStatus?: "active" | "inactive" | "discarded" | "deleted";
  sourceVersionNodeId?: string;
  createdFromWindowId?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  sourceLocalThreadId?: string;
  sourceAnswerId?: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceThreadType?: "local" | "nested_local";
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
    activeRevisionBranchId: null,
    activeMergeRecordId: null,
    windows: conversationState.windows,
    sessions: conversationState.sessions,
    conversationMessages: {},
    documents: {},
    blocks: {},
    anchors: {},
    threads: {},
    messages: {},
    annotations: {},
    revisionAnnotations: {},
    versionNodes: {},
    branches: {},
    comparisons: {},
    snapshots: {},
    tombstones: {},
    contextSnapshots: {},
    llmCallRecords: {},
    mainConversations: {},
    revisionMessages: {},
    documentVersions: {},
    manualEditDrafts: {},
    textSelections: {},
    localThreads: {},
    localSelections: {},
    revisionBranches: {},
    mergeRecords: {},
    comparisonGraphs: {},
    comparisonRuns: {},
    comparisonExports: {},
    objectStateTransitions: {},
    timelinePaths: {},
    revertRecords: {},
    eventLogs: {},
    timelineNodes: {},
    timelineEdges: {},
    actionIdempotencyRecords: {},
    migrationJobs: {},
    migrationBatches: {},
    migrationIssues: {},
    backfillRecords: {},
    featureFlags: {},
    workspaceIndexes: {},
    workspaceMetrics: {},
    timelineNodeProjections: {},
    timelineGraphSnapshots: {},
    objectRelationIndex: {},
    contextItemIndex: {},
    threadSummaries: {},
    documentChunks: {},
    contextBuildCaches: {},
    revisionSuggestions: {},
    logicAssignments: {}
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
    activeRevisionBranchId: state.activeRevisionBranchId,
    activeMergeRecordId: state.activeMergeRecordId,
    windows: state.windows,
    sessions: state.sessions,
    conversationMessages: state.conversationMessages,
    documents: state.documents,
    blocks: state.blocks,
    anchors: state.anchors,
    threads: state.threads,
    messages: state.messages,
    annotations: state.annotations,
    revisionAnnotations: state.revisionAnnotations,
    versionNodes: state.versionNodes,
    branches: state.branches,
    comparisons: state.comparisons,
    snapshots: state.snapshots,
    tombstones: state.tombstones,
    contextSnapshots: state.contextSnapshots,
    llmCallRecords: state.llmCallRecords,
    mainConversations: state.mainConversations,
    revisionMessages: state.revisionMessages,
    documentVersions: state.documentVersions,
    manualEditDrafts: state.manualEditDrafts,
    textSelections: state.textSelections,
    localThreads: state.localThreads,
    localSelections: state.localSelections,
    revisionBranches: state.revisionBranches,
    mergeRecords: state.mergeRecords,
    comparisonGraphs: state.comparisonGraphs,
    comparisonRuns: state.comparisonRuns,
    comparisonExports: state.comparisonExports,
    objectStateTransitions: state.objectStateTransitions,
    timelinePaths: state.timelinePaths,
    revertRecords: state.revertRecords,
    eventLogs: state.eventLogs,
    timelineNodes: state.timelineNodes,
    timelineEdges: state.timelineEdges,
    actionIdempotencyRecords: state.actionIdempotencyRecords,
    migrationJobs: state.migrationJobs,
    migrationBatches: state.migrationBatches,
    migrationIssues: state.migrationIssues,
    backfillRecords: state.backfillRecords,
    featureFlags: state.featureFlags,
    workspaceIndexes: state.workspaceIndexes,
    workspaceMetrics: state.workspaceMetrics,
    timelineNodeProjections: state.timelineNodeProjections,
    timelineGraphSnapshots: state.timelineGraphSnapshots,
    objectRelationIndex: state.objectRelationIndex,
    contextItemIndex: state.contextItemIndex,
    threadSummaries: state.threadSummaries,
    documentChunks: state.documentChunks,
    contextBuildCaches: state.contextBuildCaches,
    revisionSuggestions: state.revisionSuggestions,
    logicAssignments: state.logicAssignments
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
    isGeneratingComparison: false,
    pendingMergeDiff: null,
    mergeConflictMessage: null,
    activeRevisionBranchId: snapshot.activeRevisionBranchId ?? null,
    activeMergeRecordId: snapshot.activeMergeRecordId ?? null,
    logicAssignments: snapshot.logicAssignments ?? {},
    activeReviewFocus: null
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
  activeRevisionBranchId: string | null;
  activeMergeRecordId: string | null;
  windows: Records<WindowInstance>;
  sessions: Records<ConversationSession>;
  conversationMessages: Records<ConversationMessage>;
  documents: Records<Document>;
  blocks: Records<AnswerBlock>;
  anchors: Records<Anchor>;
  threads: Records<LocalThread>;
  messages: Records<ThreadMessage>;
    annotations: Records<Annotation>;
  revisionAnnotations: Records<AnnotationModel>;
  versionNodes: Records<VersionNode>;
  branches: Records<Branch>;
  comparisons: Records<ArgumentComparison>;
  snapshots: Records<VersionSnapshot>;
  tombstones: Records<DeletedAnswerTombstone>;
  contextSnapshots: Records<ContextSnapshot>;
  llmCallRecords: Records<LLMCallRecord>;
  mainConversations: Records<MainConversationModel>;
  revisionMessages: Records<MessageModel>;
  documentVersions: Records<DocumentVersionModel>;
  manualEditDrafts: Records<ManualEditDraftModel>;
  textSelections: Records<TextSelectionModel>;
  localThreads: Records<LocalThreadModel>;
  localSelections: Records<LocalSelectionModel>;
  revisionBranches: Records<RevisionBranchModel>;
  mergeRecords: Records<MergeRecordModel>;
  comparisonGraphs: Records<ComparisonGraphModel>;
  comparisonRuns: Records<ComparisonRunModel>;
  comparisonExports: Records<ComparisonExportModel>;
  objectStateTransitions: Records<ObjectStateTransitionModel>;
  timelinePaths: Records<TimelinePathModel>;
  revertRecords: Records<RevertRecordModel>;
  eventLogs: Records<EventLogRecord>;
  timelineNodes: Records<RevisionTimelineNode>;
  timelineEdges: Records<RevisionTimelineEdge>;
  actionIdempotencyRecords: Records<ActionIdempotencyRecord>;
  migrationJobs: Records<MigrationJobModel>;
  migrationBatches: Records<MigrationBatchModel>;
  migrationIssues: Records<MigrationIssueModel>;
  backfillRecords: Records<BackfillRecordModel>;
  featureFlags: Records<FeatureFlagModel>;
  workspaceIndexes: Records<WorkspaceIndexDefinition>;
  workspaceMetrics: Records<WorkspaceMetricRecord>;
  timelineNodeProjections: Records<TimelineNodeProjectionModel>;
  timelineGraphSnapshots: Records<TimelineGraphSnapshotModel>;
  objectRelationIndex: Records<ObjectRelationIndexModel>;
  contextItemIndex: Records<ContextItemIndexModel>;
  threadSummaries: Records<ThreadSummaryModel>;
  documentChunks: Records<DocumentChunkModel>;
  contextBuildCaches: Records<ContextBuildCacheModel>;
  logicAssignments: Records<LogicAssignment>;
  showContextDebugPanel: boolean;
  isDiffModalOpen: boolean;
  pendingPatch: PatchOperation[];
  pendingMergeDiff: TextDiff | null;
  mergeConflictMessage: string | null;
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
  activeReviewFocus: ReviewFocus | null;
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
  setActiveReviewFocus: (focus: ReviewFocus | null) => void;
  createProject: () => void;
  renameProject: (projectId: string, name: string) => void;
  deleteProject: (projectId: string) => boolean;
  switchProject: (projectId: string) => void;
  resetWorkspace: () => void;
  toggleNavigation: () => void;
  closeSideThread: () => void;
  minimizeSideThread: () => void;
  restoreSideThread: () => void;
  openComparisonWindow: (comparisonId: string) => void;
  closeComparisonWindow: () => void;
  toggleComparisonExpanded: () => void;
  closeRevisionBranchPanel: () => void;
  saveRevisionBranchDraft: (branchId: string, draftContent: string) => void;
  addBranchContextNote: (branchId: string, content: string) => void;
  setActiveUtilityPanel: (panel: AnswerAtlasState["activeUtilityPanel"]) => void;
  loadModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;
  setWindowModel: (windowId: string, model: string) => void;
  generateDocumentFromPrompt: (prompt: string) => Promise<void>;
  regenerateMainAnswer: () => Promise<void>;
  createManualEditDraft: () => string | null;
  updateManualEditDraftContent: (draftId: string, content: string) => void;
  previewManualEditDraftDiff: (
    draftId: string,
    content?: string
  ) => TextDiff | null;
  confirmManualEditDraft: (
    draftId: string,
    content?: string
  ) =>
    | {
        ok: true;
        diff: TextDiff;
        documentVersionId: string;
      }
    | {
        ok: false;
        conflict: true;
        baseDocumentVersionId: string;
        activeDocumentVersionId?: string;
        diffAgainstCurrent?: TextDiff;
      }
    | null;
  cancelManualEditDraft: (draftId: string) => void;
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
  regenerateComparisonGraph: (comparisonId: string) => void;
  clearComparisonGraph: (
    comparisonId: string,
    legacyComparisonId?: string
  ) => void;
  deleteComparisonGraph: (
    comparisonId: string,
    legacyComparisonId?: string
  ) => void;
  exportComparisonGraph: (comparisonId: string) => void;
  executeRevisionAction: (
    actionId: WorkspaceActionId,
    payload: ExecuteWorkspaceActionPayload
  ) => ExecuteWorkspaceActionResult;
  deleteThreadMessage: (messageId: string) => void;
  addAnnotation: (content: string) => void;
  deleteAnnotation: (annotationId: string) => void;
  keepAsNote: (threadId: string) => void;
  createBranch: (threadId: string) => void;
  requestMerge: (threadId: string) => void;
  requestMergeFromSelection: (selection: TextSelectionInput) => void;
  openMergeModalForSource: (
    sourceType: MergeSourceType,
    sourceId: string,
    mergeMode?: MergeMode
  ) => void;
  setMergeMode: (mergeMode: MergeMode) => void;
  setManualMergeTarget: (start: number, end: number) => void;
  cancelActiveMerge: () => void;
  confirmMerge: () => void;
  closeDiffModal: () => void;
  discardThread: (threadId: string) => void;
  deleteAnswer: (threadId: string) => void;
  revertToNode: (nodeId: string) => void;
  returnToDocumentVersion: (versionId: string) => void;
  toggleContextDebugPanel: () => void;
  refreshContextPreview: () => void;
  setLogicAssignment: (
    nodeId: string,
    assignment: {
      logicFocusKey?: string;
      logicFocusLabel: string;
      targetNodeId?: string | null;
      assignmentType: LogicAssignment["assignmentType"];
      reason?: string;
    }
  ) => void;
  clearLogicAssignment: (nodeId: string) => void;
};

function nodeIdCandidatesForMessageId(messageId?: string) {
  if (!messageId) {
    return [];
  }

  const groups = [
    {
      prefix: "rev-message-assistant-",
      nodePrefixes: ["v-created-", "v-main-answer-"]
    },
    {
      prefix: "conv-assistant-",
      nodePrefixes: ["v-created-", "v-main-answer-"]
    },
    {
      prefix: "rev-message-regenerated-",
      nodePrefixes: ["v-main-answer-", "v-created-"]
    },
    {
      prefix: "rev-local-message-assistant-",
      nodePrefixes: ["v-local-answer-"]
    },
    {
      prefix: "rev-nested-local-message-assistant-",
      nodePrefixes: ["v-local-answer-"]
    },
    {
      prefix: "msg-assistant-",
      nodePrefixes: ["v-local-answer-"]
    }
  ];
  const matchedGroup = groups.find((group) => messageId.startsWith(group.prefix));

  if (!matchedGroup) {
    return [];
  }

  const suffix = messageId.slice(matchedGroup.prefix.length);

  return matchedGroup.nodePrefixes.map((prefix) => `${prefix}${suffix}`);
}

function isVersionNodeActive(state: AnswerAtlasState, nodeId?: string | null) {
  if (!nodeId) {
    return undefined;
  }

  const node = state.versionNodes[nodeId];

  return node ? node.isActivePath : undefined;
}

function isSourceMessageActive(state: AnswerAtlasState, messageId?: string | null) {
  const candidates = nodeIdCandidatesForMessageId(messageId ?? undefined);

  for (const candidate of candidates) {
    const active = isVersionNodeActive(state, candidate);

    if (typeof active === "boolean") {
      return active;
    }
  }

  return undefined;
}

function isDocumentVersionActive(
  state: AnswerAtlasState,
  documentVersionId?: string | null
) {
  if (!documentVersionId) {
    return undefined;
  }

  const version = state.documentVersions[documentVersionId];

  if (!version) {
    return undefined;
  }

  if (version.status === "deleted" || version.status === "inactive") {
    return false;
  }

  return isVersionNodeActive(state, version.createdFromTimelineNodeId);
}

function isTextSelectionModelActive(state: AnswerAtlasState, selectionId?: string | null) {
  if (!selectionId) {
    return undefined;
  }

  const selection = state.textSelections[selectionId];

  if (!selection) {
    return undefined;
  }

  if (selection.status === "deleted" || selection.status === "discarded") {
    return false;
  }

  return (
    isSourceMessageActive(state, selection.sourceMessageId) ??
    isDocumentVersionActive(state, selection.sourceDocumentVersionId) ??
    true
  );
}

function isAnchorActiveAfterTimelineChange(
  state: AnswerAtlasState,
  anchorId?: string | null,
  visited = new Set<string>()
): boolean | undefined {
  if (!anchorId) {
    return undefined;
  }

  const visitKey = `anchor:${anchorId}`;

  if (visited.has(visitKey)) {
    return undefined;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);

  const anchor = state.anchors[anchorId];

  if (!anchor) {
    return undefined;
  }

  const textSelectionActive = isTextSelectionModelActive(state, anchorId);

  if (typeof textSelectionActive === "boolean") {
    return textSelectionActive;
  }

  const messageActive = isSourceMessageActive(state, anchor.sourceMessageId);

  if (typeof messageActive === "boolean") {
    return messageActive;
  }

  if (anchor.sourceThreadId) {
    return isThreadActiveAfterTimelineChange(
      state,
      anchor.sourceThreadId,
      nextVisited
    );
  }

  const block = anchor.blockId ? state.blocks[anchor.blockId] : undefined;

  if (block) {
    return isVersionNodeActive(state, block.createdInVersionNodeId) ?? true;
  }

  return true;
}

function isThreadActiveAfterTimelineChange(
  state: AnswerAtlasState,
  threadId?: string | null,
  visited = new Set<string>()
): boolean | undefined {
  if (!threadId) {
    return undefined;
  }

  const visitKey = `thread:${threadId}`;

  if (visited.has(visitKey)) {
    return undefined;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);

  const thread = state.threads[threadId];

  if (!thread) {
    return undefined;
  }

  if (thread.status === "deleted" || thread.status === "discarded") {
    return false;
  }

  return (
    isVersionNodeActive(state, thread.createdInVersionNodeId) ??
    isAnchorActiveAfterTimelineChange(state, thread.anchorId, nextVisited) ??
    true
  );
}

function isComparisonActiveAfterTimelineChange(
  state: AnswerAtlasState,
  comparison?: ArgumentComparison
) {
  if (!comparison) {
    return false;
  }

  if (comparison.status === "deleted" || comparison.status === "discarded") {
    return false;
  }

  return (
    isVersionNodeActive(state, comparison.createdInVersionNodeId) ??
    isAnchorActiveAfterTimelineChange(state, comparison.anchorId) ??
    true
  );
}

function isBranchActiveAfterTimelineChange(
  state: AnswerAtlasState,
  branchId?: string | null
) {
  if (!branchId) {
    return undefined;
  }

  const branch = state.branches[branchId];
  const revisionBranch = state.revisionBranches[branchId];

  if (branch?.status === "deleted" || branch?.status === "discarded") {
    return false;
  }

  if (revisionBranch?.status === "deleted" || revisionBranch?.status === "discarded") {
    return false;
  }

  return (
    isVersionNodeActive(state, branch?.headVersionNodeId) ??
    isVersionNodeActive(state, revisionBranch?.headTimelineNodeId) ??
    isAnchorActiveAfterTimelineChange(state, branch?.anchorId) ??
    isThreadActiveAfterTimelineChange(state, branch?.threadId) ??
    true
  );
}

function isMergeActiveAfterTimelineChange(
  state: AnswerAtlasState,
  mergeId?: string | null
) {
  if (!mergeId) {
    return undefined;
  }

  const merge = state.mergeRecords[mergeId];

  if (!merge) {
    return undefined;
  }

  if (merge.status === "deleted" || merge.status === "discarded") {
    return false;
  }

  return (
    isTextSelectionModelActive(state, merge.sourceSelectionId) ??
    isThreadActiveAfterTimelineChange(state, merge.sourceLocalThreadId) ??
    isBranchActiveAfterTimelineChange(state, merge.sourceBranchId) ??
    isSourceMessageActive(state, merge.sourceMessageId) ??
    true
  );
}

function reconcileWorkspaceFocusAfterTimelineChange(state: AnswerAtlasState) {
  const selectedAnchorActive = isAnchorActiveAfterTimelineChange(
    state,
    state.selectedAnchorId
  );
  const selectedAnchorId =
    selectedAnchorActive === false ? null : state.selectedAnchorId;
  const selectedThreadActive = isThreadActiveAfterTimelineChange(
    state,
    state.selectedThreadId
  );
  const selectedThreadId =
    selectedThreadActive === false ? null : state.selectedThreadId;
  const activeComparison = state.activeTreeWindowId
    ? Object.values(state.comparisons).find(
        (comparison) => treeWindowId(comparison.id) === state.activeTreeWindowId
      )
    : undefined;
  const comparisonActive = isComparisonActiveAfterTimelineChange(
    state,
    activeComparison
  );
  const activeTreeWindowId =
    comparisonActive === false ? null : state.activeTreeWindowId;
  const reviewFocusActive =
    state.activeReviewFocus?.anchorId
      ? isAnchorActiveAfterTimelineChange(state, state.activeReviewFocus.anchorId)
      : state.activeReviewFocus?.documentId
        ? state.activeReviewFocus.documentId === state.currentDocumentId
        : true;
  const activeRevisionBranchActive = isBranchActiveAfterTimelineChange(
    state,
    state.activeRevisionBranchId
  );
  const activeRevisionBranchId =
    activeRevisionBranchActive === false ? null : state.activeRevisionBranchId;
  const activeMergeRecordActive = isMergeActiveAfterTimelineChange(
    state,
    state.activeMergeRecordId
  );
  const activeMergeRecordId =
    activeMergeRecordActive === false ? null : state.activeMergeRecordId;
  const shouldCloseMerge = activeMergeRecordActive === false;
  const shouldCloseSideThread =
    selectedThreadActive === false || selectedAnchorActive === false;
  const shouldCloseComparison = comparisonActive === false;

  return {
    ...state,
    selectedAnchorId,
    selectedThreadId,
    activeReviewFocus: reviewFocusActive === false ? null : state.activeReviewFocus,
    activeRevisionBranchId,
    activeMergeRecordId,
    pendingMergeDiff: shouldCloseMerge ? null : state.pendingMergeDiff,
    mergeConflictMessage: shouldCloseMerge ? null : state.mergeConflictMessage,
    isDiffModalOpen: shouldCloseMerge ? false : state.isDiffModalOpen,
    pendingPatch: shouldCloseMerge ? [] : state.pendingPatch,
    isSideThreadOpen: shouldCloseSideThread ? false : state.isSideThreadOpen,
    isSideThreadMinimized: shouldCloseSideThread
      ? false
      : state.isSideThreadMinimized,
    activeTreeWindowId: shouldCloseComparison ? null : activeTreeWindowId,
    isComparisonExpanded: shouldCloseComparison ? false : state.isComparisonExpanded,
    isGeneratingComparison: shouldCloseComparison ? false : state.isGeneratingComparison
  };
}

function makeIdSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyContextPreview(): ContextPreview {
  return {
    includedItems: [],
    excludedItems: [],
    tokenEstimate: 0
  };
}

function contextItemToSnapshotItem(item: {
  id?: string;
  type: string;
  sourceId?: string;
  text: string;
  reason: string;
}, index: number, included: boolean): ContextSnapshotItem {
  return {
    id: item.id ?? `ctx-custom-${index}`,
    type: item.type,
    sourceId: item.sourceId,
    text: item.text,
    reason: item.reason,
    included
  };
}

function contextPreviewToSnapshotItems(preview: ContextPreview) {
  return {
    includedItems: preview.includedItems.map((item, index) =>
      contextItemToSnapshotItem(item, index, true)
    ),
    excludedItems: preview.excludedItems.map((item, index) =>
      contextItemToSnapshotItem(item, index, false)
    )
  };
}

function customContextItemsToPreview(
  contextItems: Array<{ type: string; text: string; reason: string }>
): ContextPreview {
  const includedItems = contextItems.map((item, index) =>
    contextItemToSnapshotItem(item, index, true)
  );

  return {
    includedItems: includedItems as never,
    excludedItems: [],
    tokenEstimate: Math.ceil(
      includedItems.reduce((total, item) => total + item.text.length, 0) / 4
    )
  };
}

function createLLMTrace(params: {
  suffix: string;
  projectId: string;
  callType: ContextSnapshot["callType"];
  purpose: ContextSnapshot["purpose"];
  model: string;
  provider?: "openai" | "mock";
  status: LLMCallRecord["status"];
  prompt: string;
  preview: ContextPreview;
  windowId?: string;
  sessionId?: string;
  documentId?: string;
  activeVersionNodeId?: string;
  threadId?: string;
  comparisonId?: string;
  outputMessageId?: string;
  outputObjectId?: string;
  createdAt: string;
  completedAt?: string;
}) {
  const llmCallId = `llm-call-${params.suffix}`;
  const contextSnapshotId = `context-snapshot-${params.suffix}`;
  const snapshotItems = contextPreviewToSnapshotItems(params.preview);
  const completedAt = params.completedAt ?? new Date().toISOString();
  const contextSnapshot: ContextSnapshot = {
    id: contextSnapshotId,
    llmCallId,
    projectId: params.projectId,
    callType: params.callType,
    purpose: params.purpose,
    model: params.model,
    windowId: params.windowId,
    sessionId: params.sessionId,
    documentId: params.documentId,
    activeVersionNodeId: params.activeVersionNodeId,
    threadId: params.threadId,
    comparisonId: params.comparisonId,
    includedItems: snapshotItems.includedItems,
    excludedItems: snapshotItems.excludedItems,
    tokenEstimate: params.preview.tokenEstimate,
    createdAt: completedAt
  };
  const llmCallRecord: LLMCallRecord = {
    id: llmCallId,
    projectId: params.projectId,
    callType: params.callType,
    purpose: params.purpose,
    model: params.model,
    provider: params.provider,
    status: params.status,
    prompt: params.prompt,
    contextSnapshotId,
    windowId: params.windowId,
    sessionId: params.sessionId,
    documentId: params.documentId,
    activeVersionNodeId: params.activeVersionNodeId,
    threadId: params.threadId,
    comparisonId: params.comparisonId,
    outputMessageId: params.outputMessageId,
    outputObjectId: params.outputObjectId,
    createdAt: params.createdAt,
    completedAt
  };

  return {
    contextSnapshot,
    llmCallRecord
  };
}

function revisionStateFromStore(state: AnswerAtlasState): RevisionRepositoryState {
  return {
    projects: Object.fromEntries(
      Object.values(state.projects).map((project) => {
        const projectConversation = Object.values(state.mainConversations)
          .filter(
            (conversation) =>
              conversation.projectId === project.id &&
              conversation.status !== "deleted"
          )
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];

        return [
          project.id,
          {
            id: project.id,
            name: project.name,
            status: "active" as const,
            activeConversationId: projectConversation?.id,
            activeDocumentVersionId:
              projectConversation?.activeDocumentVersionId,
            activeTimelineNodeId: projectConversation?.activeTimelineNodeId,
            activeTimelinePathId: projectConversation?.activeTimelinePathId,
            createdAt: project.snapshot.documents
              ? Object.values(project.snapshot.documents)[0]?.createdAt ??
                project.updatedAt
              : project.updatedAt,
            updatedAt: project.updatedAt
          }
        ];
      })
    ),
    mainConversations: state.mainConversations,
    revisionMessages: state.revisionMessages,
    documentVersions: state.documentVersions,
    manualEditDrafts: state.manualEditDrafts,
    textSelections: state.textSelections,
    localThreads: state.localThreads,
    localSelections: state.localSelections,
    annotations: state.revisionAnnotations,
    revisionBranches: state.revisionBranches,
    mergeRecords: state.mergeRecords,
    comparisonGraphs: state.comparisonGraphs,
    comparisonRuns: state.comparisonRuns,
    comparisonExports: state.comparisonExports,
    objectStateTransitions: state.objectStateTransitions,
    timelinePaths: state.timelinePaths,
    revertRecords: state.revertRecords,
    eventLogs: state.eventLogs,
    timelineNodes: state.timelineNodes,
    timelineEdges: state.timelineEdges,
    llmCallRecords: state.llmCallRecords,
    contextSnapshots: state.contextSnapshots,
    actionIdempotencyRecords: state.actionIdempotencyRecords ?? {},
    migrationJobs: state.migrationJobs,
    migrationBatches: state.migrationBatches,
    migrationIssues: state.migrationIssues,
    backfillRecords: state.backfillRecords,
    featureFlags: state.featureFlags,
    workspaceIndexes: state.workspaceIndexes,
    workspaceMetrics: state.workspaceMetrics,
    timelineNodeProjections: state.timelineNodeProjections,
    timelineGraphSnapshots: state.timelineGraphSnapshots,
    objectRelationIndex: state.objectRelationIndex,
    contextItemIndex: state.contextItemIndex,
    threadSummaries: state.threadSummaries,
    documentChunks: state.documentChunks,
    contextBuildCaches: state.contextBuildCaches
  };
}

function revisionStorePatch(
  state: RevisionRepositoryState
): Pick<
  AnswerAtlasState,
  | "mainConversations"
  | "revisionMessages"
  | "documentVersions"
  | "manualEditDrafts"
  | "textSelections"
  | "localThreads"
  | "localSelections"
  | "revisionAnnotations"
  | "revisionBranches"
  | "mergeRecords"
  | "comparisonGraphs"
  | "comparisonRuns"
  | "comparisonExports"
  | "objectStateTransitions"
  | "timelinePaths"
  | "revertRecords"
  | "eventLogs"
  | "timelineNodes"
  | "timelineEdges"
  | "llmCallRecords"
  | "contextSnapshots"
  | "actionIdempotencyRecords"
  | "migrationJobs"
  | "migrationBatches"
  | "migrationIssues"
  | "backfillRecords"
  | "featureFlags"
  | "workspaceIndexes"
  | "workspaceMetrics"
  | "timelineNodeProjections"
  | "timelineGraphSnapshots"
  | "objectRelationIndex"
  | "contextItemIndex"
  | "threadSummaries"
  | "documentChunks"
  | "contextBuildCaches"
> {
  return {
    mainConversations: state.mainConversations,
    revisionMessages: state.revisionMessages,
    documentVersions: state.documentVersions,
    manualEditDrafts: state.manualEditDrafts,
    textSelections: state.textSelections,
    localThreads: state.localThreads,
    localSelections: state.localSelections,
    revisionAnnotations: state.annotations,
    revisionBranches: state.revisionBranches,
    mergeRecords: state.mergeRecords,
    comparisonGraphs: state.comparisonGraphs,
    comparisonRuns: state.comparisonRuns,
    comparisonExports: state.comparisonExports,
    objectStateTransitions: state.objectStateTransitions,
    timelinePaths: state.timelinePaths,
    revertRecords: state.revertRecords,
    eventLogs: state.eventLogs,
    timelineNodes: state.timelineNodes,
    timelineEdges: state.timelineEdges,
    llmCallRecords: state.llmCallRecords,
    contextSnapshots: state.contextSnapshots,
    actionIdempotencyRecords: state.actionIdempotencyRecords,
    migrationJobs: state.migrationJobs,
    migrationBatches: state.migrationBatches,
    migrationIssues: state.migrationIssues,
    backfillRecords: state.backfillRecords,
    featureFlags: state.featureFlags,
    workspaceIndexes: state.workspaceIndexes,
    workspaceMetrics: state.workspaceMetrics,
    timelineNodeProjections: state.timelineNodeProjections,
    timelineGraphSnapshots: state.timelineGraphSnapshots,
    objectRelationIndex: state.objectRelationIndex,
    contextItemIndex: state.contextItemIndex,
    threadSummaries: state.threadSummaries,
    documentChunks: state.documentChunks,
    contextBuildCaches: state.contextBuildCaches
  };
}

function activeDocumentVersionFromStore(
  state: AnswerAtlasState,
  conversationId?: string
) {
  return DocumentVersionService.getActiveDocumentVersion(
    revisionStateFromStore(state),
    state.currentProjectId,
    conversationId
  );
}

function syncRevisionFoundation(partial: Partial<RevisionRepositoryState>) {
  if (typeof window === "undefined") {
    revisionRepository.mergeState(partial);
    return Promise.resolve();
  }

  revisionRepository.mergeState(partial);
  return fetch("/api/revision/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(partial)
  })
    .then(() => undefined)
    .catch(() => {
    // Local persistence remains authoritative for the MVP if server sync fails.
    });
}

function latestRevisionTimelineNode(
  state: AnswerAtlasState,
  objectType: RevisionTimelineNode["targetObjectType"],
  objectId: string
) {
  return Object.values(state.timelineNodes)
    .filter(
      (node) =>
        node.targetObjectType === objectType &&
        node.targetObjectId === objectId &&
        node.status === "active"
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
}

function defaultNoteScopeForThread(state: AnswerAtlasState, thread?: LocalThread) {
  if (!thread) {
    return {
      scopeType: "project" as const,
      scopeId: state.currentProjectId
    };
  }

  if (thread.revisionThreadType === "nested_local" && thread.revisionLocalThreadId) {
    return {
      scopeType: "nested_local_thread" as const,
      scopeId: thread.revisionLocalThreadId
    };
  }

  if (thread.sourceSelectionId) {
    return {
      scopeType: "selected_text" as const,
      scopeId: thread.sourceSelectionId
    };
  }

  if (thread.revisionLocalThreadId) {
    return {
      scopeType: "local_thread" as const,
      scopeId: thread.revisionLocalThreadId
    };
  }

  return {
    scopeType: "project" as const,
    scopeId: state.currentProjectId
  };
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

function visibleVersionNodeIdForDocumentVersion(
  state: AnswerAtlasState,
  document: Document,
  version: DocumentVersionModel,
  fallbackNodeId: string
) {
  if (
    version.createdFromTimelineNodeId &&
    state.versionNodes[version.createdFromTimelineNodeId]
  ) {
    return version.createdFromTimelineNodeId;
  }

  if (
    (version.versionNumber ?? 1) === 1 &&
    document.rootVersionNodeId &&
    state.versionNodes[document.rootVersionNodeId]
  ) {
    return document.rootVersionNodeId;
  }

  return version.createdFromTimelineNodeId ?? fallbackNodeId;
}

function syncVisibleDocumentVersion(
  state: AnswerAtlasState,
  version: DocumentVersionModel,
  fallbackNodeId: string
) {
  const documentId = version.documentId ?? state.currentDocumentId;

  if (!documentId) {
    return state;
  }

  const document = state.documents[documentId];

  if (!document) {
    return state;
  }

  const activeVersionNodeId = visibleVersionNodeIdForDocumentVersion(
    state,
    document,
    version,
    fallbackNodeId
  );
  const syncedDocument: Document = {
    ...document,
    rawText: version.content,
    title: version.title ?? document.title,
    activeVersionNodeId,
    updatedAt: new Date().toISOString()
  };

  if (!state.versionNodes[activeVersionNodeId]) {
    const node: VersionNode = {
      id: activeVersionNodeId,
      documentId,
      parentId: document.activeVersionNodeId ?? state.activeVersionNodeId,
      childIds: [],
      nodeType:
        version.sourceType === "manual_edit" || version.sourceType === "merge"
          ? "document_revised"
          : "document_created",
      label: version.versionNumber
        ? `Document v${version.versionNumber}`
        : "Document version",
      isActivePath: true,
      createdAt: version.createdAt
    };

    return appendVersionNodeAndCheckout(
      {
        ...state,
        currentDocumentId: documentId,
        documents: {
          ...state.documents,
          [documentId]: syncedDocument
        }
      },
      node
    );
  }

  const result = checkoutVersionNode(
    syncedDocument,
    state.versionNodes,
    activeVersionNodeId
  );

  return {
    ...state,
    currentDocumentId: documentId,
    activeVersionNodeId,
    documents: {
      ...state.documents,
      [documentId]: result.document
    },
    versionNodes: result.versionNodes
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

function llmErrorToUserMessage(error: unknown) {
  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Unknown generation error.";

  if (/model|not available|does not exist|unsupported|404/i.test(rawMessage)) {
    return "生成失败：当前选择的模型不可用或不在这个 API key 的可用范围内。请切换模型后重试。";
  }

  if (/401|403|api key|unauthorized|permission/i.test(rawMessage)) {
    return "生成失败：API key 或模型权限验证失败。请检查 key、额度和模型权限后重试。";
  }

  if (/network|fetch|timeout|ECONN|ENOTFOUND/i.test(rawMessage)) {
    return "生成失败：模型请求没有连通。请检查网络或稍后重试。";
  }

  return "生成失败：LLM 请求没有完成。请换一个模型或稍后重试。";
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
    sourceSelectionId: anchor.id,
    revisionLocalThreadId: `local-thread-${anchor.id}`,
    revisionThreadType: "local",
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

export const useAnswerAtlasStore = create<AnswerAtlasState>()(
  persist(
    (set, get) => ({
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
  activeRevisionBranchId: null,
  activeMergeRecordId: null,
  windows: initialConversationState.windows,
  sessions: initialConversationState.sessions,
  conversationMessages: {},
  documents: {},
  blocks: {},
  anchors: {},
  threads: {},
  messages: {},
  annotations: {},
  revisionAnnotations: {},
  versionNodes: {},
  branches: {},
  comparisons: {},
  snapshots: {},
  tombstones: {},
  contextSnapshots: {},
  llmCallRecords: {},
  mainConversations: {},
  revisionMessages: {},
  documentVersions: {},
  manualEditDrafts: {},
  textSelections: {},
  localThreads: {},
  localSelections: {},
  revisionBranches: {},
  mergeRecords: {},
  comparisonGraphs: {},
  comparisonRuns: {},
  comparisonExports: {},
  objectStateTransitions: {},
  timelinePaths: {},
  revertRecords: {},
  eventLogs: {},
  timelineNodes: {},
  timelineEdges: {},
  actionIdempotencyRecords: {},
  migrationJobs: {},
  migrationBatches: {},
  migrationIssues: {},
  backfillRecords: {},
  featureFlags: {},
  workspaceIndexes: {},
  workspaceMetrics: {},
  timelineNodeProjections: {},
  timelineGraphSnapshots: {},
  objectRelationIndex: {},
  contextItemIndex: {},
  threadSummaries: {},
  documentChunks: {},
  contextBuildCaches: {},
  logicAssignments: {},
  showContextDebugPanel: false,
  isDiffModalOpen: false,
  pendingPatch: [],
  pendingMergeDiff: null,
  mergeConflictMessage: null,
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
  activeReviewFocus: null,
  activeUtilityPanel: null,
  revisionSuggestions: {},

  setLogicAssignment: (nodeId, assignment) => {
    set((state) => {
      const existing = state.logicAssignments[nodeId];
      const now = new Date().toISOString();
      const logicFocusKey =
        assignment.logicFocusKey ??
        existing?.logicFocusKey ??
        `user-logic-${nodeId}-${makeIdSuffix()}`;
      const nextAssignment: LogicAssignment = {
        id: existing?.id ?? `logic-assignment-${nodeId}`,
        nodeId,
        logicFocusKey,
        logicFocusLabel: assignment.logicFocusLabel,
        targetNodeId: assignment.targetNodeId ?? null,
        source: "user",
        assignmentType: assignment.assignmentType,
        reason:
          assignment.reason ??
          (assignment.assignmentType === "user_new"
            ? "User marked this step as a separate logic branch."
            : "User moved this step back to an earlier logic branch."),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      return {
        ...state,
        logicAssignments: {
          ...state.logicAssignments,
          [nodeId]: nextAssignment
        }
      };
    });
  },

  clearLogicAssignment: (nodeId) => {
    set((state) => {
      if (!state.logicAssignments[nodeId]) {
        return state;
      }

      const logicAssignments = { ...state.logicAssignments };

      delete logicAssignments[nodeId];

      return {
        ...state,
        logicAssignments
      };
    });
  },

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

  renameProject: (projectId, name) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    set((state) => {
      const project = state.projects[projectId];

      if (!project) {
        return state;
      }

      return {
        ...state,
        projects: {
          ...state.projects,
          [projectId]: {
            ...project,
            name: trimmedName,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  },

  deleteProject: (projectId) => {
    let deleted = false;

    set((state) => {
      const project = state.projects[projectId];
      const remainingProjects = Object.values(state.projects).filter(
        (item) => item.id !== projectId
      );

      if (!project || remainingProjects.length === 0) {
        return state;
      }

      deleted = true;
      const projects = Object.fromEntries(
        remainingProjects.map((item) => [item.id, item])
      ) as Records<Project>;

      if (projectId !== state.currentProjectId) {
        return {
          ...state,
          projects
        };
      }

      const nextProject = remainingProjects[0];

      return applyProjectSnapshot(
        {
          ...state,
          currentProjectId: nextProject.id,
          projects
        },
        nextProject.snapshot
      );
    });

    if (deleted) {
      get().refreshContextPreview();
    }

    return deleted;
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

  openComparisonWindow: (comparisonId) => {
    set((state) => {
      const comparison = state.comparisons[comparisonId];

      if (!comparison || comparison.status === "deleted") {
        return state;
      }

      const now = new Date().toISOString();
      const windowId = treeWindowId(comparison.id);
      const sessionId = treeSessionId(comparison.id);
      const contextScope = treeContextScope({
        currentDocumentId: comparison.documentId,
        comparisonId: comparison.id
      });
      const existingWindow = state.windows[windowId];
      const existingSession = state.sessions[sessionId];

      return {
        ...state,
        activeTreeWindowId: windowId,
        windows: {
          ...state.windows,
          [windowId]: {
            id: windowId,
            workspaceId: state.currentProjectId,
            windowType: "tree_compare",
            title: "Semantic Difference Map",
            conversationSessionId: sessionId,
            modelConfigId:
              existingWindow?.modelConfigId ?? state.selectedModel ?? DEFAULT_MODEL,
            contextScope,
            linkedDocumentId: comparison.documentId,
            layout: existingWindow?.layout ?? { isMinimized: false },
            createdAt: existingWindow?.createdAt ?? now,
            updatedAt: now
          }
        },
        sessions: {
          ...state.sessions,
          [sessionId]: {
            id: sessionId,
            workspaceId: state.currentProjectId,
            windowId,
            sessionType: "tree_chat",
            modelConfigId:
              existingSession?.modelConfigId ??
              existingWindow?.modelConfigId ??
              state.selectedModel ??
              DEFAULT_MODEL,
            contextScope,
            createdAt: existingSession?.createdAt ?? now,
            updatedAt: now
          }
        }
      };
    });
  },

  closeComparisonWindow: () => {
    set({
      activeTreeWindowId: null,
      isComparisonExpanded: false
    });
  },

  toggleComparisonExpanded: () => {
    set((state) => ({
      isComparisonExpanded: !state.isComparisonExpanded
    }));
  },

  setActiveReviewFocus: (focus) => {
    set({
      activeReviewFocus: focus
    });
  },

  closeRevisionBranchPanel: () => {
    set({
      activeRevisionBranchId: null
    });
  },

  saveRevisionBranchDraft: (branchId, draftContent) => {
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

    set((state) => {
      const branch = state.revisionBranches[branchId];

      if (!branch) {
        return state;
      }

      const updatedBranch: RevisionBranchModel = {
        ...branch,
        draftContent,
        updatedAt: new Date().toISOString(),
        payload: {
          ...branch.payload,
          draft_content: draftContent
        }
      };
      const revisionBranches = {
        ...state.revisionBranches,
        [branchId]: updatedBranch
      };

      revisionSync = {
        revisionBranches
      };

      return {
        ...state,
        revisionBranches
      };
    });

    if (revisionSync) {
      void syncRevisionFoundation(revisionSync);
    }
  },

  addBranchContextNote: (branchId, content) => {
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

    set((state) => {
      const branch = state.revisionBranches[branchId];

      if (!branch || !content.trim()) {
        return state;
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const sourceNode = latestRevisionTimelineNode(
        state,
        "revision_branch",
        branch.id
      );
      const result = AnnotationService.createAnnotationFromManualNote({
        state: revisionStateFromStore(state),
        projectId: state.currentProjectId,
        content,
        title: "Branch context note",
        scopeType: "branch",
        scopeId: branch.id,
        sourceType: "branch_draft",
        sourceId: branch.id,
        sourceText: branch.draftContent ?? branch.content ?? "",
        sourceSelectionId: branch.parentSelectionId,
        sourceLocalSelectionId: branch.parentLocalSelectionId,
        sourceLocalThreadId: branch.sourceLocalThreadId,
        sourceBranchId: branch.id,
        sourceDocumentVersionId: branch.baseDocumentVersionId,
        sourceTimelineNodeId: sourceNode?.id,
        now,
        suffix
      });

      revisionSync = {
        annotations: result.state.annotations,
        eventLogs: result.state.eventLogs,
        timelineNodes: result.state.timelineNodes,
        timelineEdges: result.state.timelineEdges
      };

      return {
        ...state,
        revisionAnnotations: result.state.annotations,
        eventLogs: result.state.eventLogs,
        timelineNodes: result.state.timelineNodes,
        timelineEdges: result.state.timelineEdges
      };
    });

    if (revisionSync) {
      void syncRevisionFoundation(revisionSync);
    }
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

    let pendingMainFailure: {
      suffix: string;
      projectId: string;
      conversationId: string;
      model: string;
      userConversationMessage: ConversationMessage;
      startedRevision: ReturnType<
        typeof MainConversationRevisionService.createStartedMainSend
      >;
    } | null = null;

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
      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const activeDocument = state.currentDocumentId
        ? state.documents[state.currentDocumentId]
        : undefined;
      const activeDocumentVersion = activeDocumentVersionFromStore(
        state,
        mainSession?.id ?? DEFAULT_MAIN_SESSION_ID
      );
      const startedRevision = MainConversationRevisionService.createStartedMainSend({
        state: revisionStateFromStore(state),
        projectId: state.currentProjectId,
        projectName: state.projects[state.currentProjectId]?.name,
        conversationId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        conversationTitle: mainWindow?.title,
        prompt,
        model,
        documentId: activeDocument?.id,
        activeDocumentVersion,
        activeVersionNodeId: state.activeVersionNodeId ?? undefined,
        recentMessages: Object.values(state.revisionMessages).filter(
          (message) =>
            message.projectId === state.currentProjectId &&
            message.conversationId ===
              (mainSession?.id ?? DEFAULT_MAIN_SESSION_ID) &&
            message.status !== "deleted"
        ),
        now,
        suffix
      });
      const contextItems = startedRevision.contextSnapshot.includedItems.map(
        (item) => ({
          type: item.type,
          text: item.text,
          reason: item.reason
        })
      );
      const userConversationMessage: ConversationMessage = {
        id: `conv-user-${suffix}`,
        sessionId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        role: "user",
        content: prompt,
        contentState: "normal",
        includeInContext: true,
        createdAt: now
      };

      pendingMainFailure = {
        suffix,
        projectId: state.currentProjectId,
        conversationId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        model,
        userConversationMessage,
        startedRevision
      };

      set((current) => ({
        ...current,
        conversationMessages: {
          ...current.conversationMessages,
          [userConversationMessage.id]: userConversationMessage
        },
        mainConversations: startedRevision.state.mainConversations,
        revisionMessages: startedRevision.state.revisionMessages,
        documentVersions: startedRevision.state.documentVersions,
        manualEditDrafts: startedRevision.state.manualEditDrafts,
        eventLogs: startedRevision.state.eventLogs,
        timelineNodes: startedRevision.state.timelineNodes,
        timelineEdges: startedRevision.state.timelineEdges,
        contextSnapshots: startedRevision.state.contextSnapshots,
        llmCallRecords: startedRevision.state.llmCallRecords
      }));
      syncRevisionFoundation({
        projects: startedRevision.state.projects,
        mainConversations: startedRevision.state.mainConversations,
        revisionMessages: startedRevision.state.revisionMessages,
        documentVersions: startedRevision.state.documentVersions,
        manualEditDrafts: startedRevision.state.manualEditDrafts,
        eventLogs: startedRevision.state.eventLogs,
        timelineNodes: startedRevision.state.timelineNodes,
        timelineEdges: startedRevision.state.timelineEdges,
        contextSnapshots: startedRevision.state.contextSnapshots,
        llmCallRecords: startedRevision.state.llmCallRecords
      });

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
        const details = await response.text();

        throw new Error(`Failed to generate document: ${response.status} ${details}`);
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
      const completedRevision = MainConversationRevisionService.completeMainSend({
        state: startedRevision.state,
        projectId: state.currentProjectId,
        conversationId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        prompt,
        answer: assistantText,
        model: data.model,
        provider: data.provider,
        llmCallId: startedRevision.llmCallRecord.id,
        contextSnapshotId: startedRevision.contextSnapshot.id,
        userMessageId: startedRevision.userMessage.id,
        userTimelineNodeId: startedRevision.timelineNodes[0].id,
        documentId: generated.document.id,
        documentTitle: generated.document.title,
        documentContent: generated.document.rawText,
        now: assistantCreatedAt,
        suffix
      });
      const completedRevisionState = completedRevision.state;

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
              revisionAnnotations: {},
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
          mainConversations: completedRevisionState.mainConversations,
          revisionMessages: completedRevisionState.revisionMessages,
          documentVersions: completedRevisionState.documentVersions,
          manualEditDrafts: completedRevisionState.manualEditDrafts,
          eventLogs: completedRevisionState.eventLogs,
          timelineNodes: completedRevisionState.timelineNodes,
          timelineEdges: completedRevisionState.timelineEdges,
          contextSnapshots: completedRevisionState.contextSnapshots,
          llmCallRecords: completedRevisionState.llmCallRecords,
          llmProvider: data.provider,
          selectedModel: data.model,
          isGeneratingDocument: false
        };
      });
      syncRevisionFoundation({
        projects: completedRevisionState.projects,
        mainConversations: completedRevisionState.mainConversations,
        revisionMessages: completedRevisionState.revisionMessages,
        documentVersions: completedRevisionState.documentVersions,
        manualEditDrafts: completedRevisionState.manualEditDrafts,
        eventLogs: completedRevisionState.eventLogs,
        timelineNodes: completedRevisionState.timelineNodes,
        timelineEdges: completedRevisionState.timelineEdges,
        contextSnapshots: completedRevisionState.contextSnapshots,
        llmCallRecords: completedRevisionState.llmCallRecords
      });
      pendingMainFailure = null;
    } catch (error) {
      const failure = pendingMainFailure;

      if (!failure) {
        set({ isGeneratingDocument: false });
        get().refreshContextPreview();
        return;
      }

      const failedAt = new Date().toISOString();
      const userFacingMessage = llmErrorToUserMessage(error);
      const assistantConversationMessage: ConversationMessage = {
        id: `conv-assistant-failed-${failure.suffix}`,
        sessionId: failure.conversationId,
        role: "assistant",
        content: userFacingMessage,
        modelConfigId: failure.model,
        modelName: failure.model,
        contentState: "normal",
        includeInContext: false,
        createdAt: failedAt
      };
      const failedRevision = MainConversationRevisionService.failMainSend({
        state: failure.startedRevision.state,
        projectId: failure.projectId,
        conversationId: failure.conversationId,
        prompt,
        errorMessage: userFacingMessage,
        model: failure.model,
        llmCallId: failure.startedRevision.llmCallRecord.id,
        contextSnapshotId: failure.startedRevision.contextSnapshot.id,
        userTimelineNodeId: failure.startedRevision.timelineNodes[0].id,
        now: failedAt,
        suffix: failure.suffix
      });

      set((current) => ({
        ...current,
        conversationMessages: {
          ...current.conversationMessages,
          [failure.userConversationMessage.id]: failure.userConversationMessage,
          [assistantConversationMessage.id]: assistantConversationMessage
        },
        mainConversations: failedRevision.state.mainConversations,
        revisionMessages: failedRevision.state.revisionMessages,
        documentVersions: failedRevision.state.documentVersions,
        manualEditDrafts: failedRevision.state.manualEditDrafts,
        eventLogs: failedRevision.state.eventLogs,
        timelineNodes: failedRevision.state.timelineNodes,
        timelineEdges: failedRevision.state.timelineEdges,
        contextSnapshots: failedRevision.state.contextSnapshots,
        llmCallRecords: failedRevision.state.llmCallRecords,
        isGeneratingDocument: false
      }));
      syncRevisionFoundation({
        projects: failedRevision.state.projects,
        mainConversations: failedRevision.state.mainConversations,
        revisionMessages: failedRevision.state.revisionMessages,
        documentVersions: failedRevision.state.documentVersions,
        manualEditDrafts: failedRevision.state.manualEditDrafts,
        eventLogs: failedRevision.state.eventLogs,
        timelineNodes: failedRevision.state.timelineNodes,
        timelineEdges: failedRevision.state.timelineEdges,
        contextSnapshots: failedRevision.state.contextSnapshots,
        llmCallRecords: failedRevision.state.llmCallRecords
      });
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

  createManualEditDraft: () => {
    const state = get();
    const mainWindow = state.windows[state.mainWindowId];
    const mainSession = mainWindow
      ? state.sessions[mainWindow.conversationSessionId]
      : null;
    const activeVersion = activeDocumentVersionFromStore(
      state,
      mainSession?.id ?? DEFAULT_MAIN_SESSION_ID
    );

    if (!activeVersion) {
      return null;
    }

    const result = get().executeRevisionAction("document.edit", {
      target: {
        objectType: "document_version",
        objectId: activeVersion.id,
        projectId: state.currentProjectId,
        conversationId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
        status: activeVersion.status
      },
      projectId: state.currentProjectId,
      conversationId: mainSession?.id ?? DEFAULT_MAIN_SESSION_ID,
      content: activeVersion.content,
      suffix: makeIdSuffix()
    });

    return result.status === "success"
      ? (result.result as { draft?: ManualEditDraftModel }).draft?.id ?? null
      : null;
  },

  updateManualEditDraftContent: (draftId, content) => {
    const result = DocumentVersionService.updateManualEditDraft({
      state: revisionStateFromStore(get()),
      draftId,
      content,
      now: new Date().toISOString()
    });

    set((current) => ({
      ...current,
      manualEditDrafts: result.state.manualEditDrafts,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    }));
    void syncRevisionFoundation({
      manualEditDrafts: result.state.manualEditDrafts,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
  },

  previewManualEditDraftDiff: (draftId, content) => {
    let revisionState = revisionStateFromStore(get());

    if (content !== undefined) {
      const updated = DocumentVersionService.updateManualEditDraft({
        state: revisionState,
        draftId,
        content,
        now: new Date().toISOString()
      });
      revisionState = updated.state;
    }

    if (content !== undefined) {
      set((current) => ({
        ...current,
        ...revisionStorePatch(revisionState)
      }));
      void syncRevisionFoundation({
        manualEditDrafts: revisionState.manualEditDrafts,
        eventLogs: revisionState.eventLogs,
        timelineNodes: revisionState.timelineNodes,
        timelineEdges: revisionState.timelineEdges
      });
    }

    const actionResult = get().executeRevisionAction("document.preview_diff", {
      target: {
        objectType: "manual_edit_draft",
        objectId: draftId,
        projectId: get().currentProjectId,
        conversationId: get().manualEditDrafts[draftId]?.conversationId,
        status: get().manualEditDrafts[draftId]?.status ?? "draft"
      },
      suffix: makeIdSuffix()
    });

    return actionResult.status === "success"
      ? (actionResult.result as { diff?: TextDiff }).diff ?? null
      : null;
  },

  confirmManualEditDraft: (draftId, content) => {
    let revisionState = revisionStateFromStore(get());

    if (content !== undefined) {
      const updated = DocumentVersionService.updateManualEditDraft({
        state: revisionState,
        draftId,
        content,
        now: new Date().toISOString()
      });
      revisionState = updated.state;
    }

    if (content !== undefined) {
      set((current) => ({
        ...current,
        ...revisionStorePatch(revisionState)
      }));
      void syncRevisionFoundation({
        manualEditDrafts: revisionState.manualEditDrafts,
        eventLogs: revisionState.eventLogs,
        timelineNodes: revisionState.timelineNodes,
        timelineEdges: revisionState.timelineEdges
      });
    }

    const actionResult = get().executeRevisionAction("document.confirm_edit", {
      target: {
        objectType: "manual_edit_draft",
        objectId: draftId,
        projectId: get().currentProjectId,
        conversationId: get().manualEditDrafts[draftId]?.conversationId,
        status: get().manualEditDrafts[draftId]?.status ?? "ready_for_review"
      },
      confirmed: true,
      diffAccepted: true,
      suffix: makeIdSuffix()
    });
    const result = actionResult.status === "success"
      ? (actionResult.result as ReturnType<typeof DocumentVersionService.confirmManualEdit>)
      : null;

    if (!result || !result.ok) {
      return {
        ok: false,
        conflict: true,
        baseDocumentVersionId:
          result?.baseDocumentVersionId ??
          get().manualEditDrafts[draftId]?.baseDocumentVersionId ??
          draftId,
        activeDocumentVersionId: result?.activeDocumentVersionId,
        diffAgainstCurrent: result?.diffAgainstCurrent
      };
    }

    set((current) => {
      const documentId = result.documentVersion.documentId ?? current.currentDocumentId;
      const currentDocument = documentId ? current.documents[documentId] : undefined;
      const documentUpdatedState: AnswerAtlasState = {
        ...current,
        currentDocumentId: documentId ?? current.currentDocumentId,
        documents:
          documentId && currentDocument
            ? {
                ...current.documents,
                [documentId]: {
                  ...currentDocument,
                  rawText: result.documentVersion.content,
                  updatedAt: result.documentVersion.createdAt
                }
              }
            : current.documents
      };
      const versionNodeId =
        result.documentVersion.createdFromTimelineNodeId ??
        result.timelineNode?.id ??
        `version-node-${result.documentVersion.id}`;
      const parentVersionNodeId =
        documentId && current.documents[documentId]
          ? current.documents[documentId].activeVersionNodeId
          : current.activeVersionNodeId;
      const visibleTimelineState =
        documentId && documentUpdatedState.documents[documentId]
          ? appendVersionNodeAndCheckout(
              documentUpdatedState,
              {
                id: versionNodeId,
                documentId,
                parentId: parentVersionNodeId ?? null,
                childIds: [],
                nodeType: "document_revised",
                label: result.documentVersion.versionNumber
                  ? `Edited document v${result.documentVersion.versionNumber}`
                  : "Manual document edit",
                isActivePath: true,
                createdAt: result.documentVersion.createdAt
              }
            )
          : documentUpdatedState;

      return {
        ...visibleTimelineState,
        documentVersions: result.state.documentVersions,
        manualEditDrafts: result.state.manualEditDrafts,
        textSelections: result.state.textSelections,
        mainConversations: result.state.mainConversations,
        eventLogs: result.state.eventLogs,
        timelineNodes: result.state.timelineNodes,
        timelineEdges: result.state.timelineEdges
      };
    });
    void syncRevisionFoundation({
      projects: result.state.projects,
      mainConversations: result.state.mainConversations,
      documentVersions: result.state.documentVersions,
      manualEditDrafts: result.state.manualEditDrafts,
      textSelections: result.state.textSelections,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });

    return {
      ok: true,
      diff: result.diff,
      documentVersionId: result.documentVersion.id
    };
  },

  cancelManualEditDraft: (draftId) => {
    const draft = get().manualEditDrafts[draftId];

    if (!draft || draft.status === "confirmed") {
      return;
    }

    get().executeRevisionAction("document.cancel_edit", {
      target: {
        objectType: "manual_edit_draft",
        objectId: draftId,
        projectId: get().currentProjectId,
        conversationId: draft.conversationId,
        status: draft.status
      },
      suffix: makeIdSuffix()
    });
  },

  openSelectionBranch: (selection, mode) => {
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

    set((state) => {
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;
      const document = documentId ? state.documents[documentId] : null;

      if (!documentId || !activeVersionNodeId || !document || !selection.selectedText.trim()) {
        return state;
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const mainWindow = state.windows[state.mainWindowId];
      const mainSession = mainWindow
        ? state.sessions[mainWindow.conversationSessionId]
        : null;
      const sourceType = selection.sourceType ?? "document_version";
      const sourceDocumentVersionId =
        selection.sourceDocumentVersionId ??
        (sourceType === "document_version"
          ? `doc-version-${activeVersionNodeId}`
          : undefined);
      const sourceId = selection.sourceId ?? sourceDocumentVersionId;
      const isLocalAnswerSelection = Boolean(
        selection.sourceLocalThreadId && selection.sourceAnswerId
      );

      if (isLocalAnswerSelection) {
        const sourceLocalThreadId = selection.sourceLocalThreadId!;
        const sourceAnswerId = selection.sourceAnswerId!;
        const sourceLocalThread = state.localThreads[sourceLocalThreadId];
        const parentSelectionId =
          selection.parentSelectionId ?? sourceLocalThread?.sourceSelectionId;
        const parentLocalSelectionId =
          selection.parentLocalSelectionId ?? sourceLocalThread?.parentLocalSelectionId;
        const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
          state: revisionStateFromStore(state),
          projectId: state.currentProjectId,
          conversationId: selection.conversationId,
          sourceLocalThreadId,
          sourceMessageId: selection.sourceMessageId ?? sourceAnswerId,
          sourceAnswerId,
          parentSelectionId,
          parentLocalSelectionId,
          sourceDocumentVersionId,
          selectedText: selection.selectedText,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          beforeContext: selection.contextBefore,
          afterContext: selection.contextAfter,
          textHash: selection.textHash,
          sourceThreadType:
            selection.sourceThreadType ?? sourceLocalThread?.threadType ?? "local",
          now,
          suffix
        });

        if (mode === "branch") {
          const branchResult = RevisionBranchService.createBranchFromLocalSelection({
            state: localSelectionResult.state,
            projectId: state.currentProjectId,
            localSelectionId: localSelectionResult.localSelection.id,
            baseDocumentVersionId: sourceDocumentVersionId,
            now,
            suffix
          });

          revisionSync = {
            localSelections: branchResult.state.localSelections,
            revisionBranches: branchResult.state.revisionBranches,
            eventLogs: branchResult.state.eventLogs,
            timelineNodes: branchResult.state.timelineNodes,
            timelineEdges: branchResult.state.timelineEdges
          };

          return {
            ...state,
            activeRevisionBranchId: branchResult.branch.id,
            localSelections: branchResult.state.localSelections,
            revisionBranches: branchResult.state.revisionBranches,
            eventLogs: branchResult.state.eventLogs,
            timelineNodes: branchResult.state.timelineNodes,
            timelineEdges: branchResult.state.timelineEdges
          };
        }

        const nestedUiThreadId = `thread-${localSelectionResult.localSelection.id}`;
        const nestedThreadResult =
          LocalThreadService.getOrCreateNestedLocalThreadForLocalSelection({
            state: localSelectionResult.state,
            projectId: state.currentProjectId,
            localSelectionId: localSelectionResult.localSelection.id,
            conversationId: threadSessionId(nestedUiThreadId),
            now,
            suffix
          });
        const anchorId = localSelectionResult.localSelection.id;
        const nodeId = `v-local-selection-${suffix}`;
        const anchor: Anchor =
          state.anchors[anchorId] ?? {
            id: anchorId,
            documentId,
            selectedText: selection.selectedText,
            anchorType: "text_selection",
            startOffset: selection.startOffset,
            endOffset: selection.endOffset,
            contextBefore: selection.contextBefore,
            contextAfter: selection.contextAfter,
            createdFromWindowId: selection.createdFromWindowId,
            sourceThreadId: selection.sourceThreadId,
            sourceMessageId: sourceAnswerId,
            createdAt: now
          };
        const node: VersionNode = {
          id: nodeId,
          documentId,
          parentId: activeVersionNodeId,
          childIds: [],
          nodeType: "anchor_selected",
          label: "Selected local text",
          relatedAnchorId: anchorId,
          isActivePath: true,
          createdAt: now
        };
        let nextState = state.anchors[anchorId]
          ? state
          : appendVersionNodeAndCheckout(
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

        nextState = {
          ...nextState,
          activeRevisionBranchId: null,
          threads: {
            ...nextState.threads,
            [threadId]: {
              ...nextState.threads[threadId],
              parentThreadId: selection.sourceThreadId,
              sourceMessageId: sourceAnswerId,
              sourceSelectionId: parentSelectionId,
              sourceLocalSelectionId: localSelectionResult.localSelection.id,
              revisionLocalThreadId: nestedThreadResult.localThread.id,
              revisionThreadType: "nested_local",
              selectedText: selection.selectedText,
              updatedAt: now
            }
          },
          windows: {
            ...nextState.windows,
            [windowId]: {
              ...nextState.windows[windowId],
              title: "Nested Local Window",
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
          isSideThreadMinimized: false,
          localSelections: nestedThreadResult.state.localSelections,
          localThreads: nestedThreadResult.state.localThreads,
          eventLogs: nestedThreadResult.state.eventLogs,
          timelineNodes: nestedThreadResult.state.timelineNodes,
          timelineEdges: nestedThreadResult.state.timelineEdges
        };

        revisionSync = {
          localSelections: nestedThreadResult.state.localSelections,
          localThreads: nestedThreadResult.state.localThreads,
          eventLogs: nestedThreadResult.state.eventLogs,
          timelineNodes: nestedThreadResult.state.timelineNodes,
          timelineEdges: nestedThreadResult.state.timelineEdges
        };

        return nextState;
      }

      if (!sourceId) {
        return state;
      }

      const textSelectionResult = TextSelectionService.createOrGetSelection({
        state: revisionStateFromStore(state),
        projectId: state.currentProjectId,
        conversationId: selection.conversationId ?? mainSession?.id,
        sourceType,
        sourceId,
        sourceDocumentVersionId,
        sourceDocumentVersionNumber: selection.sourceDocumentVersionNumber,
        sourcePathStatus: selection.sourcePathStatus,
        sourceVersionNodeId: selection.sourceVersionNodeId,
        sourceMessageId: selection.sourceMessageId,
        selectedText: selection.selectedText,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        textHash: selection.textHash,
        beforeContext: selection.contextBefore,
        afterContext: selection.contextAfter,
        activeTimelineNodeId: state.mainConversations[mainSession?.id ?? DEFAULT_MAIN_SESSION_ID]
          ?.activeTimelineNodeId,
        now,
        suffix
      });
      const revisionLocalThreadId = `local-thread-${textSelectionResult.selection.id}`;
      const localThreadResult = LocalThreadService.getOrCreateLocalThreadForSelection({
        state: textSelectionResult.state,
        projectId: state.currentProjectId,
        selectionId: textSelectionResult.selection.id,
        conversationId: threadSessionId(`thread-${textSelectionResult.selection.id}`),
        now,
        suffix
      });
      const anchorId = textSelectionResult.selection.id;
      const nodeId = `v-selection-${suffix}`;
      const anchor: Anchor =
        state.anchors[anchorId] ?? {
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
      let nextState = state.anchors[anchorId]
        ? state
        : appendVersionNodeAndCheckout(
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
            sourceMessageId: selection.sourceMessageId,
            sourceSelectionId: textSelectionResult.selection.id,
            revisionLocalThreadId
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
        isSideThreadMinimized: false,
        textSelections: localThreadResult.state.textSelections,
        localThreads: localThreadResult.state.localThreads,
        eventLogs: localThreadResult.state.eventLogs,
        timelineNodes: localThreadResult.state.timelineNodes,
        timelineEdges: localThreadResult.state.timelineEdges
      };

      revisionSync = {
        textSelections: localThreadResult.state.textSelections,
        localThreads: localThreadResult.state.localThreads,
        eventLogs: localThreadResult.state.eventLogs,
        timelineNodes: localThreadResult.state.timelineNodes,
        timelineEdges: localThreadResult.state.timelineEdges
      };

      if (mode !== "branch") {
        return nextState;
      }

      // Full branch editing is intentionally deferred beyond Phase 2.
      if (mode === "branch") {
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

    if (revisionSync) {
      syncRevisionFoundation(revisionSync);
    }

    get().refreshContextPreview();
  },

  addNoteForSelection: (selection, content) => {
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

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
      let revisionState = revisionStateFromStore(state);
      let revisionAnnotationResult: ReturnType<
        typeof AnnotationService.createAnnotationFromManualNote
      > | null = null;

      if (selection.sourceLocalThreadId && selection.sourceAnswerId) {
        const sourceLocalThread =
          state.localThreads[selection.sourceLocalThreadId];
        const localSelectionResult =
          LocalSelectionService.createOrGetLocalSelection({
            state: revisionState,
            projectId: state.currentProjectId,
            conversationId: selection.conversationId,
            sourceLocalThreadId: selection.sourceLocalThreadId,
            sourceMessageId: selection.sourceMessageId ?? selection.sourceAnswerId,
            sourceAnswerId: selection.sourceAnswerId,
            parentSelectionId:
              selection.parentSelectionId ?? sourceLocalThread?.sourceSelectionId,
            parentLocalSelectionId:
              selection.parentLocalSelectionId ??
              sourceLocalThread?.parentLocalSelectionId,
            sourceDocumentVersionId: selection.sourceDocumentVersionId,
            selectedText: selection.selectedText,
            startOffset: selection.startOffset,
            endOffset: selection.endOffset,
            beforeContext: selection.contextBefore,
            afterContext: selection.contextAfter,
            textHash: selection.textHash,
            sourceThreadType:
              selection.sourceThreadType ??
              sourceLocalThread?.threadType ??
              "local",
            now,
            suffix
          });
        const localSelection = localSelectionResult.localSelection;
        const scopeType =
          localSelection.sourceThreadType === "nested_local"
            ? ("local_thread" as const)
            : ("selected_text" as const);
        const scopeId =
          localSelection.sourceThreadType === "nested_local"
            ? localSelection.sourceLocalThreadId
            : localSelection.parentSelectionId ?? localSelection.id;
        const sourceNode = latestRevisionTimelineNode(
          {
            ...state,
            localSelections: localSelectionResult.state.localSelections,
            eventLogs: localSelectionResult.state.eventLogs,
            timelineNodes: localSelectionResult.state.timelineNodes,
            timelineEdges: localSelectionResult.state.timelineEdges
          },
          "local_selection",
          localSelection.id
        );

        revisionAnnotationResult =
          AnnotationService.createAnnotationFromLocalSelection({
            state: localSelectionResult.state,
            projectId: state.currentProjectId,
            conversationId: selection.conversationId,
            content,
            title: "Kept selected fragment",
            scopeType,
            scopeId,
            sourceId: localSelection.id,
            sourceText: localSelection.selectedText,
            sourceMessageId: localSelection.sourceMessageId,
            sourceSelectionId: localSelection.parentSelectionId,
            sourceLocalSelectionId: localSelection.id,
            sourceLocalThreadId: localSelection.sourceLocalThreadId,
            sourceDocumentVersionId: localSelection.sourceDocumentVersionId,
            sourceTimelineNodeId: sourceNode?.id,
            now,
            suffix: `${suffix}-note`
          });
        revisionState = revisionAnnotationResult.state;
      } else {
        const scopeType = "selected_text" as const;
        const scopeId = selection.sourceId ?? anchorId;

        revisionAnnotationResult =
          AnnotationService.createAnnotationFromManualNote({
            state: revisionState,
            projectId: state.currentProjectId,
            conversationId: selection.conversationId,
            content,
            title: "Selection context note",
            scopeType,
            scopeId,
            sourceId: selection.sourceId,
            sourceText: selection.selectedText,
            sourceMessageId: selection.sourceMessageId,
            sourceSelectionId: scopeId,
            sourceDocumentVersionId: selection.sourceDocumentVersionId,
            now,
            suffix: `${suffix}-note`
          });
        revisionState = revisionAnnotationResult.state;
      }
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

      revisionSync = {
        localSelections: revisionState.localSelections,
        annotations: revisionState.annotations,
        eventLogs: revisionState.eventLogs,
        timelineNodes: revisionState.timelineNodes,
        timelineEdges: revisionState.timelineEdges
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
          },
          localSelections: revisionState.localSelections,
          revisionAnnotations: revisionState.annotations,
          eventLogs: revisionState.eventLogs,
          timelineNodes: revisionState.timelineNodes,
          timelineEdges: revisionState.timelineEdges
        },
        node
      );
    });

    if (revisionSync) {
      void syncRevisionFoundation(revisionSync);
    }

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
    const revisionLocalThreadId =
      thread?.revisionLocalThreadId ?? (anchor ? `local-thread-${anchor.id}` : null);

    if (!thread || !anchor || !selectedText || !revisionLocalThreadId) {
      return;
    }

    const activeDocumentVersion = activeDocumentVersionFromStore(
      state,
      session?.id ?? DEFAULT_MAIN_SESSION_ID
    );

    set({ isAskingLocalQuestion: true });

    try {
      await syncRevisionFoundation({
        textSelections: state.textSelections,
        localThreads: state.localThreads,
        localSelections: state.localSelections,
        revisionBranches: state.revisionBranches,
        annotations: state.revisionAnnotations,
        revisionMessages: state.revisionMessages,
        documentVersions: state.documentVersions,
        manualEditDrafts: state.manualEditDrafts,
        eventLogs: state.eventLogs,
        timelineNodes: state.timelineNodes,
        timelineEdges: state.timelineEdges,
        contextSnapshots: state.contextSnapshots,
        llmCallRecords: state.llmCallRecords
      });

      const response = await fetch(
        `/api/local-threads/${revisionLocalThreadId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question,
            model,
            windowId: window?.id,
            documentId,
            activeVersionNodeId,
            activeDocumentVersion
          })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send local message");
      }

      const data = (await response.json()) as {
        provider: "openai" | "mock";
        model: string;
        output: {
          answer: string;
          revisedText?: string;
        };
        records: {
          userMessage: MessageModel;
          assistantMessage: MessageModel;
          localThread: LocalThreadModel;
          selection: TextSelectionModel;
          localSelection?: LocalSelectionModel;
          contextSnapshot: ContextSnapshot;
          llmCallRecord: LLMCallRecord;
          events: EventLogRecord[];
          timelineNodes: RevisionTimelineNode[];
          timelineEdges: RevisionTimelineEdge[];
        };
      };
      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const userMessage: ThreadMessage = {
        id: `msg-user-${suffix}`,
        threadId,
        sessionId: session?.id,
        role: "user",
        content: question,
        contentState: "normal",
        includeInContext: true,
        revisionMessageId: data.records.userMessage.id,
        createdAt: data.records.userMessage.createdAt
      };
      const assistantMessage: ThreadMessage = {
        id: `msg-assistant-${suffix}`,
        threadId,
        sessionId: session?.id,
        role: "assistant",
        content: data.output.answer,
        modelConfigId: data.model,
        modelName: data.model,
        llmCallId: data.records.llmCallRecord.id,
        contextSnapshotId: data.records.contextSnapshot.id,
        revisionMessageId: data.records.assistantMessage.id,
        contentState: "normal",
        includeInContext: true,
        createdAt: data.records.assistantMessage.createdAt
      };
      const userConversationMessage: ConversationMessage = {
        id: `conv-user-${suffix}`,
        sessionId: session?.id ?? threadSessionId(threadId),
        role: "user",
        content: question,
        contentState: "normal",
        includeInContext: true,
        createdAt: data.records.userMessage.createdAt
      };
      const assistantConversationMessage: ConversationMessage = {
        id: `conv-assistant-${suffix}`,
        sessionId: session?.id ?? threadSessionId(threadId),
        role: "assistant",
        content: data.output.answer,
        modelConfigId: data.model,
        modelName: data.model,
        contentState: "normal",
        includeInContext: true,
        createdAt: data.records.assistantMessage.createdAt
      };
      const node: VersionNode = {
        id: `v-local-answer-${suffix}`,
        documentId,
        parentId: activeVersionNodeId,
        childIds: [],
        nodeType: "local_answer_generated",
        label: "Local answer generated",
        relatedAnchorId: anchor.id,
        relatedThreadId: threadId,
        isActivePath: true,
        createdAt: now
      };
      let generatedComparison: ArgumentComparison | null = null;
      const revisedTextForComparison =
        data.output.revisedText?.trim() || data.output.answer.trim();
      const comparisonContextItems = data.records.contextSnapshot.includedItems.map(
        (item) => ({
          type: item.type,
          text: item.text,
          reason: item.reason
        })
      );

      if (revisedTextForComparison) {
        set({ isGeneratingComparison: true });

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
              revisedText: revisedTextForComparison,
              localQuestion: question,
              localAnswer: data.output.answer,
              model: data.model,
              contextItems: comparisonContextItems
            })
          });

          if (!comparisonResponse.ok) {
            throw new Error("Failed to generate semantic comparison");
          }

          const comparisonData = (await comparisonResponse.json()) as {
            provider: "openai" | "mock";
            model: string;
            output: {
              comparison: ArgumentComparison;
            };
          };
          generatedComparison = comparisonData.output.comparison;
        } catch {
          generatedComparison = createArgumentComparisonFromTexts({
            idSuffix: `fallback-${suffix}`,
            documentId,
            anchorId: anchor.id,
            originalText: selectedText,
            revisedText: revisedTextForComparison,
            createdInVersionNodeId: node.id,
            now
          });
        }
      }

      let comparisonRevisionSync: Partial<RevisionRepositoryState> | null = null;

      set((current) => {
        const nextWithMessages = appendConversationMessages({
          state: {
            ...current,
            isAskingLocalQuestion: false,
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
                sourceSelectionId: data.records.selection.id,
                sourceLocalSelectionId:
                  data.records.localThread.parentLocalSelectionId ??
                  current.threads[threadId].sourceLocalSelectionId,
                revisionLocalThreadId: data.records.localThread.id,
                revisionThreadType: data.records.localThread.threadType,
                updatedAt: now
              }
            },
            textSelections: {
              ...current.textSelections,
              [data.records.selection.id]: data.records.selection
            },
            localThreads: {
              ...current.localThreads,
              [data.records.localThread.id]: data.records.localThread
            },
            localSelections: data.records.localSelection
              ? {
                  ...current.localSelections,
                  [data.records.localSelection.id]: data.records.localSelection
                }
              : current.localSelections,
            revisionMessages: {
              ...current.revisionMessages,
              [data.records.userMessage.id]: data.records.userMessage,
              [data.records.assistantMessage.id]: data.records.assistantMessage
            },
            documentVersions: current.documentVersions,
            manualEditDrafts: current.manualEditDrafts,
            contextSnapshots: {
              ...current.contextSnapshots,
              [data.records.contextSnapshot.id]: data.records.contextSnapshot
            },
            llmCallRecords: {
              ...current.llmCallRecords,
              [data.records.llmCallRecord.id]: data.records.llmCallRecord
            },
            eventLogs: {
              ...current.eventLogs,
              ...Object.fromEntries(
                data.records.events.map((event) => [event.id, event])
              )
            },
            timelineNodes: {
              ...current.timelineNodes,
              ...Object.fromEntries(
                data.records.timelineNodes.map((timelineNode) => [
                  timelineNode.id,
                  timelineNode
                ])
              )
            },
            timelineEdges: {
              ...current.timelineEdges,
              ...Object.fromEntries(
                data.records.timelineEdges.map((timelineEdge) => [
                  timelineEdge.id,
                  timelineEdge
                ])
              )
            },
            revisionSuggestions: data.output.revisedText
              ? {
                  ...current.revisionSuggestions,
                  [threadId]: data.output.revisedText
                }
              : current.revisionSuggestions,
            selectedModel: data.model,
            llmProvider: data.provider
          },
          sessionId: session?.id ?? threadSessionId(threadId),
          userMessage: userConversationMessage,
          assistantMessage: assistantConversationMessage,
          model: data.model
        });
        let nextState = appendVersionNodeAndCheckout(nextWithMessages, node);

        if (generatedComparison) {
          const comparisonWindowId = treeWindowId(generatedComparison.id);
          const comparisonSessionId = treeSessionId(generatedComparison.id);
          const comparisonScope = treeContextScope({
            currentDocumentId: documentId,
            comparisonId: generatedComparison.id
          });
          const comparisonWindow: WindowInstance = nextState.windows[comparisonWindowId] ?? {
            id: comparisonWindowId,
            workspaceId: "default",
            windowType: "tree_compare",
            title: "Semantic Difference Map",
            conversationSessionId: comparisonSessionId,
            modelConfigId: data.model,
            contextScope: comparisonScope,
            layout: {
              isMinimized: false
            },
            createdAt: now,
            updatedAt: now
          };
          const comparisonSession: ConversationSession =
            nextState.sessions[comparisonSessionId] ?? {
              id: comparisonSessionId,
              workspaceId: "default",
              windowId: comparisonWindowId,
              sessionType: "tree_chat",
              modelConfigId: data.model,
              contextScope: comparisonScope,
              createdAt: now,
              updatedAt: now
            };

          nextState = {
            ...nextState,
            comparisons: {
              ...nextState.comparisons,
              [generatedComparison.id]: generatedComparison
            },
            windows: {
              ...nextState.windows,
              [comparisonWindow.id]: {
                ...comparisonWindow,
                modelConfigId: data.model,
                updatedAt: now
              }
            },
            sessions: {
              ...nextState.sessions,
              [comparisonSession.id]: {
                ...comparisonSession,
                modelConfigId: data.model,
                updatedAt: now
              }
            },
            activeTreeWindowId: comparisonWindow.id,
            selectedAnchorId: anchor.id
          };

          try {
            const persistentComparison = ComparisonService.createComparison({
              state: revisionStateFromStore(nextState),
              projectId: nextState.currentProjectId,
              conversationId: data.records.localThread.conversationId,
              title: "Semantic Difference Map",
              description: "Persistent graph paired with the visible semantic difference map.",
              scopeType: "comparison",
              scopeId: generatedComparison.id,
              sources: [
                {
                  objectType: "text_selection",
                  objectId: data.records.selection.id
                },
                {
                  objectType: "message",
                  objectId: data.records.assistantMessage.id
                }
              ],
              model: data.model,
              modelProvider: data.provider,
              createdBy: "assistant",
              now,
              suffix: `semantic-map-${suffix}`
            });
            const graph = persistentComparison.comparison;
            const patchedRevisionState: RevisionRepositoryState = {
              ...persistentComparison.state,
              comparisonGraphs: {
                ...persistentComparison.state.comparisonGraphs,
                [graph.id]: {
                  ...graph,
                  payload: {
                    ...(graph.payload ?? {}),
                    legacy_comparison_id: generatedComparison.id,
                    legacyComparisonId: generatedComparison.id
                  }
                }
              }
            };

            comparisonRevisionSync = {
              comparisonGraphs: patchedRevisionState.comparisonGraphs,
              comparisonRuns: patchedRevisionState.comparisonRuns,
              contextSnapshots: patchedRevisionState.contextSnapshots,
              llmCallRecords: patchedRevisionState.llmCallRecords,
              eventLogs: patchedRevisionState.eventLogs,
              timelineNodes: patchedRevisionState.timelineNodes,
              timelineEdges: patchedRevisionState.timelineEdges
            };
            nextState = {
              ...nextState,
              ...revisionStorePatch(patchedRevisionState)
            };
          } catch {
            comparisonRevisionSync = null;
          }
        }

        return nextState;
      });

      if (comparisonRevisionSync) {
        void syncRevisionFoundation(comparisonRevisionSync);
      }
    } catch {
      set({ isAskingLocalQuestion: false });
    }

    set({ isGeneratingComparison: false });
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
    const boardContextItems = [
      {
        type: "comparison_board",
        text: JSON.stringify(comparison.board),
        reason:
          "Semantic Difference Map context: compact semantic alignment rows, differences, risk, and selected revision evidence."
      }
    ];
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
          contextItems: boardContextItems
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
      const trace = createLLMTrace({
        suffix: `tree-${suffix}`,
        projectId: state.currentProjectId,
        callType: "comparison_chat",
        purpose: "comparison_chat",
        model: data.model,
        provider: data.provider,
        status: "completed",
        prompt: question,
        preview: customContextItemsToPreview(boardContextItems),
        windowId: window.id,
        sessionId: session.id,
        documentId: comparison.documentId,
        threadId: undefined,
        comparisonId: comparison.id,
        outputMessageId: assistantConversationMessage.id,
        createdAt: now,
        completedAt: assistantConversationMessage.createdAt
      });

      set((current) => ({
        ...appendConversationMessages({
          state: current,
          sessionId: session.id,
          userMessage: userConversationMessage,
          assistantMessage: assistantConversationMessage,
          model: data.model
        }),
        llmProvider: data.provider,
        contextSnapshots: {
          ...current.contextSnapshots,
          [trace.contextSnapshot.id]: trace.contextSnapshot
        },
        llmCallRecords: {
          ...current.llmCallRecords,
          [trace.llmCallRecord.id]: trace.llmCallRecord
        },
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

  regenerateComparisonGraph: (comparisonId) => {
    const state = get();
    const comparison = state.comparisonGraphs[comparisonId];

    if (!comparison || comparison.status === "deleted") {
      return;
    }

    const result = ComparisonService.regenerateComparison({
      state: revisionStateFromStore(state),
      comparisonId,
      model: state.selectedModel,
      modelProvider: state.llmProvider,
      now: new Date().toISOString(),
      suffix: makeIdSuffix()
    });

    set((current) => ({
      ...current,
      comparisonGraphs: result.state.comparisonGraphs,
      comparisonRuns: result.state.comparisonRuns,
      contextSnapshots: result.state.contextSnapshots,
      llmCallRecords: result.state.llmCallRecords,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    }));
    void syncRevisionFoundation({
      comparisonGraphs: result.state.comparisonGraphs,
      comparisonRuns: result.state.comparisonRuns,
      contextSnapshots: result.state.contextSnapshots,
      llmCallRecords: result.state.llmCallRecords,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
  },

  clearComparisonGraph: (comparisonId, legacyComparisonId) => {
    const state = get();
    const comparison = state.comparisonGraphs[comparisonId];

    if (!comparison || comparison.status === "deleted") {
      return;
    }

    const result = ComparisonService.clearComparison({
      state: revisionStateFromStore(state),
      comparisonId,
      now: new Date().toISOString(),
      suffix: makeIdSuffix()
    });

    set((current) => ({
      ...current,
      comparisons:
        legacyComparisonId && current.comparisons[legacyComparisonId]
          ? {
              ...current.comparisons,
              [legacyComparisonId]: {
                ...current.comparisons[legacyComparisonId],
                status: "discarded",
                updatedAt: new Date().toISOString()
              }
            }
          : current.comparisons,
      comparisonGraphs: result.state.comparisonGraphs,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    }));
    void syncRevisionFoundation({
      comparisonGraphs: result.state.comparisonGraphs,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
  },

  deleteComparisonGraph: (comparisonId, legacyComparisonId) => {
    const state = get();
    const comparison = state.comparisonGraphs[comparisonId];

    if (!comparison || comparison.status === "deleted") {
      return;
    }

    const result = ComparisonService.deleteComparison({
      state: revisionStateFromStore(state),
      comparisonId,
      confirmed: true,
      now: new Date().toISOString(),
      suffix: makeIdSuffix()
    });

    set((current) => ({
      ...current,
      comparisons:
        legacyComparisonId && current.comparisons[legacyComparisonId]
          ? {
              ...current.comparisons,
              [legacyComparisonId]: {
                ...current.comparisons[legacyComparisonId],
                status: "deleted",
                updatedAt: new Date().toISOString()
              }
            }
          : current.comparisons,
      comparisonGraphs: result.state.comparisonGraphs,
      objectStateTransitions: result.state.objectStateTransitions,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    }));
    void syncRevisionFoundation({
      comparisonGraphs: result.state.comparisonGraphs,
      objectStateTransitions: result.state.objectStateTransitions,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
  },

  exportComparisonGraph: (comparisonId) => {
    const state = get();
    const comparison = state.comparisonGraphs[comparisonId];

    if (!comparison || comparison.status === "deleted") {
      return;
    }

    const result = ComparisonService.exportComparison({
      state: revisionStateFromStore(state),
      comparisonId,
      exportType: "markdown",
      now: new Date().toISOString(),
      suffix: makeIdSuffix()
    });

    set((current) => ({
      ...current,
      comparisonExports: result.state.comparisonExports,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    }));
    void syncRevisionFoundation({
      comparisonExports: result.state.comparisonExports,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
  },

  executeRevisionAction: (actionId, payload) => {
    const result = executeWorkspaceAction(
      revisionStateFromStore(get()),
      actionId,
      payload,
      {
        id: "local-user",
        role: "owner",
        permissions: "*"
      }
    );
    const nextState = "state" in result
      ? (result.state as RevisionRepositoryState | undefined)
      : undefined;

    if (nextState) {
      set((current) => ({
        ...current,
        ...revisionStorePatch(nextState),
        comparisons:
          typeof payload.legacyComparisonId === "string" &&
          current.comparisons[payload.legacyComparisonId]
            ? {
                ...current.comparisons,
                [payload.legacyComparisonId]: {
                  ...current.comparisons[payload.legacyComparisonId],
                  status:
                    actionId === "object.delete"
                      ? "deleted"
                      : actionId === "comparison.clear"
                        ? "discarded"
                        : current.comparisons[payload.legacyComparisonId].status,
                  updatedAt: new Date().toISOString()
                }
              }
            : current.comparisons
      }));
      void syncRevisionFoundation({
        mainConversations: nextState.mainConversations,
        revisionMessages: nextState.revisionMessages,
        documentVersions: nextState.documentVersions,
        manualEditDrafts: nextState.manualEditDrafts,
        textSelections: nextState.textSelections,
        localThreads: nextState.localThreads,
        localSelections: nextState.localSelections,
        annotations: nextState.annotations,
        revisionBranches: nextState.revisionBranches,
        mergeRecords: nextState.mergeRecords,
        comparisonGraphs: nextState.comparisonGraphs,
        comparisonRuns: nextState.comparisonRuns,
        comparisonExports: nextState.comparisonExports,
        objectStateTransitions: nextState.objectStateTransitions,
        timelinePaths: nextState.timelinePaths,
        revertRecords: nextState.revertRecords,
        eventLogs: nextState.eventLogs,
        timelineNodes: nextState.timelineNodes,
        timelineEdges: nextState.timelineEdges,
        llmCallRecords: nextState.llmCallRecords,
        contextSnapshots: nextState.contextSnapshots,
        actionIdempotencyRecords: nextState.actionIdempotencyRecords,
        migrationJobs: nextState.migrationJobs,
        migrationBatches: nextState.migrationBatches,
        migrationIssues: nextState.migrationIssues,
        backfillRecords: nextState.backfillRecords,
        featureFlags: nextState.featureFlags,
        workspaceIndexes: nextState.workspaceIndexes,
        workspaceMetrics: nextState.workspaceMetrics
      });
    }

    return result;
  },

  deleteThreadMessage: (messageId) => {
    const stateBeforeDelete = get();
    const messageBeforeDelete = stateBeforeDelete.messages[messageId];
    const revisionMessageId =
      messageBeforeDelete?.revisionMessageId ?? messageBeforeDelete?.id;

    if (
      revisionMessageId &&
      stateBeforeDelete.revisionMessages[revisionMessageId]
    ) {
      get().executeRevisionAction("object.delete", {
        target: {
          objectType: "message",
          objectId: revisionMessageId,
          projectId: stateBeforeDelete.currentProjectId,
          conversationId: messageBeforeDelete?.sessionId,
          status: stateBeforeDelete.revisionMessages[revisionMessageId].status
        },
        confirmed: true,
        reason: "message_deleted_from_thread_card",
        suffix: makeIdSuffix()
      });
    }

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
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

    set((state) => {
      const selectedAnchorId = state.selectedAnchorId;
      const documentId = state.currentDocumentId;
      const activeVersionNodeId = state.activeVersionNodeId;
      const anchor = selectedAnchorId ? state.anchors[selectedAnchorId] : null;
      const thread = state.selectedThreadId
        ? state.threads[state.selectedThreadId]
        : undefined;

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
      const scope = defaultNoteScopeForThread(state, thread);
      const revisionActionTarget =
        thread?.revisionLocalThreadId &&
        state.localThreads[thread.revisionLocalThreadId]
          ? {
              objectType: "local_thread" as const,
              objectId: thread.revisionLocalThreadId,
              projectId: state.currentProjectId,
              conversationId: thread.conversationSessionId,
              status: state.localThreads[thread.revisionLocalThreadId].status
            }
          : state.textSelections[scope.scopeId]
            ? {
                objectType: "text_selection" as const,
                objectId: scope.scopeId,
                projectId: state.currentProjectId,
                conversationId: thread?.conversationSessionId,
                status: state.textSelections[scope.scopeId].status
              }
            : {
                objectType: "project" as const,
                objectId: state.currentProjectId,
                projectId: state.currentProjectId,
                conversationId: thread?.conversationSessionId,
                status: "active"
              };
      const revisionAction = executeWorkspaceAction(
        revisionStateFromStore(state),
        "annotation.add_context_note",
        {
          target: revisionActionTarget,
          projectId: state.currentProjectId,
          conversationId: thread?.conversationSessionId,
          content,
          title: "Context note",
          now: annotation.createdAt,
          suffix
        },
        {
          id: "local-user",
          role: "owner",
          permissions: "*"
        }
      );
      const revisionState =
        revisionAction.status === "success"
          ? (revisionAction.state as RevisionRepositoryState)
          : revisionStateFromStore(state);
      const latestRevisionAnnotation = Object.values(
        revisionState.annotations
      ).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      if (latestRevisionAnnotation) {
        revisionState.annotations[latestRevisionAnnotation.id] = {
          ...latestRevisionAnnotation,
          scopeType: latestRevisionAnnotation.scopeType ?? scope.scopeType,
          scopeId: latestRevisionAnnotation.scopeId ?? scope.scopeId,
          sourceText: latestRevisionAnnotation.sourceText ?? anchor.selectedText,
          sourceSelectionId:
            latestRevisionAnnotation.sourceSelectionId ??
            thread?.sourceSelectionId ??
            anchor.id,
          sourceLocalSelectionId:
            latestRevisionAnnotation.sourceLocalSelectionId ??
            thread?.sourceLocalSelectionId,
          sourceLocalThreadId:
            latestRevisionAnnotation.sourceLocalThreadId ??
            thread?.revisionLocalThreadId,
          sourceDocumentVersionId:
            latestRevisionAnnotation.sourceDocumentVersionId ??
            `doc-version-${activeVersionNodeId}`
        };
      }

      revisionSync = {
        annotations: revisionState.annotations,
        eventLogs: revisionState.eventLogs,
        timelineNodes: revisionState.timelineNodes,
        timelineEdges: revisionState.timelineEdges
      };

      return appendVersionNodeAndCheckout(
        {
          ...state,
          annotations: {
            ...state.annotations,
            [annotation.id]: annotation
          },
          revisionAnnotations: revisionState.annotations,
          eventLogs: revisionState.eventLogs,
          timelineNodes: revisionState.timelineNodes,
          timelineEdges: revisionState.timelineEdges
        },
        node
      );
    });

    if (revisionSync) {
      void syncRevisionFoundation(revisionSync);
    }

    get().refreshContextPreview();
  },

  deleteAnnotation: (annotationId) => {
    const stateBeforeDelete = get();
    const revisionAnnotation = stateBeforeDelete.revisionAnnotations[annotationId];

    if (revisionAnnotation) {
      get().executeRevisionAction("object.delete", {
        target: {
          objectType: "annotation",
          objectId: revisionAnnotation.id,
          projectId: revisionAnnotation.projectId,
          conversationId: revisionAnnotation.conversationId,
          status: revisionAnnotation.status
        },
        confirmed: true,
        reason: "annotation_deleted_from_context_notes",
        suffix: makeIdSuffix()
      });
    }

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
    let revisionSync: Partial<RevisionRepositoryState> | null = null;

    set((state) => {
      const thread = state.threads[threadId];

      if (!thread) {
        return state;
      }

      const now = new Date().toISOString();
      const suffix = makeIdSuffix();
      const lastAssistantMessage = Object.values(state.messages)
        .filter(
          (message) =>
            message.threadId === threadId &&
            message.role === "assistant" &&
            message.contentState !== "deleted"
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
      let revisionState = revisionStateFromStore(state);

      if (lastAssistantMessage?.content.trim()) {
        const scope = defaultNoteScopeForThread(state, thread);
        const sourceRevisionMessageId =
          lastAssistantMessage.revisionMessageId ?? lastAssistantMessage.id;
        const sourceNode = latestRevisionTimelineNode(
          state,
          "message",
          sourceRevisionMessageId
        );
        const revisionAction = executeWorkspaceAction(
          revisionState,
          "annotation.keep_as_note",
          {
            target: {
              objectType: "message",
              objectId: sourceRevisionMessageId,
              projectId: state.currentProjectId,
              conversationId: thread.conversationSessionId,
              status:
                revisionState.revisionMessages[sourceRevisionMessageId]?.status ??
                "active"
            },
            projectId: state.currentProjectId,
            conversationId: thread.conversationSessionId,
            title: "Kept answer",
            scopeType: scope.scopeType,
            scopeId: scope.scopeId,
            sourceType:
              thread.revisionThreadType === "nested_local"
                ? "nested_local_answer"
                : "local_answer",
            sourceText: lastAssistantMessage.content,
            sourceSelectionId: thread.sourceSelectionId,
            sourceLocalSelectionId: thread.sourceLocalSelectionId,
            sourceLocalThreadId: thread.revisionLocalThreadId,
            sourceTimelineNodeId: sourceNode?.id,
            now,
            suffix
          },
          {
            id: "local-user",
            role: "owner",
            permissions: "*"
          }
        );

        if (revisionAction.status === "success") {
          revisionState = revisionAction.state as RevisionRepositoryState;
        }
        revisionSync = {
          annotations: revisionState.annotations,
          eventLogs: revisionState.eventLogs,
          timelineNodes: revisionState.timelineNodes,
          timelineEdges: revisionState.timelineEdges
        };
      }

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
        },
        revisionAnnotations: revisionState.annotations,
        eventLogs: revisionState.eventLogs,
        timelineNodes: revisionState.timelineNodes,
        timelineEdges: revisionState.timelineEdges
      };
    });

    if (revisionSync) {
      void syncRevisionFoundation(revisionSync);
    }

    get().refreshContextPreview();
  },

  createBranch: (threadId) => {
    const stateBeforeBranch = get();
    const threadBeforeBranch = stateBeforeBranch.threads[threadId];

    if (
      threadBeforeBranch?.sourceLocalSelectionId &&
      stateBeforeBranch.localSelections[threadBeforeBranch.sourceLocalSelectionId]
    ) {
      get().executeRevisionAction("branch.create", {
        target: {
          objectType: "local_selection",
          objectId: threadBeforeBranch.sourceLocalSelectionId,
          projectId: stateBeforeBranch.currentProjectId,
          conversationId: threadBeforeBranch.conversationSessionId,
          status:
            stateBeforeBranch.localSelections[threadBeforeBranch.sourceLocalSelectionId]
              .status
        },
        suffix: makeIdSuffix()
      });
    }

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

  openMergeModalForSource: (sourceType, sourceId, mergeMode = "replace_selection") => {
    const state = get();
    const now = new Date().toISOString();
    const targetObjectType =
      sourceType === "revision_branch"
        ? "revision_branch"
        : sourceType === "local_selection" ||
            sourceType === "nested_local_selection"
          ? "local_selection"
          : "message";
    const targetStatus =
      targetObjectType === "revision_branch"
        ? state.revisionBranches[sourceId]?.status
        : targetObjectType === "local_selection"
          ? state.localSelections[sourceId]?.status
          : state.revisionMessages[sourceId]?.status;
    const actionResult = get().executeRevisionAction("merge.into_document", {
      target: {
        objectType: targetObjectType,
        objectId: sourceId,
        projectId: state.currentProjectId,
        conversationId: DEFAULT_MAIN_SESSION_ID,
        status: targetStatus ?? "active"
      },
      projectId: state.currentProjectId,
      conversationId: DEFAULT_MAIN_SESSION_ID,
      sourceType,
      mergeMode,
      now,
      suffix: makeIdSuffix()
    });
    const resultState = "state" in actionResult && actionResult.state
      ? (actionResult.state as RevisionRepositoryState)
      : revisionStateFromStore(get());
    const mergeRecord =
      (actionResult as { result?: { mergeRecord?: MergeRecordModel } }).result
        ?.mergeRecord ??
      Object.values(resultState.mergeRecords)
        .filter((merge) => merge.sourceId === sourceId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

    set((current) => ({
      ...current,
      activeMergeRecordId: mergeRecord?.id ?? null,
      pendingMergeDiff:
        ((mergeRecord?.diff ?? mergeRecord?.diffSummary ?? null) as TextDiff | null),
      mergeConflictMessage:
        mergeRecord?.conflictReason ??
        (actionResult.status === "blocked" ? actionResult.reason : null),
      mergeRecords: resultState.mergeRecords,
      eventLogs: resultState.eventLogs,
      timelineNodes: resultState.timelineNodes,
      timelineEdges: resultState.timelineEdges
    }));
  },

  setMergeMode: (mergeMode) => {
    const state = get();
    const activeMerge = state.activeMergeRecordId
      ? state.mergeRecords[state.activeMergeRecordId]
      : null;

    if (!activeMerge?.sourceType || !activeMerge.sourceId) {
      return;
    }

    get().openMergeModalForSource(
      activeMerge.sourceType,
      activeMerge.sourceId,
      mergeMode
    );
  },

  setManualMergeTarget: (start, end) => {
    const state = get();
    const activeMerge = state.activeMergeRecordId
      ? state.mergeRecords[state.activeMergeRecordId]
      : null;

    if (!activeMerge?.sourceType || !activeMerge.sourceId) {
      return;
    }

    const targetObjectType =
      activeMerge.sourceType === "revision_branch"
        ? "revision_branch"
        : activeMerge.sourceType === "local_selection" ||
            activeMerge.sourceType === "nested_local_selection"
          ? "local_selection"
          : "message";
    const targetStatus =
      targetObjectType === "revision_branch"
        ? state.revisionBranches[activeMerge.sourceId]?.status
        : targetObjectType === "local_selection"
          ? state.localSelections[activeMerge.sourceId]?.status
          : state.revisionMessages[activeMerge.sourceId]?.status;
    const actionResult = get().executeRevisionAction("merge.into_document", {
      target: {
        objectType: targetObjectType,
        objectId: activeMerge.sourceId,
        projectId: state.currentProjectId,
        conversationId: activeMerge.conversationId ?? DEFAULT_MAIN_SESSION_ID,
        status: targetStatus ?? "active"
      },
      projectId: state.currentProjectId,
      conversationId: activeMerge.conversationId ?? DEFAULT_MAIN_SESSION_ID,
      sourceType: activeMerge.sourceType,
      mergeMode: activeMerge.mergeMode,
      manualTargetRange: {
        start,
        end,
        selectionId: activeMerge.targetSelectionId
      },
      suffix: makeIdSuffix()
    });
    const resultState =
      "state" in actionResult && actionResult.state
        ? (actionResult.state as RevisionRepositoryState)
        : revisionStateFromStore(get());
    const mergeRecord =
      (actionResult as { result?: { mergeRecord?: MergeRecordModel } }).result
        ?.mergeRecord ??
      Object.values(resultState.mergeRecords)
        .filter((merge) => merge.sourceId === activeMerge.sourceId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

    set((current) => ({
      ...current,
      activeMergeRecordId: mergeRecord?.id ?? null,
      pendingMergeDiff:
        ((mergeRecord?.diff ?? mergeRecord?.diffSummary ?? null) as TextDiff | null),
      mergeConflictMessage: mergeRecord?.conflictReason ?? null,
      mergeRecords: resultState.mergeRecords,
      eventLogs: resultState.eventLogs,
      timelineNodes: resultState.timelineNodes,
      timelineEdges: resultState.timelineEdges
    }));
  },

  requestMerge: (threadId) => {
    const state = get();
    const thread = state.threads[threadId];

    if (!thread) {
      return;
    }

    const lastAssistantMessage = Object.values(state.messages)
      .filter(
        (message) =>
          message.threadId === threadId &&
          message.role === "assistant" &&
          message.contentState !== "deleted"
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
    const sourceId = lastAssistantMessage?.revisionMessageId;

    if (!sourceId) {
      set({
        activeMergeRecordId: null,
        pendingMergeDiff: null,
        mergeConflictMessage: "No persisted local assistant answer is available to merge."
      });
      return;
    }

    get().openMergeModalForSource(
      thread.revisionThreadType === "nested_local"
        ? "nested_local_answer"
        : "local_answer",
      sourceId,
      "replace_selection"
    );
  },

  requestMergeFromSelection: (selection) => {
    const state = get();

    if (!selection.sourceLocalThreadId || !selection.sourceAnswerId) {
      return;
    }

    const sourceLocalThread = state.localThreads[selection.sourceLocalThreadId];
    const now = new Date().toISOString();
    const suffix = makeIdSuffix();
    const localSelectionResult = LocalSelectionService.createOrGetLocalSelection({
      state: revisionStateFromStore(state),
      projectId: state.currentProjectId,
      conversationId: selection.conversationId,
      sourceLocalThreadId: selection.sourceLocalThreadId,
      sourceMessageId: selection.sourceMessageId ?? selection.sourceAnswerId,
      sourceAnswerId: selection.sourceAnswerId,
      parentSelectionId:
        selection.parentSelectionId ?? sourceLocalThread?.sourceSelectionId,
      parentLocalSelectionId:
        selection.parentLocalSelectionId ?? sourceLocalThread?.parentLocalSelectionId,
      sourceDocumentVersionId:
        selection.sourceDocumentVersionId ?? sourceLocalThread?.sourceDocumentVersionId,
      selectedText: selection.selectedText,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      beforeContext: selection.contextBefore,
      afterContext: selection.contextAfter,
      textHash: selection.textHash,
      sourceThreadType:
        selection.sourceThreadType ?? sourceLocalThread?.threadType ?? "local",
      now,
      suffix
    });
    const sourceType =
      localSelectionResult.localSelection.sourceThreadType === "nested_local"
        ? "nested_local_selection"
        : "local_selection";
    const mergeAction = executeWorkspaceAction(
      localSelectionResult.state,
      "merge.into_document",
      {
        target: {
          objectType: "local_selection",
          objectId: localSelectionResult.localSelection.id,
          projectId: state.currentProjectId,
          conversationId: selection.conversationId,
          status: localSelectionResult.localSelection.status
        },
        projectId: state.currentProjectId,
        conversationId: selection.conversationId,
        sourceType,
        mergeMode: "replace_selection",
        now,
        suffix: `${suffix}-merge`
      },
      {
        id: "local-user",
        role: "owner",
        permissions: "*"
      }
    );
    const mergeState = "state" in mergeAction && mergeAction.state
      ? (mergeAction.state as RevisionRepositoryState)
      : localSelectionResult.state;
    const mergeRecord =
      (mergeAction as { result?: { mergeRecord?: MergeRecordModel } }).result
        ?.mergeRecord ??
      Object.values(mergeState.mergeRecords)
        .filter((merge) => merge.sourceId === localSelectionResult.localSelection.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

    set((current) => ({
      ...current,
      activeMergeRecordId: mergeRecord?.id ?? null,
      pendingMergeDiff:
        ((mergeRecord?.diff ?? mergeRecord?.diffSummary ?? null) as TextDiff | null),
      mergeConflictMessage: mergeRecord?.conflictReason ?? null,
      localSelections: mergeState.localSelections,
      mergeRecords: mergeState.mergeRecords,
      eventLogs: mergeState.eventLogs,
      timelineNodes: mergeState.timelineNodes,
      timelineEdges: mergeState.timelineEdges
    }));
    void syncRevisionFoundation({
      localSelections: mergeState.localSelections,
      mergeRecords: mergeState.mergeRecords,
      eventLogs: mergeState.eventLogs,
      timelineNodes: mergeState.timelineNodes,
      timelineEdges: mergeState.timelineEdges
    });
  },

  confirmMerge: () => {
    const state = get();
    const mergeId = state.activeMergeRecordId;

    if (!mergeId) {
      return;
    }

    const mergeRecord = state.mergeRecords[mergeId];
    const actionResult = get().executeRevisionAction("merge.into_document", {
      target: {
        objectType: "merge_record",
        objectId: mergeId,
        projectId: state.currentProjectId,
        conversationId: mergeRecord?.conversationId,
        status: mergeRecord?.status ?? "diff_ready"
      },
      confirmed: true,
      diffAccepted: true,
      suffix: makeIdSuffix()
    });
    const result = actionResult.status === "success"
      ? (actionResult.result as ReturnType<typeof MergeService.confirmMerge>)
      : null;

    if (!result || !result.ok) {
      set((current) => ({
        ...current,
        mergeRecords:
          result?.state.mergeRecords ?? current.mergeRecords,
        eventLogs: result?.state.eventLogs ?? current.eventLogs,
        timelineNodes: result?.state.timelineNodes ?? current.timelineNodes,
        timelineEdges: result?.state.timelineEdges ?? current.timelineEdges,
        mergeConflictMessage:
          result?.conflictReason ??
          (actionResult.status === "blocked"
            ? actionResult.reason
            : "The active document changed before confirmation.")
      }));
      return;
    }

    set((current) => ({
      ...current,
      documents:
        current.currentDocumentId && current.documents[current.currentDocumentId]
          ? {
              ...current.documents,
              [current.currentDocumentId]: {
                ...current.documents[current.currentDocumentId],
                rawText: result.documentVersion.content,
                updatedAt: result.documentVersion.createdAt
              }
            }
          : current.documents,
      projects: Object.fromEntries(
        Object.values(current.projects).map((project) => [
          project.id,
          project.id === current.currentProjectId
            ? {
                ...project,
                updatedAt: result.documentVersion.createdAt
              }
            : project
        ])
      ),
      mainConversations: result.state.mainConversations,
      documentVersions: result.state.documentVersions,
      textSelections: result.state.textSelections,
      revisionBranches: result.state.revisionBranches,
      mergeRecords: result.state.mergeRecords,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges,
      activeMergeRecordId: null,
      pendingMergeDiff: null,
      mergeConflictMessage: null
    }));
    void syncRevisionFoundation({
      projects: result.state.projects,
      mainConversations: result.state.mainConversations,
      documentVersions: result.state.documentVersions,
      textSelections: result.state.textSelections,
      revisionBranches: result.state.revisionBranches,
      mergeRecords: result.state.mergeRecords,
      eventLogs: result.state.eventLogs,
      timelineNodes: result.state.timelineNodes,
      timelineEdges: result.state.timelineEdges
    });
    get().refreshContextPreview();
  },

  cancelActiveMerge: () => {
    const state = get();
    const mergeId = state.activeMergeRecordId;

    if (!mergeId) {
      set({
        activeMergeRecordId: null,
        pendingMergeDiff: null,
        mergeConflictMessage: null
      });
      return;
    }

    const mergeRecord = state.mergeRecords[mergeId];
    const actionResult = get().executeRevisionAction("merge.cancel", {
      target: {
        objectType: "merge_record",
        objectId: mergeId,
        projectId: state.currentProjectId,
        conversationId: mergeRecord?.conversationId,
        status: mergeRecord?.status ?? "diff_ready"
      },
      suffix: makeIdSuffix()
    });
    const resultState =
      "state" in actionResult && actionResult.state
        ? (actionResult.state as RevisionRepositoryState)
        : revisionStateFromStore(get());

    set((current) => ({
      ...current,
      mergeRecords: resultState.mergeRecords,
      eventLogs: resultState.eventLogs,
      timelineNodes: resultState.timelineNodes,
      timelineEdges: resultState.timelineEdges,
      activeMergeRecordId: null,
      pendingMergeDiff: null,
      mergeConflictMessage: null
    }));
  },

  closeDiffModal: () => {
    set({
      isDiffModalOpen: false,
      pendingPatch: [],
      activeMergeRecordId: null,
      pendingMergeDiff: null,
      mergeConflictMessage: null
    });
  },

  discardThread: (threadId) => {
    const stateBeforeDiscard = get();
    const threadBeforeDiscard = stateBeforeDiscard.threads[threadId];

    if (
      threadBeforeDiscard?.revisionLocalThreadId &&
      stateBeforeDiscard.localThreads[threadBeforeDiscard.revisionLocalThreadId]
    ) {
      get().executeRevisionAction("object.discard", {
        target: {
          objectType: "local_thread",
          objectId: threadBeforeDiscard.revisionLocalThreadId,
          projectId: stateBeforeDiscard.currentProjectId,
          conversationId: threadBeforeDiscard.conversationSessionId,
          status:
            stateBeforeDiscard.localThreads[threadBeforeDiscard.revisionLocalThreadId]
              .status
        },
        confirmed: true,
        reason: "local_thread_discarded_from_action_bar",
        suffix: makeIdSuffix()
      });
    }

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
    const stateBeforeDelete = get();
    const threadBeforeDelete = stateBeforeDelete.threads[threadId];

    if (
      threadBeforeDelete?.revisionLocalThreadId &&
      stateBeforeDelete.localThreads[threadBeforeDelete.revisionLocalThreadId]
    ) {
      get().executeRevisionAction("object.delete", {
        target: {
          objectType: "local_thread",
          objectId: threadBeforeDelete.revisionLocalThreadId,
          projectId: stateBeforeDelete.currentProjectId,
          conversationId: threadBeforeDelete.conversationSessionId,
          status:
            stateBeforeDelete.localThreads[threadBeforeDelete.revisionLocalThreadId]
              .status
        },
        confirmed: true,
        reason: "local_thread_deleted_from_action_bar",
        suffix: makeIdSuffix()
      });
    }

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
    const stateBeforeRevert = get();
    const targetNode = stateBeforeRevert.timelineNodes[nodeId];
    const targetProjectId = targetNode?.projectId ?? stateBeforeRevert.currentProjectId;
    const targetConversationId =
      targetNode?.conversationId ?? DEFAULT_MAIN_SESSION_ID;
    let revertedRevisionState: RevisionRepositoryState | undefined;

    if (targetNode) {
      const actionResult = get().executeRevisionAction("timeline.revert_to_node", {
        target: {
          objectType: "timeline_node",
          objectId: nodeId,
          projectId: targetProjectId,
          conversationId: targetConversationId,
          status: targetNode.status
        },
        confirmed: true,
        diffAccepted: true,
        suffix: makeIdSuffix()
      });
      revertedRevisionState =
        "state" in actionResult
          ? (actionResult.state as RevisionRepositoryState | undefined)
          : undefined;
    }

    set((state) => {
      if (targetNode && !revertedRevisionState) {
        return state;
      }

      const activeDocumentVersionId =
        revertedRevisionState?.mainConversations[targetConversationId]
          ?.activeDocumentVersionId ??
        revertedRevisionState?.projects[targetProjectId]
          ?.activeDocumentVersionId;
      const activeDocumentVersion = activeDocumentVersionId
        ? revertedRevisionState?.documentVersions[activeDocumentVersionId]
        : undefined;
      const documentId =
        state.currentDocumentId ?? activeDocumentVersion?.documentId;

      if (!documentId) {
        return state;
      }

      const document = state.documents[documentId];
      if (!document) {
        return state;
      }

      if (activeDocumentVersion) {
        return reconcileWorkspaceFocusAfterTimelineChange(
          syncVisibleDocumentVersion(
            {
              ...state,
              currentDocumentId: documentId
            },
            activeDocumentVersion,
            nodeId
          )
        );
      }

      const result = checkoutVersionNode(document, state.versionNodes, nodeId);

      return reconcileWorkspaceFocusAfterTimelineChange({
        ...state,
        activeVersionNodeId: nodeId,
        documents: {
          ...state.documents,
          [documentId]: result.document
        },
        versionNodes: result.versionNodes
      });
    });

    get().refreshContextPreview();
  },

  returnToDocumentVersion: (versionId) => {
    const stateBeforeReturn = get();
    const targetVersion = stateBeforeReturn.documentVersions[versionId];

    if (
      !targetVersion ||
      targetVersion.status === "deleted" ||
      !targetVersion.createdFromTimelineNodeId
    ) {
      return;
    }

    const targetProjectId =
      targetVersion.projectId ?? stateBeforeReturn.currentProjectId;
    const targetConversationId =
      targetVersion.conversationId ?? DEFAULT_MAIN_SESSION_ID;
    const activeVersion = DocumentVersionService.getActiveDocumentVersion(
      revisionStateFromStore(stateBeforeReturn),
      targetProjectId,
      targetConversationId
    );
    const activeTimelineNodeId = activeVersion?.createdFromTimelineNodeId;

    if (
      activeTimelineNodeId &&
      stateBeforeReturn.mainConversations[targetConversationId]
        ?.activeTimelineNodeId !== activeTimelineNodeId
    ) {
      set((state) => {
        const conversation = state.mainConversations[targetConversationId];

        if (!conversation) {
          return state;
        }

        return {
          ...state,
          mainConversations: {
            ...state.mainConversations,
            [targetConversationId]: {
              ...conversation,
              activeTimelineNodeId,
              updatedAt: new Date().toISOString()
            }
          }
        };
      });
    }

    get().revertToNode(targetVersion.createdFromTimelineNodeId);
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
    }),
    {
      name: "answer-atlas-workspace-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        projects: state.projects,
        mainWindowId: state.mainWindowId,
        activeTreeWindowId: state.activeTreeWindowId,
        currentDocumentId: state.currentDocumentId,
        activeVersionNodeId: state.activeVersionNodeId,
        selectedAnchorId: state.selectedAnchorId,
        selectedThreadId: state.selectedThreadId,
        activeRevisionBranchId: state.activeRevisionBranchId,
        activeMergeRecordId: state.activeMergeRecordId,
        windows: state.windows,
        sessions: state.sessions,
        conversationMessages: state.conversationMessages,
        documents: state.documents,
        blocks: state.blocks,
        anchors: state.anchors,
        threads: state.threads,
        messages: state.messages,
        annotations: state.annotations,
        revisionAnnotations: state.revisionAnnotations,
        versionNodes: state.versionNodes,
        branches: state.branches,
        comparisons: state.comparisons,
        snapshots: state.snapshots,
        tombstones: state.tombstones,
        contextSnapshots: state.contextSnapshots,
        llmCallRecords: state.llmCallRecords,
        mainConversations: state.mainConversations,
        revisionMessages: state.revisionMessages,
        documentVersions: state.documentVersions,
        manualEditDrafts: state.manualEditDrafts,
        textSelections: state.textSelections,
        localThreads: state.localThreads,
        localSelections: state.localSelections,
        revisionBranches: state.revisionBranches,
        mergeRecords: state.mergeRecords,
        comparisonGraphs: state.comparisonGraphs,
        comparisonRuns: state.comparisonRuns,
        comparisonExports: state.comparisonExports,
        objectStateTransitions: state.objectStateTransitions,
        timelinePaths: state.timelinePaths,
        revertRecords: state.revertRecords,
        eventLogs: state.eventLogs,
        timelineNodes: state.timelineNodes,
        timelineEdges: state.timelineEdges,
        actionIdempotencyRecords: state.actionIdempotencyRecords,
        migrationJobs: state.migrationJobs,
        migrationBatches: state.migrationBatches,
        migrationIssues: state.migrationIssues,
        backfillRecords: state.backfillRecords,
        featureFlags: state.featureFlags,
        workspaceIndexes: state.workspaceIndexes,
        workspaceMetrics: state.workspaceMetrics,
        timelineNodeProjections: state.timelineNodeProjections,
        timelineGraphSnapshots: state.timelineGraphSnapshots,
        objectRelationIndex: state.objectRelationIndex,
        contextItemIndex: state.contextItemIndex,
        threadSummaries: state.threadSummaries,
        documentChunks: state.documentChunks,
        contextBuildCaches: state.contextBuildCaches,
        logicAssignments: state.logicAssignments,
        selectedModel: state.selectedModel,
        llmProvider: state.llmProvider,
        modelSource: state.modelSource,
        availableModels: state.availableModels,
        revisionSuggestions: state.revisionSuggestions,
        pendingMergeDiff: state.pendingMergeDiff,
        mergeConflictMessage: state.mergeConflictMessage
      })
    }
  )
);
