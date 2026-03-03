import { NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeSeed } from "@/lib/seeds/synthesizer";

const requestSchema = z.object({
  conditionHint: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const seed = await synthesizeSeed(parsed.data.conditionHint);
    return NextResponse.json(seed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
