import { z } from "zod";
import { HttpAgentAdapter } from "./http-adapter";
import { StubAgentAdapter } from "./agent";
import type { AgentAdapter } from "./adapter";
import type { AdapterConfig } from "../types";
import type { LanguageModel } from "ai";

export const stubConfigSchema = z.object({
  type: z.literal("stub"),
});

export const httpConfigSchema = z.object({
  type: z.literal("http"),
  endpoint: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const adapterConfigSchema = z.union([stubConfigSchema, httpConfigSchema]);

export function createAdapter(
  config: AdapterConfig,
  baseUrl: string,
  extraHeaders?: Record<string, string>,
  stubModel?: LanguageModel,
): AgentAdapter {
  switch (config.type) {
    case "stub":
      if (!stubModel) {
        throw new Error("Missing stub model for stub adapter configuration.");
      }
      return new StubAgentAdapter(stubModel);
    case "http":
      return new HttpAgentAdapter(config);
  }
}
