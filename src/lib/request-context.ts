import { z } from "zod";
import { getModel, type ProviderId } from "./ai";
import type { LanguageModel } from "ai";
import type { ModelConfig } from "./types";

export const modelConfigSchema = z.object({
  patient: z.string(),
  validator: z.string(),
  annotator: z.string(),
  agent: z.string().optional(),
});

export function getSessionId(request: Request): string {
  const id = request.headers.get("x-session-id");
  if (!id) throw new Error("Missing X-Session-ID header");
  return id;
}

/** Extract provider + apiKey from request headers (shared across all roles). */
export function getProviderFromRequest(request: Request): { provider: ProviderId; apiKey: string | undefined } {
  const provider = (request.headers.get("x-ai-provider") ?? "openai") as ProviderId;
  const apiKey = request.headers.get("x-api-key") ?? undefined;
  return { provider, apiKey };
}

/** Create per-role LanguageModel instances from a ModelConfig and shared credentials. */
export function buildRoleModels(
  provider: ProviderId,
  apiKey: string | undefined,
  config: ModelConfig,
): { patientModel: LanguageModel; validatorModel: LanguageModel; annotatorModel: LanguageModel } {
  return {
    patientModel: getModel(provider, config.patient, apiKey),
    validatorModel: getModel(provider, config.validator, apiKey),
    annotatorModel: getModel(provider, config.annotator, apiKey),
  };
}

/** Single-model extraction — used by the stub agent route which still reads model from headers. */
export function getModelFromRequest(request: Request): LanguageModel {
  const provider = (request.headers.get("x-ai-provider") ?? "openai") as ProviderId;
  const modelId = request.headers.get("x-ai-model") ?? "gpt-4o";
  const apiKey = request.headers.get("x-api-key") ?? undefined;
  return getModel(provider, modelId, apiKey);
}

/** Build headers to forward AI credentials to an internal HTTP call (e.g. stub agent). */
export function getAIHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const provider = request.headers.get("x-ai-provider");
  const apiKey = request.headers.get("x-api-key");
  if (provider) headers["x-ai-provider"] = provider;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}
