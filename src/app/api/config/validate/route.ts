import { NextResponse } from "next/server";
import { z } from "zod";
import { validateKey } from "@/lib/ai";

const requestSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey: z.string().min(1),
});

/** Validate a user-provided API key by making a minimal test call. */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const { provider, apiKey } = parsed.data;
  const result = await validateKey(provider, apiKey);

  if (!result.valid) {
    return NextResponse.json(
      { valid: false, error: result.reason },
      { status: 401 },
    );
  }

  return NextResponse.json({ valid: true });
}
