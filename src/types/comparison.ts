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

export type SemanticMeaningEffect =
  | "meaning_preserved"
  | "meaning_narrowed"
  | "meaning_expanded"
  | "meaning_shifted"
  | "meaning_unclear";

export type SemanticRiskLevel = "none" | "low" | "medium" | "high";

export type SemanticBlockType =
  | "claim"
  | "reason"
  | "evidence"
  | "example"
  | "definition"
  | "limitation"
  | "method"
  | "result"
  | "interpretation"
  | "conclusion"
  | "transition"
  | "other";

export type SemanticAlignmentType =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "added_only"
  | "removed_only"
  | "moved"
  | "unmatched";

export type SemanticPrimaryChange =
  | "unchanged"
  | "added"
  | "removed"
  | "rewritten"
  | "moved"
  | "split"
  | "merged";

export type SemanticTag =
  | "claim_changed"
  | "claim_softened"
  | "claim_strengthened"
  | "scope_expanded"
  | "scope_narrowed"
  | "evidence_added"
  | "evidence_removed"
  | "example_added"
  | "example_removed"
  | "limitation_added"
  | "definition_added"
  | "logic_clarified"
  | "tone_more_cautious"
  | "tone_more_confident"
  | "tone_more_academic"
  | "wording_simplified"
  | "wording_more_precise"
  | "structure_reordered"
  | "risk_introduced"
  | "context_aligned";

export type SemanticTriggeredBy =
  | "user_question"
  | "annotation"
  | "llm_inference"
  | "context_alignment"
  | "unknown";

export type SemanticConfidence = "high" | "medium" | "low";

export type SemanticDifferenceMap = {
  id: string;
  documentId: string;
  anchorId: string;
  originalText: string;
  revisedText: string;
  overview: SemanticDifferenceOverview;
  rows: SemanticAlignmentRow[];
  createdAt: string;
};

export type SemanticDifferenceOverview = {
  mainSummary: string;
  meaningEffect: SemanticMeaningEffect;
  riskLevel: SemanticRiskLevel;
  counts: {
    added: number;
    removed: number;
    rewritten: number;
    moved: number;
    claimChanged: number;
    toneChanged: number;
  };
};

export type SemanticBlock = {
  id: string;
  blockType: SemanticBlockType;
  text: string;
  preview: string;
};

export type SemanticAlignmentRow = {
  id: string;
  blockType?: SemanticBlockType;
  originalBlock?: SemanticBlock;
  revisedBlock?: SemanticBlock;
  originalIndex?: number;
  revisedIndex?: number;
  alignmentType: SemanticAlignmentType;
  primaryChange: SemanticPrimaryChange;
  semanticTags: SemanticTag[];
  importance: "critical" | "high" | "medium" | "low";
  risk: SemanticRiskLevel;
  triggeredBy: SemanticTriggeredBy;
  shortReason?: string;
  explanation?: string;
  whyItMatters?: string;
  contextImpact?: string;
  confidence: SemanticConfidence;
};

export type SemanticDifferenceDetail = {
  rowId: string;
  originalFullBlock: string;
  revisedFullBlock: string;
  primaryChange: SemanticPrimaryChange;
  semanticTags: SemanticTag[];
  explanation: string;
  whyItMatters: string;
  triggeredBy: SemanticTriggeredBy;
  risk: SemanticRiskLevel;
  contextImpact: string;
  confidence: SemanticConfidence;
};

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
  semanticMap?: SemanticDifferenceMap;
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
