import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic";

export function getModel(provider?: ProviderId, apiKey?: string): LanguageModel {
  const id = provider ?? (process.env.AI_PROVIDER as ProviderId) ?? "openai";

  switch (id) {
    case "openai":
      return createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })("gpt-4o");
    case "anthropic":
      return createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })(
        "claude-sonnet-4-20250514",
      );
    default:
      throw new Error(`Unknown AI provider: ${id}. Use: openai, anthropic`);
  }
}

/**
 * Validate an API key by making a minimal generation call.
 * Returns true if the key works, false otherwise.
 */
export async function validateKey(provider: ProviderId, apiKey: string): Promise<boolean> {
  try {
    const model = getModel(provider, apiKey);
    await generateText({ model, prompt: "hi", maxOutputTokens: 1 });
    return true;
  } catch {
    return false;
  }
}
