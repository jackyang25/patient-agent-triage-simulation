import { z } from "zod";
import { HttpAgentAdapter } from "./http-adapter";
import type { AgentAdapter } from "./adapter";
import type { AdapterConfig } from "../types";

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
): AgentAdapter {
  switch (config.type) {
    case "stub":
      return new HttpAgentAdapter({
        type: "http",
        endpoint: `${baseUrl}/api/agents/stub`,
        headers: extraHeaders,
      });
    case "http":
      return new HttpAgentAdapter(config);
  }
}
