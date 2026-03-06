import { getModel, type ProviderId } from "./ai";
import type { LanguageModel } from "ai";

export function getSessionId(request: Request): string {
  const id = request.headers.get("x-session-id");
  if (!id) throw new Error("Missing X-Session-ID header");
  return id;
}

export function getModelFromRequest(request: Request): LanguageModel {
  const provider = request.headers.get("x-ai-provider") as ProviderId | null;
  const apiKey = request.headers.get("x-api-key");
  return getModel(provider ?? undefined, apiKey ?? undefined);
}

export function getAIHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const provider = request.headers.get("x-ai-provider");
  const apiKey = request.headers.get("x-api-key");
  if (provider) headers["x-ai-provider"] = provider;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}
