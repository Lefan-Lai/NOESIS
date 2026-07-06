import {
  buildMockModelCatalog,
  filterUsableModels,
  getConfiguredModelAllowlist,
  PREFERRED_DEFAULT_MODEL,
  prioritizePreferredDefaultModel,
  type ModelCatalog,
  type ModelListItem
} from "./modelCatalog";

export async function getOpenAIModelCatalog(): Promise<ModelCatalog> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildMockModelCatalog();
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return buildMockModelCatalog();
  }

  const data = (await response.json()) as { data?: ModelListItem[] };
  const configuredAllowlist = getConfiguredModelAllowlist();
  const models = prioritizePreferredDefaultModel(
    filterUsableModels(data.data ?? [], configuredAllowlist)
  );

  if (models.length === 0) {
    return buildMockModelCatalog();
  }

  return {
    models,
    defaultModel: models.includes(PREFERRED_DEFAULT_MODEL)
      ? PREFERRED_DEFAULT_MODEL
      : models[0],
    provider: "openai",
    configuredAllowlist,
    source: "openai-api"
  };
}

export async function assertAllowedModel(model: string) {
  const catalog = await getOpenAIModelCatalog();

  if (catalog.provider !== "openai") {
    return catalog.defaultModel;
  }

  if (!catalog.models.includes(model)) {
    throw new Error(`Model is not available in the configured API model range.`);
  }

  return model;
}
