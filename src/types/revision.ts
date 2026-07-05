import type { ContextSnapshot, LLMCallRecord } from "./context";

export const REVISION_EVENT_TYPES = [
  "project.created",
  "conversation.created",
  "main_conversation.created",
  "message.user.created",
  "message.assistant.created",
  "document.version.created",
  "document.version.activated",
  "document.edit_draft.created",
  "document.edit_draft.updated",
  "document.edit_draft.cancelled",
  "document.manual_edit.diff_generated",
  "selection.created",
  "text_selection.created",
  "selection.anchor_status_changed",
  "local_thread.created",
  "local_message.user.created",
  "local_message.assistant.created",
  "nested_local_thread.created",
  "nested_local_message.user.created",
  "nested_local_message.assistant.created",
  "local_message.created",
  "local_answer.generated",
  "local_selection.created",
  "annotation.created",
  "annotation.kept_from_answer",
  "annotation.kept_from_selection",
  "annotation.updated",
  "annotation.scope_changed",
  "annotation.discarded",
  "annotation.deleted",
  "annotation.restored",
  "message.discarded",
  "message.deleted",
  "message.restored",
  "branch.created",
  "branch.merged",
  "branch.discarded",
  "branch.deleted",
  "branch.restored",
  "revision_branch.created",
  "local_thread.discarded",
  "local_thread.deleted",
  "local_thread.restored",
  "merge.proposed",
  "merge.diff_generated",
  "merge.conflict_detected",
  "merge.target_changed",
  "merge.cancelled",
  "merge.discarded",
  "merge.deleted",
  "merge.restored",
  "merge.confirmed",
  "document.manual_edited",
  "comparison.created",
  "comparison.run.created",
  "comparison.generated",
  "comparison.regenerated",
  "comparison.cleared",
  "comparison.discarded",
  "comparison.deleted",
  "comparison.restored",
  "comparison.exported",
  "comparison.summary_kept_as_note",
  "message.regenerated",
  "answer.regenerated",
  "branch.updated",
  "thread.discarded",
  "object.discarded",
  "object.deleted",
  "object.restored",
  "node.reverted",
  "timeline.revert_previewed",
  "timeline.reverted",
  "timeline.active_path_changed",
  "timeline.node_marked_inactive",
  "timeline.continuation_path_created",
  "context_snapshot.created",
  "llm.call.started",
  "llm.call.completed",
  "llm.call.failed",
  "model.changed",
  "migration.started",
  "migration.batch.started",
  "migration.batch.completed",
  "migration.completed",
  "migration.failed",
  "migration.rolled_back",
  "backfill.document_version.created",
  "backfill.event_log.created",
  "backfill.timeline_node.created",
  "backfill.context_snapshot.reconstructed",
  "backfill.active_path.created",
  "integrity.validation.completed",
  "integrity.issue.detected",
  "integrity.repair.applied",
  "timeline.snapshot.created",
  "timeline.snapshot.invalidated",
  "context.cache.created",
  "context.cache.hit",
  "context.cache.invalidated",
  "thread.summary.created",
  "thread.summary.updated",
  "thread.summary.invalidated",
  "document.chunks.created",
  "document.chunks.invalidated",
  "performance.slow_query.detected",
  "performance.threshold_exceeded",
  "comparison.graph.clustered",
  "comparison.graph.window_loaded"
] as const;

export type RevisionEventType = (typeof REVISION_EVENT_TYPES)[number];

export const OBJECT_STATUSES = [
  "active",
  "inactive",
  "draft",
  "pending",
  "failed",
  "diff_ready",
  "confirmed",
  "cancelled",
  "conflict",
  "cleared",
  "superseded",
  "discarded",
  "deleted",
  "merged",
  "active_marker"
] as const;

export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const MEMORY_SCOPES = [
  "project",
  "conversation",
  "document",
  "selected_text",
  "local_thread",
  "nested_local_thread",
  "annotation",
  "branch",
  "merge",
  "comparison",
  "timeline",
  "discarded",
  "deleted",
  "inactive_path"
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_EFFECTS = [
  "included",
  "excluded",
  "excluded_deleted",
  "excluded_discarded",
  "excluded_inactive",
  "promoted_to_document",
  "promoted_to_annotation",
  "local_only",
  "branch_only",
  "adds_annotation_memory",
  "updates_document_memory",
  "excluded_by_default",
  "permanently_excluded",
  "restored_to_scope",
  "adds_to_context",
  "changes_active_path",
  "none"
] as const;

export type MemoryEffect = (typeof MEMORY_EFFECTS)[number];

export const THREAD_TYPES = [
  "main",
  "local",
  "nested_local",
  "branch",
  "comparison"
] as const;

export type RevisionThreadType = (typeof THREAD_TYPES)[number];

export const MERGE_MODES = [
  "replace_selection",
  "insert_before_selection",
  "insert_after_selection",
  "append_to_paragraph",
  "new_paragraph_after_selection",
  "replace_custom_range",
  "apply_patch",
  "save_as_note",
  "replace_original_selection",
  "insert_before_original_selection",
  "insert_after_original_selection",
  "append_to_paragraph",
  "apply_as_patch",
  "merge_as_new_paragraph",
  "save_as_note_instead"
] as const;

export type MergeMode = (typeof MERGE_MODES)[number];

export const MERGE_SOURCE_TYPES = [
  "local_selection",
  "local_answer",
  "nested_local_selection",
  "nested_local_answer",
  "revision_branch",
  "branch_draft"
] as const;

export type MergeSourceType = (typeof MERGE_SOURCE_TYPES)[number];

export const MERGE_RECORD_STATUSES = [
  "pending",
  "diff_ready",
  "confirmed",
  "cancelled",
  "conflict",
  "discarded",
  "deleted"
] as const;

export type MergeRecordStatus = (typeof MERGE_RECORD_STATUSES)[number];

export const MERGE_CONFLICT_STATUSES = [
  "none",
  "source_version_outdated",
  "target_selection_changed",
  "target_range_missing",
  "active_document_changed",
  "hash_mismatch",
  "needs_manual_target"
] as const;

export type MergeConflictStatus = (typeof MERGE_CONFLICT_STATUSES)[number];

export const TIMELINE_EDGE_TYPES = [
  "sequence",
  "chronological",
  "selection_attach",
  "nested_branch",
  "annotation_attach",
  "branch",
  "comparison_attach",
  "comparison_run",
  "supersede",
  "export",
  "merge_proposal",
  "merge_back",
  "branch_status",
  "merge",
  "revert",
  "active_path",
  "continuation",
  "selection",
  "dependency"
] as const;

export type TimelineEdgeType = (typeof TIMELINE_EDGE_TYPES)[number];

export type RevisionObjectType =
  | "project"
  | "main_conversation"
  | "message"
  | "document_version"
  | "manual_edit_draft"
  | "text_selection"
  | "local_thread"
  | "local_selection"
  | "annotation"
  | "revision_branch"
  | "merge_record"
  | "comparison_graph"
  | "comparison_run"
  | "comparison_export"
  | "event_log"
  | "object_state_transition"
  | "timeline_path"
  | "revert_record"
  | "timeline_node"
  | "timeline_edge"
  | "llm_call"
  | "context_snapshot"
  | "migration_job"
  | "migration_batch"
  | "migration_issue"
  | "backfill_record"
  | "feature_flag"
  | "workspace_metric"
  | "timeline_node_projection"
  | "timeline_graph_snapshot"
  | "object_relation_index"
  | "context_item_index"
  | "thread_summary"
  | "document_chunk"
  | "context_build_cache";

export type FlexiblePayload = Record<string, unknown>;

export type MigrationStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "rolled_back"
  | "partial";

export type MigrationIssueSeverity = "info" | "warning" | "error";

export type MigrationIssueResolutionStatus =
  | "open"
  | "resolved"
  | "ignored"
  | "needs_review";

export type BackfillStatus =
  | "created"
  | "skipped_existing"
  | "warning"
  | "failed";

export type FeatureFlagKey =
  | "revision_workspace_enabled"
  | "event_log_enabled"
  | "timeline_graph_enabled"
  | "context_snapshot_enabled"
  | "document_version_enabled"
  | "local_thread_persistence_enabled"
  | "annotation_memory_enabled"
  | "selective_merge_enabled"
  | "revert_enabled"
  | "comparison_graph_enabled"
  | "action_registry_enabled"
  | "legacy_compatibility_mode";

export type MigrationJobModel = {
  id: string;
  migrationJobId?: string;
  name: string;
  version: string;
  status: MigrationStatus;
  startedAt: string;
  finishedAt?: string | null;
  createdBy: "user" | "assistant" | "system";
  metadata?: FlexiblePayload;
};

export type MigrationBatchModel = {
  id: string;
  migrationBatchId?: string;
  migrationJobId: string;
  entityType: string;
  startCursor?: string | null;
  endCursor?: string | null;
  processedCount: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
  status: MigrationStatus;
  startedAt: string;
  finishedAt?: string | null;
  metadata?: FlexiblePayload;
};

export type MigrationIssueModel = {
  id: string;
  migrationIssueId?: string;
  migrationJobId: string;
  migrationBatchId?: string;
  entityType: string;
  entityId?: string;
  severity: MigrationIssueSeverity;
  issueCode: string;
  message: string;
  resolutionStatus: MigrationIssueResolutionStatus;
  createdAt: string;
  metadata?: FlexiblePayload;
};

export type BackfillRecordModel = {
  id: string;
  backfillRecordId?: string;
  migrationJobId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: RevisionObjectType;
  targetEntityId: string;
  backfillType: string;
  status: BackfillStatus;
  createdAt: string;
  metadata?: FlexiblePayload;
};

export type FeatureFlagModel = {
  id: FeatureFlagKey;
  key: FeatureFlagKey;
  enabled: boolean;
  scopeType?: "global" | "project" | "conversation";
  scopeId?: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type WorkspaceIndexDefinition = {
  id: string;
  entity: string;
  fields: string[];
  unique?: boolean;
  metadata?: FlexiblePayload;
};

export type WorkspaceMetricRecord = {
  id: string;
  name: string;
  value: number;
  unit?: "count" | "ms";
  projectId?: string;
  conversationId?: string;
  createdAt: string;
  metadata?: FlexiblePayload;
};

export type ProjectionStatus = "active" | "stale" | "deleted";

export type TimelineNodeProjectionModel = {
  id: string;
  projectionId?: string;
  projectId: string;
  conversationId?: string;
  nodeId: string;
  eventType: RevisionEventType;
  targetObjectType: RevisionObjectType;
  targetObjectId: string;
  title: string;
  summary?: string;
  status: ObjectStatus;
  activePathId?: string;
  parentNodeId?: string | null;
  hasChildren: boolean;
  hasBranches: boolean;
  hasMerges: boolean;
  hasAnnotations: boolean;
  hasComparisons: boolean;
  hasContextSnapshot: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type TimelineGraphSnapshotModel = {
  id: string;
  snapshotId?: string;
  projectId: string;
  conversationId?: string;
  snapshotType: "active_path_overview" | "window" | "branch" | "object_subgraph";
  activePathId?: string;
  rootNodeId?: string;
  headNodeId?: string;
  nodeCount: number;
  edgeCount: number;
  collapsedGroupCount: number;
  graphSummary: FlexiblePayload;
  graphData: FlexiblePayload;
  sourceEventLogCursor?: string;
  sourceTimelineUpdatedAt?: string;
  status: ProjectionStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type ObjectRelationIndexModel = {
  id: string;
  relationId?: string;
  projectId: string;
  conversationId?: string;
  sourceObjectType: RevisionObjectType;
  sourceObjectId: string;
  relatedObjectType: RevisionObjectType;
  relatedObjectId: string;
  relationType: string;
  timelineNodeId?: string;
  createdAt: string;
  status: ObjectStatus;
  metadata?: FlexiblePayload;
};

export type ContextItemIndexModel = {
  id: string;
  contextItemId?: string;
  projectId: string;
  conversationId?: string;
  objectType: RevisionObjectType;
  objectId: string;
  scopeType?: AnnotationScopeType | "document_version" | "thread" | "timeline_path";
  scopeId?: string;
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  memoryPolicy?: AnnotationMemoryPolicy | "active_document_version" | "never_include" | "manual_only";
  status: ObjectStatus;
  activePathId?: string;
  documentVersionId?: string;
  threadId?: string;
  selectionId?: string;
  localThreadId?: string;
  branchId?: string;
  comparisonId?: string;
  contentHash?: string;
  contentPreview: string;
  tokenEstimate: number;
  createdAt: string;
  updatedAt: string;
  invalidatedAt?: string | null;
  metadata?: FlexiblePayload;
};

export type ThreadSummaryModel = {
  id: string;
  threadSummaryId?: string;
  projectId: string;
  conversationId?: string;
  threadType: RevisionThreadType;
  threadId: string;
  summaryType: "rolling" | "older_messages" | "manual";
  summaryText: string;
  coveredMessageIds: string[];
  coveredNodeIds: string[];
  startMessageId?: string;
  endMessageId?: string;
  tokenEstimate: number;
  model?: string;
  llmCallId?: string;
  contextSnapshotId?: string;
  status: ObjectStatus | "stale";
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type DocumentChunkModel = {
  id: string;
  documentChunkId?: string;
  projectId: string;
  conversationId?: string;
  documentVersionId: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  content: string;
  contentHash: string;
  tokenEstimate: number;
  sectionTitle?: string;
  paragraphIndex?: number;
  status: ObjectStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type ContextBuildCacheModel = {
  id: string;
  contextCacheId?: string;
  projectId: string;
  conversationId?: string;
  threadType?: RevisionThreadType;
  threadId?: string;
  scopeType?: string;
  scopeId?: string;
  activeDocumentVersionId?: string;
  activeTimelineNodeId?: string;
  activePathId?: string;
  contextRulesVersion: string;
  inputFingerprint: string;
  includedItemRefs: FlexiblePayload[];
  excludedItemRefs: FlexiblePayload[];
  compressedItemRefs: FlexiblePayload[];
  tokenEstimate: number;
  status: ProjectionStatus;
  createdAt: string;
  expiresAt?: string;
  invalidatedAt?: string | null;
  metadata?: FlexiblePayload;
};

export const ANNOTATION_SCOPE_TYPES = [
  "project",
  "conversation",
  "document",
  "selected_text",
  "local_thread",
  "nested_local_thread",
  "branch",
  "comparison"
] as const;

export type AnnotationScopeType = (typeof ANNOTATION_SCOPE_TYPES)[number];

export const ANNOTATION_SOURCE_TYPES = [
  "manual_note",
  "keep_as_note",
  "assistant_answer",
  "selected_fragment",
  "local_answer",
  "nested_local_answer",
  "branch_draft",
  "comparison_summary"
] as const;

export type AnnotationSourceType = (typeof ANNOTATION_SOURCE_TYPES)[number];

export const COMPARISON_GRAPH_STATUSES = [
  "active",
  "inactive",
  "cleared",
  "discarded",
  "deleted",
  "superseded",
  "failed"
] as const;

export type ComparisonGraphStatus =
  (typeof COMPARISON_GRAPH_STATUSES)[number];

export const COMPARISON_RUN_STATUSES = [
  "active",
  "superseded",
  "failed",
  "discarded",
  "deleted"
] as const;

export type ComparisonRunStatus = (typeof COMPARISON_RUN_STATUSES)[number];

export const COMPARISON_SOURCE_TYPES = [
  "document_version",
  "revision_branch",
  "message",
  "local_selection",
  "text_selection",
  "merge_record",
  "annotation"
] as const;

export type ComparisonSourceType = (typeof COMPARISON_SOURCE_TYPES)[number];

export const COMPARISON_GRAPH_NODE_TYPES = [
  "concept",
  "claim",
  "difference",
  "similarity",
  "conflict",
  "recommendation",
  "source_fragment"
] as const;

export type ComparisonGraphNodeType =
  (typeof COMPARISON_GRAPH_NODE_TYPES)[number];

export const COMPARISON_GRAPH_EDGE_TYPES = [
  "same_as",
  "differs_from",
  "contradicts",
  "extends",
  "narrows",
  "supports",
  "depends_on",
  "replaces",
  "merges_into"
] as const;

export type ComparisonGraphEdgeType =
  (typeof COMPARISON_GRAPH_EDGE_TYPES)[number];

export const COMPARISON_EXPORT_TYPES = ["json", "markdown", "svg"] as const;

export type ComparisonExportType = (typeof COMPARISON_EXPORT_TYPES)[number];

export const ANNOTATION_MEMORY_POLICIES = [
  "auto_by_scope",
  "always_include_when_scope_matches",
  "manual_only",
  "excluded_by_default",
  "never_include"
] as const;

export type AnnotationMemoryPolicy =
  (typeof ANNOTATION_MEMORY_POLICIES)[number];

export const DOCUMENT_VERSION_SOURCE_TYPES = [
  "initial_answer",
  "manual_edit",
  "merge",
  "revert",
  "regenerate",
  "import"
] as const;

export type DocumentVersionSourceType =
  (typeof DOCUMENT_VERSION_SOURCE_TYPES)[number];

export const MANUAL_EDIT_DRAFT_STATUSES = [
  "draft",
  "ready_for_review",
  "confirmed",
  "cancelled",
  "discarded"
] as const;

export type ManualEditDraftStatus =
  (typeof MANUAL_EDIT_DRAFT_STATUSES)[number];

export const SELECTION_ANCHOR_STATUSES = [
  "active",
  "needs_review",
  "previous_version"
] as const;

export type SelectionAnchorStatus =
  (typeof SELECTION_ANCHOR_STATUSES)[number];

export type ProjectModel = {
  id: string;
  name: string;
  status: ObjectStatus;
  activeConversationId?: string;
  activeDocumentVersionId?: string;
  activeTimelineNodeId?: string;
  activeTimelinePathId?: string;
  revisionWorkspaceReady?: boolean;
  migrationVersion?: string;
  createdAt: string;
  updatedAt: string;
  payload?: FlexiblePayload;
};

export type MainConversationModel = {
  id: string;
  projectId: string;
  title: string;
  status: ObjectStatus;
  activeTimelineNodeId?: string;
  activeTimelinePathId?: string;
  activeDocumentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  payload?: FlexiblePayload;
};

export type MessageModel = {
  id: string;
  projectId: string;
  conversationId: string;
  threadId?: string;
  threadType?: RevisionThreadType;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  status: ObjectStatus;
  memoryScope: MemoryScope;
  includeInContext: boolean;
  model?: string;
  llmCallId?: string;
  createdAt: string;
  payload?: FlexiblePayload;
};

export type DocumentVersionModel = {
  id: string;
  documentVersionId?: string;
  projectId: string;
  conversationId?: string;
  documentId: string;
  parentDocumentVersionId?: string | null;
  parentVersionId?: string | null;
  versionNumber?: number;
  contentHash?: string;
  createdFromEventId?: string;
  createdFromTimelineNodeId?: string;
  sourceType?: DocumentVersionSourceType;
  sourceId?: string;
  createdBy?: "user" | "assistant" | "system";
  sourceEventId?: string;
  status: ObjectStatus;
  content: string;
  title?: string;
  createdAt: string;
  metadata?: FlexiblePayload;
  payload?: FlexiblePayload;
};

export type ManualEditDraftModel = {
  id: string;
  editDraftId?: string;
  projectId: string;
  conversationId?: string;
  baseDocumentVersionId: string;
  baseContentHash: string;
  draftContent: string;
  draftContentHash: string;
  editedRangeStart?: number;
  editedRangeEnd?: number;
  status: ManualEditDraftStatus;
  createdBy: "user" | "assistant" | "system";
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
  payload?: FlexiblePayload;
};

export type TextSelectionModel = {
  id: string;
  projectId: string;
  conversationId?: string;
  sourceType: "document_version" | "message";
  sourceId: string;
  sourceDocumentVersionId?: string;
  sourceMessageId?: string;
  selectedText: string;
  startOffset?: number;
  endOffset?: number;
  textHash?: string;
  beforeContext?: string;
  afterContext?: string;
  anchorStatus?: SelectionAnchorStatus;
  status: ObjectStatus;
  createdAt: string;
  payload?: FlexiblePayload;
};

export type LocalThreadModel = {
  id: string;
  projectId: string;
  conversationId?: string;
  sourceSelectionId: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  parentThreadId?: string;
  threadType: Extract<RevisionThreadType, "local" | "nested_local">;
  sourceType?: TextSelectionModel["sourceType"] | "local_selection";
  sourceId?: string;
  sourceDocumentVersionId?: string;
  status: ObjectStatus;
  memoryScope: MemoryScope;
  createdAt: string;
  updatedAt: string;
  payload?: FlexiblePayload;
};

export type LocalSelectionModel = {
  id: string;
  projectId: string;
  conversationId?: string;
  sourceLocalThreadId: string;
  sourceMessageId: string;
  sourceAnswerId: string;
  sourceLocalAnswerId?: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceDocumentVersionId?: string;
  selectedText: string;
  startOffset?: number;
  endOffset?: number;
  beforeContext?: string;
  afterContext?: string;
  textHash?: string;
  sourceThreadType?: Extract<RevisionThreadType, "local" | "nested_local">;
  status: ObjectStatus;
  createdAt: string;
  payload?: FlexiblePayload;
};

export type AnnotationModel = {
  id: string;
  projectId: string;
  annotationId?: string;
  conversationId?: string;
  content: string;
  title?: string;
  scope: MemoryScope;
  scopeObjectId: string;
  scopeType?: AnnotationScopeType;
  scopeId?: string;
  sourceType?: AnnotationSourceType;
  sourceId?: string;
  sourceText?: string;
  sourceMessageId?: string;
  sourceSelectionId?: string;
  sourceLocalSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceBranchId?: string;
  sourceDocumentVersionId?: string;
  createdFromEventId?: string;
  createdFromTimelineNodeId?: string;
  memoryPolicy?: AnnotationMemoryPolicy;
  status: ObjectStatus;
  includeInContext: boolean;
  createdBy?: "user" | "assistant" | "system";
  createdAt: string;
  updatedAt: string;
  discardedAt?: string | null;
  deletedAt?: string | null;
  payload?: FlexiblePayload;
};

export type RevisionBranchModel = {
  id: string;
  projectId: string;
  sourceObjectType: RevisionObjectType;
  sourceObjectId: string;
  parentSelectionId?: string;
  parentLocalSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceMessageId?: string;
  baseDocumentVersionId?: string;
  content?: string;
  draftContent?: string;
  status: ObjectStatus;
  memoryScope: MemoryScope;
  memoryEffect?: MemoryEffect;
  baseTimelineNodeId?: string;
  headTimelineNodeId?: string;
  createdAt: string;
  updatedAt: string;
  payload?: FlexiblePayload;
};

export type MergeRecordModel = {
  id: string;
  mergeId?: string;
  projectId: string;
  conversationId?: string;
  sourceType?: MergeSourceType;
  sourceId?: string;
  sourceText?: string;
  sourceMessageId?: string;
  sourceLocalSelectionId?: string;
  sourceSelectionId?: string;
  sourceLocalThreadId?: string;
  sourceBranchId?: string;
  sourceDocumentVersionId?: string;
  sourceObjectType: RevisionObjectType;
  sourceObjectId: string;
  targetDocumentVersionId: string;
  targetDocumentVersionHash?: string;
  targetSelectionId?: string;
  targetRangeStart?: number;
  targetRangeEnd?: number;
  targetBeforeContext?: string;
  targetAfterContext?: string;
  mergeMode: MergeMode;
  proposedContent?: string;
  resultContentPreview?: string;
  diff?: FlexiblePayload;
  diffSummary?: FlexiblePayload;
  status: MergeRecordStatus;
  conflictStatus?: MergeConflictStatus;
  conflictReason?: string;
  createdBy?: "user" | "assistant" | "system";
  confirmedBy?: "user" | "assistant" | "system";
  createdAt: string;
  updatedAt?: string;
  confirmedAt?: string;
  cancelledAt?: string | null;
  discardedAt?: string | null;
  deletedAt?: string | null;
  resultDocumentVersionId?: string;
  payload?: FlexiblePayload;
};

export type ComparisonGraphModel = {
  id: string;
  comparisonId?: string;
  projectId: string;
  conversationId?: string;
  title?: string;
  description?: string;
  scopeType?: AnnotationScopeType | "comparison" | "document";
  scopeId?: string;
  sourceObjectTypes?: ComparisonSourceType[];
  sourceObjectIds: string[];
  sourceSnapshot?: FlexiblePayload[];
  sourceHashes?: Record<string, string>;
  activeRunId?: string;
  sourceVersions: string[];
  createdBy?: "user" | "assistant" | "system";
  updatedAt?: string;
  status: ComparisonGraphStatus;
  model?: string;
  contextSnapshotId?: string;
  graphNodes: FlexiblePayload[];
  graphEdges: FlexiblePayload[];
  summary?: string;
  createdAt: string;
  metadata?: FlexiblePayload;
  payload?: FlexiblePayload;
};

export type ComparisonRunModel = {
  id: string;
  comparisonRunId?: string;
  comparisonId: string;
  projectId: string;
  conversationId?: string;
  runNumber: number;
  model: string;
  modelProvider?: "openai" | "mock";
  llmCallId: string;
  contextSnapshotId: string;
  graphData: FlexiblePayload;
  summary: string;
  semanticGroups: FlexiblePayload[];
  differenceSummary?: string;
  similaritySummary?: string;
  conflictSummary?: string;
  recommendationSummary?: string;
  inputSourceSnapshot: FlexiblePayload[];
  inputSourceHashes: Record<string, string>;
  status: ComparisonRunStatus;
  createdBy?: "user" | "assistant" | "system";
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  metadata?: FlexiblePayload;
};

export type ComparisonExportModel = {
  id: string;
  exportId?: string;
  projectId: string;
  conversationId?: string;
  comparisonId: string;
  comparisonRunId: string;
  exportType: ComparisonExportType;
  fileName: string;
  fileUrl?: string;
  fileMetadata?: FlexiblePayload;
  createdBy?: "user" | "assistant" | "system";
  createdAt: string;
  status: Extract<ObjectStatus, "active" | "failed" | "deleted">;
  metadata?: FlexiblePayload;
};

export type ObjectStateTransitionModel = {
  id: string;
  transitionId?: string;
  projectId: string;
  conversationId?: string;
  objectType: RevisionObjectType;
  objectId: string;
  fromStatus?: ObjectStatus;
  toStatus: ObjectStatus;
  reason: string;
  actorType: "user" | "assistant" | "system";
  actorId?: string;
  eventId: string;
  timelineNodeId: string;
  createdAt: string;
  metadata?: FlexiblePayload;
};

export type TimelinePathModel = {
  id: string;
  pathId?: string;
  projectId: string;
  conversationId?: string;
  rootNodeId?: string;
  baseNodeId?: string;
  headNodeId: string;
  createdFromNodeId?: string;
  createdByEventId?: string;
  status: Extract<ObjectStatus, "active" | "inactive" | "merged" | "deleted"> | "abandoned";
  createdAt: string;
  updatedAt: string;
  metadata?: FlexiblePayload;
};

export type RevertRecordModel = {
  id: string;
  revertId?: string;
  projectId: string;
  conversationId?: string;
  fromNodeId: string;
  toNodeId: string;
  fromPathId?: string;
  toPathId?: string;
  previousActiveDocumentVersionId?: string;
  newActiveDocumentVersionId?: string;
  affectedNodeIds: string[];
  inactiveNodeIds: string[];
  createdBy: "user" | "assistant" | "system";
  createdAt: string;
  eventId: string;
  timelineNodeId: string;
  status: "completed" | "failed" | "cancelled";
  metadata?: FlexiblePayload;
};

export type ActionExecutionStatus =
  | "in_progress"
  | "completed"
  | "failed"
  | "rolled_back";

export type ActionIdempotencyRecord = {
  id: string;
  idempotencyKey: string;
  projectId?: string;
  conversationId?: string;
  actionId: string;
  targetObjectType?: RevisionObjectType;
  targetObjectId?: string;
  status: ActionExecutionStatus;
  resultReference?: FlexiblePayload;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type EventLogRecord = {
  id: string;
  projectId: string;
  eventType: RevisionEventType;
  objectType: RevisionObjectType;
  objectId: string;
  actor: "user" | "assistant" | "system";
  timestamp: string;
  immutable: true;
  payload: FlexiblePayload;
};

export type RevisionTimelineNode = {
  id: string;
  projectId: string;
  conversationId?: string;
  parentNodeId?: string | null;
  eventId: string;
  eventType: RevisionEventType;
  targetObjectType: RevisionObjectType;
  targetObjectId: string;
  label: string;
  actor: "user" | "assistant" | "system";
  model?: string;
  memoryScope: MemoryScope;
  memoryEffect: MemoryEffect;
  status: ObjectStatus;
  activePathId?: string;
  createdContentRef?: string;
  affectedContextRefs?: string[];
  timestamp: string;
  payload?: FlexiblePayload;
};

export type RevisionTimelineEdge = {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: TimelineEdgeType;
  label?: string;
  status: ObjectStatus;
  timestamp: string;
  payload?: FlexiblePayload;
};

export type RevisionRepositoryState = {
  projects: Record<string, ProjectModel>;
  mainConversations: Record<string, MainConversationModel>;
  revisionMessages: Record<string, MessageModel>;
  documentVersions: Record<string, DocumentVersionModel>;
  manualEditDrafts: Record<string, ManualEditDraftModel>;
  textSelections: Record<string, TextSelectionModel>;
  localThreads: Record<string, LocalThreadModel>;
  localSelections: Record<string, LocalSelectionModel>;
  annotations: Record<string, AnnotationModel>;
  revisionBranches: Record<string, RevisionBranchModel>;
  mergeRecords: Record<string, MergeRecordModel>;
  comparisonGraphs: Record<string, ComparisonGraphModel>;
  comparisonRuns: Record<string, ComparisonRunModel>;
  comparisonExports: Record<string, ComparisonExportModel>;
  objectStateTransitions: Record<string, ObjectStateTransitionModel>;
  timelinePaths: Record<string, TimelinePathModel>;
  revertRecords: Record<string, RevertRecordModel>;
  eventLogs: Record<string, EventLogRecord>;
  timelineNodes: Record<string, RevisionTimelineNode>;
  timelineEdges: Record<string, RevisionTimelineEdge>;
  llmCallRecords: Record<string, LLMCallRecord>;
  contextSnapshots: Record<string, ContextSnapshot>;
  actionIdempotencyRecords: Record<string, ActionIdempotencyRecord>;
  migrationJobs: Record<string, MigrationJobModel>;
  migrationBatches: Record<string, MigrationBatchModel>;
  migrationIssues: Record<string, MigrationIssueModel>;
  backfillRecords: Record<string, BackfillRecordModel>;
  featureFlags: Record<string, FeatureFlagModel>;
  workspaceIndexes: Record<string, WorkspaceIndexDefinition>;
  workspaceMetrics: Record<string, WorkspaceMetricRecord>;
  timelineNodeProjections: Record<string, TimelineNodeProjectionModel>;
  timelineGraphSnapshots: Record<string, TimelineGraphSnapshotModel>;
  objectRelationIndex: Record<string, ObjectRelationIndexModel>;
  contextItemIndex: Record<string, ContextItemIndexModel>;
  threadSummaries: Record<string, ThreadSummaryModel>;
  documentChunks: Record<string, DocumentChunkModel>;
  contextBuildCaches: Record<string, ContextBuildCacheModel>;
};

export type TimelineGraph = {
  projectId: string;
  nodes: RevisionTimelineNode[];
  edges: RevisionTimelineEdge[];
};

export type RelatedSelectionObjects = {
  selectionId: string;
  localThreads: LocalThreadModel[];
  localSelections: LocalSelectionModel[];
  annotations: AnnotationModel[];
  revisionBranches: RevisionBranchModel[];
  mergeRecords: MergeRecordModel[];
  comparisonGraphs: ComparisonGraphModel[];
  events: EventLogRecord[];
};

export type RelatedAnnotationObjects = {
  scopeType?: AnnotationScopeType;
  scopeId?: string;
  sourceType?: AnnotationSourceType;
  sourceId?: string;
  annotations: AnnotationModel[];
};

export type RelatedLocalSelectionObjects = {
  localSelectionId: string;
  nestedLocalThreads: LocalThreadModel[];
  revisionBranches: RevisionBranchModel[];
  events: EventLogRecord[];
  timelineNodes: RevisionTimelineNode[];
  timelineEdges: RevisionTimelineEdge[];
};
