import { NextResponse } from "next/server";
import { validateKey, type ProviderId } from "@/lib/ai";

const globalCache = globalThis as unknown as {
  __validatedServerKeys?: Record<ProviderId, boolean>;
};

/**
 * Returns which server-side API keys are configured AND valid.
 * Validation results are cached for the lifetime of the process
 * so the test call only runs once per provider per server start.
 */
export async function GET() {
  if (!globalCache.__validatedServerKeys) {
    const results: Record<ProviderId, boolean> = { openai: false, anthropic: false };

    const checks: Promise<void>[] = [];

    if (process.env.OPENAI_API_KEY) {
      checks.push(
        validateKey("openai", process.env.OPENAI_API_KEY).then((ok) => { results.openai = ok; }),
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      checks.push(
        validateKey("anthropic", process.env.ANTHROPIC_API_KEY).then((ok) => { results.anthropic = ok; }),
      );
    }

    await Promise.all(checks);
    globalCache.__validatedServerKeys = results;
  }

  const providers = globalCache.__validatedServerKeys;

  return NextResponse.json({
    hasServerKeys: providers.openai || providers.anthropic,
    providers,
  });
}
