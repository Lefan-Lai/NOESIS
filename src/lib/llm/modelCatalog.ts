export type ModelListItem = {
  id: string;
  created?: number;
  owned_by?: string;
};

export type ModelCatalog = {
  models: string[];
  defaultModel: string;
  provider: "openai" | "mock";
  configuredAllowlist: string[];
  source: "openai-api" | "mock-fallback";
};

export const PREFERRED_DEFAULT_MODEL = "gpt-5.5";

const unsuitableTextModelFragments = [
  "embedding",
  "audio",
  "tts",
  "transcribe",
  "moderation",
  "image",
  "vision",
  "realtime",
  "whisper",
  "dall"
];

const fallbackMockModels = [PREFERRED_DEFAULT_MODEL, "mock-llm"];

export function getConfiguredModelAllowlist() {
  return (process.env.ANSWER_ATLAS_ALLOWED_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function looksLikeTextGenerationModel(modelId: string) {
  const lower = modelId.toLowerCase();

  if (!lower.startsWith("gpt-") && !lower.startsWith("o")) {
    return false;
  }

  return !unsuitableTextModelFragments.some((fragment) =>
    lower.includes(fragment)
  );
}

export function filterUsableModels(
  apiModels: ModelListItem[],
  configuredAllowlist = getConfiguredModelAllowlist()
) {
  const apiModelIds = apiModels.map((model) => model.id).sort();
  const apiModelSet = new Set(apiModelIds);

  if (configuredAllowlist.length > 0) {
    return configuredAllowlist.filter((model) => apiModelSet.has(model));
  }

  return apiModelIds.filter(looksLikeTextGenerationModel);
}

export function prioritizePreferredDefaultModel(
  models: string[],
  preferredModel = PREFERRED_DEFAULT_MODEL
) {
  return [
    preferredModel,
    ...models.filter((model) => model !== preferredModel)
  ];
}

export function buildMockModelCatalog(): ModelCatalog {
  const models = prioritizePreferredDefaultModel(fallbackMockModels);

  return {
    models,
    defaultModel: PREFERRED_DEFAULT_MODEL,
    provider: "mock",
    configuredAllowlist: getConfiguredModelAllowlist(),
    source: "mock-fallback"
  };
}
