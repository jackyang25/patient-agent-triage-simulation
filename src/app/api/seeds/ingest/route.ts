import { NextResponse } from "next/server";
import { z } from "zod";
import { extractFromSeed } from "@/lib/seeds/extractor";
import { generateVariants } from "@/lib/seeds/perturbator";
import type { SeedConversation } from "@/lib/seeds/types";

const requestSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["patient", "agent"]),
        content: z.string(),
      }),
    )
    .min(2),
  metadata: z
    .object({
      source: z.string().optional(),
      deidentified: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid seed conversation", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const seed: SeedConversation = parsed.data;
    const { scenario, profile } = await extractFromSeed(seed);
    const variants = generateVariants(scenario);

    return NextResponse.json({
      scenario,
      profile,
      variants: variants.map((v) => ({
        scenario: v.scenario,
        droppedSymptoms: v.droppedSymptoms,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
