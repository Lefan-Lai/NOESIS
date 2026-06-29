export type ComparisonDifference =
  | "same"
  | "rewritten"
  | "refined"
  | "expanded"
  | "reduced"
  | "replaced"
  | "added"
  | "removed"
  | "conflict";

export type ComparisonImportance = "low" | "medium" | "high";

export type LayeredComparisonBoard = {
  board_id: string;
  original_answer_id: string;
  revised_answer_id: string;
  summary: LayeredComparisonBoardSummary;
  levels: ComparisonLevel[];
};

export type LayeredComparisonBoardSummary = {
  overall_summary: string;
  recommended_action:
    | "keep_original"
    | "prefer_revised"
    | "merge_both"
    | "manual_review";
};

export type ComparisonLevel = {
  level_id: string;
  level_name:
    | "main_topics"
    | "key_decisions"
    | "details_implementation"
    | "risks_actions";
  display_title: string;
  rows: ComparisonRow[];
};

export type ComparisonRow = {
  row_id: string;
  shared_topic: string;
  original: ComparisonRowSide | null;
  revised: ComparisonRowSide | null;
  difference: ComparisonDifference;
  importance: ComparisonImportance;
  short_explanation: string;
};

export type ComparisonRowSide = {
  title: string;
  short_summary: string;
  full_text?: string;
};

export type LayeredComparisonScaffold = {
  comparison_id: string;
  original_answer_id: string;
  revised_answer_id: string;
  root_slot_id: string;
  slots: ComparisonSlot[];
  summary: ComparisonSummary;
};

export type ComparisonSlot = {
  slot_id: string;
  parent_slot_id: string | null;
  level_index: 0 | 1 | 2 | 3 | 4;
  level_role:
    | "root"
    | "main_topic"
    | "claim_or_decision"
    | "support_or_detail"
    | "consequence_risk_or_action";
  shared_topic: string;
  original_node?: ComparisonSlotNode;
  revised_node?: ComparisonSlotNode;
  relation:
    | "same"
    | "rewritten"
    | "refined"
    | "expanded"
    | "reduced"
    | "replaced"
    | "contradicted"
    | "original_only"
    | "revised_only";
  short_comparison: string;
  order_group:
    | "matched"
    | "changed"
    | "contradicted"
    | "original_only"
    | "revised_only";
  order_index: number;
  importance?: "low" | "medium" | "high";
};

export type ComparisonSlotNode = {
  node_id: string;
  title: string;
  summary: string;
  source_text: string;
};

export type ComparisonSummary = {
  overall_summary: string;
  main_similarities: string[];
  main_differences: string[];
  main_risks: string[];
  recommended_action:
    | "keep_original"
    | "prefer_revised"
    | "merge_both"
    | "manual_review";
};

export type ArgumentComparison = {
  id: string;
  documentId: string;
  anchorId: string;
  board: LayeredComparisonBoard;
  scaffold: LayeredComparisonScaffold;
  originalTree: ArgumentTree;
  revisedTree: ArgumentTree;
  comparisonEdges: ComparisonEdge[];
  createdInVersionNodeId: string;
  status: "active" | "merged" | "discarded" | "deleted";
  createdAt: string;
  updatedAt: string;
};

export type ArgumentTree = {
  id: string;
  rootNodeId: string;
  nodes: ArgumentNode[];
  edges: ArgumentEdge[];
};

export type ArgumentNode = {
  id: string;
  nodeType:
    | "claim"
    | "reason"
    | "issue"
    | "evidence"
    | "evidence_gap"
    | "advantage";
  label: string;
  text: string;
  order: number;
};

export type ArgumentEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: "supports" | "critiques" | "explains" | "adds_evidence";
};

export type ComparisonEdge = {
  id: string;
  fromOriginalNodeId: string;
  toRevisedNodeId: string;
  label: string;
  edgeType:
    | "wording_improvement"
    | "evidence_added"
    | "claim_refined"
    | "support_strengthened";
};
