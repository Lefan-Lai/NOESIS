type ResponseInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CreateResponseParams = {
  apiKey: string;
  model: string;
  input: ResponseInputMessage[];
};

function extractTextFromResponse(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const record = data as Record<string, unknown>;

  if (typeof record.output_text === "string") {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const contentItem of content) {
      if (typeof contentItem !== "object" || contentItem === null) {
        continue;
      }

      const contentRecord = contentItem as Record<string, unknown>;

      if (typeof contentRecord.text === "string") {
        parts.push(contentRecord.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export async function createOpenAIResponse({
  apiKey,
  model,
  input
}: CreateResponseParams) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: input.map((message) => ({
        role: message.role,
        content: [
          {
            type: message.role === "assistant" ? "output_text" : "input_text",
            text: message.content
          }
        ]
      }))
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI response failed: ${response.status} ${details}`);
  }

  const data = await response.json();

  return extractTextFromResponse(data);
}

export function parseJsonObject<T>(text: string, fallback: T): T {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch?.[1] ?? trimmed;

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return fallback;
  }
}
