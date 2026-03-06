import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic";

export interface ModelDef {
  id: string;
  provider: ProviderId;
  label: string;
}

export const MODELS: ModelDef[] = [
  { id: "gpt-4o", provider: "openai", label: "GPT-4o" },
  { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o Mini" },
  { id: "o3-mini", provider: "openai", label: "o3-mini" },
  { id: "claude-sonnet-4-20250514", provider: "anthropic", label: "Claude Sonnet 4" },
  { id: "claude-haiku-3-5-20241022", provider: "anthropic", label: "Claude 3.5 Haiku" },
];

export function getModelsForProvider(provider: ProviderId): ModelDef[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function getModel(provider: ProviderId, modelId: string, apiKey?: string): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })(modelId);
    default:
      throw new Error(`Unknown AI provider: ${provider}. Use: openai, anthropic`);
  }
}

/**
 * Validate an API key by making a minimal generation call.
 * Uses the cheapest model for the provider to minimize cost.
 */
export async function validateKey(provider: ProviderId, apiKey: string): Promise<{ valid: true } | { valid: false; reason: string }> {
  const cheapModel = provider === "openai" ? "gpt-4o-mini" : "claude-haiku-3-5-20241022";
  try {
    const model = getModel(provider, cheapModel, apiKey);
    await generateText({ model, prompt: "hi", maxOutputTokens: 16 });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: message };
  }
}
