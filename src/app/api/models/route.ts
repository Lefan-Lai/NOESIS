import { NextResponse } from "next/server";
import { getOpenAIModelCatalog } from "@/lib/llm/serverModelCatalog";

export async function GET() {
  const catalog = await getOpenAIModelCatalog();

  return NextResponse.json(catalog);
}
