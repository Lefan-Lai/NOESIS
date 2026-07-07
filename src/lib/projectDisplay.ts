type ProjectSnapshotLike = {
  conversationMessages?: Record<string, unknown>;
  revisionMessages?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  documentVersions?: Record<string, unknown>;
  textSelections?: Record<string, unknown>;
  localThreads?: Record<string, unknown>;
  localSelections?: Record<string, unknown>;
  revisionBranches?: Record<string, unknown>;
  mergeRecords?: Record<string, unknown>;
  comparisonGraphs?: Record<string, unknown>;
  revisionAnnotations?: Record<string, unknown>;
  threads?: Record<string, unknown>;
  messages?: Record<string, unknown>;
  versionNodes?: Record<string, unknown>;
};

const CONTENT_KEYS = [
  "conversationMessages",
  "revisionMessages",
  "documents",
  "documentVersions",
  "textSelections",
  "localThreads",
  "localSelections",
  "revisionBranches",
  "mergeRecords",
  "comparisonGraphs",
  "revisionAnnotations",
  "threads",
  "messages",
  "versionNodes"
] as const;

const TEMPORARY_PROJECT_NAME_PATTERN =
  /^(default|project\s+\d+|untitled project|empty session|new project)$/i;

const GENERIC_GENERATED_TITLE_PATTERN =
  /^(generated answer|main answer|answer|untitled|new document)$/i;

export function isTemporaryProjectName(name: string | undefined) {
  return TEMPORARY_PROJECT_NAME_PATTERN.test((name ?? "").trim());
}

export function projectSnapshotHasContent(snapshot?: ProjectSnapshotLike | null) {
  if (!snapshot) {
    return false;
  }

  return CONTENT_KEYS.some((key) => {
    const record = snapshot[key];

    return Boolean(record && Object.keys(record).length > 0);
  });
}

export function projectTitleFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Untitled Project";
  }

  const sentence =
    cleaned
      .split(/[.!?]\s+|\s{2,}/)
      .map((part) => part.trim())
      .find(Boolean) ?? cleaned;
  const title =
    sentence.length > 34 ? `${sentence.slice(0, 34).trim()}...` : sentence;

  return title || "Untitled Project";
}

export function projectTitleFromPromptOrGenerated(
  prompt: string,
  generatedTitle?: string
) {
  const title = (generatedTitle ?? "").trim();

  if (title && !GENERIC_GENERATED_TITLE_PATTERN.test(title)) {
    return title.length > 34 ? `${title.slice(0, 34).trim()}...` : title;
  }

  return projectTitleFromPrompt(prompt);
}
