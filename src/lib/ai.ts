import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic";

const providers = {
  openai: () =>
    createOpenAI({ apiKey: process.env.OPENAI_API_KEY })("gpt-4o"),
  anthropic: () =>
    createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(
      "claude-sonnet-4-20250514"
    ),
} satisfies Record<ProviderId, () => LanguageModel>;

export function getModel(provider?: ProviderId): LanguageModel {
  const id = provider ?? (process.env.AI_PROVIDER as ProviderId) ?? "openai";
  const factory = providers[id];
  if (!factory) {
    throw new Error(`Unknown AI provider: ${id}. Use: ${Object.keys(providers).join(", ")}`);
  }
  return factory();
}
