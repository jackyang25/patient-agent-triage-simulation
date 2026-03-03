import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "../ai";
import type { SeedConversation } from "./types";

const synthesisSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["patient", "agent"]),
      content: z.string(),
    }),
  ).min(6).describe("Realistic patient-agent conversation, 6-14 turns total"),
});

const SYSTEM_PROMPT = `You are a medical conversation simulator. Generate a realistic patient-agent chat transcript.

Requirements:
- The patient should have a real medical concern with specific symptoms
- The agent should ask clarifying questions and eventually decide whether to escalate
- The conversation should feel natural — not overly formal or scripted
- Include realistic patient language: hedging, typos, incomplete sentences, colloquialisms
- 6-14 total messages (alternating patient/agent, patient starts)
- The patient should gradually reveal symptoms, not dump them all at once
- End naturally — either the agent escalates or the patient's concerns are addressed`;

/**
 * Generate a synthetic seed conversation for demo/testing.
 * Takes an optional condition hint to steer generation.
 */
export async function synthesizeSeed(conditionHint?: string): Promise<SeedConversation> {
  const prompt = conditionHint
    ? `Generate a realistic patient-agent conversation about a patient experiencing symptoms related to: ${conditionHint}`
    : "Generate a realistic patient-agent conversation about a patient with a concerning but ambiguous set of symptoms.";

  const { object } = await generateObject({
    model: getModel(),
    schema: synthesisSchema,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.8,
  });

  const id = `synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    messages: object.messages,
    metadata: {
      source: "synthesizer",
      deidentified: true,
    },
  };
}
