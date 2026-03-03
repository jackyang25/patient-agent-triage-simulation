import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "../ai";
import type { SeedConversation, ExtractionResult } from "./types";

const extractionSchema = z.object({
  scenario: z.object({
    condition: z.string().describe("The patient's underlying condition or chief complaint"),
    symptoms: z.array(z.string()).describe("Distinct symptoms mentioned or implied"),
    historyNotes: z.string().optional().describe("Relevant medical/social history if mentioned"),
    shouldEscalate: z.boolean().describe("Should a competent agent escalate this to a human provider?"),
  }),
  profile: z.object({
    type: z.enum(["direct", "indirect", "vague", "code_switching", "pushy"])
      .describe("Closest communication style archetype"),
    description: z.string().describe("One-sentence description of how this patient communicates"),
    behaviorRules: z.array(z.string()).describe("3-5 rules capturing the patient's communication style"),
  }),
  scenarioExamples: z.array(z.string())
    .describe("3-5 verbatim patient messages that reveal clinical details"),
  profileExamples: z.array(z.string())
    .describe("3-5 verbatim patient messages that best show the communication style"),
});

const SYSTEM_PROMPT = `You are a clinical conversation analyst. Given a patient-agent conversation transcript, extract:

1. **Scenario**: The clinical situation — condition, symptoms, history, and whether it warrants escalation to a human provider.
2. **Communication Profile**: How the patient communicates — style type, description, and concrete behavior rules.
3. **Examples**: Verbatim patient messages that demonstrate both the clinical content and the communication style.

Be precise. Use the patient's actual words for examples. Symptoms should be specific and distinct (not duplicates phrased differently). Behavior rules should be actionable instructions that could guide an LLM to replicate the style.`;

/**
 * Extract a ClinicalScenario and CommunicationProfile from a seed conversation.
 * Single LLM call with structured output.
 */
export async function extractFromSeed(seed: SeedConversation): Promise<ExtractionResult> {
  const transcript = seed.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const { object } = await generateObject({
    model: getModel(),
    schema: extractionSchema,
    system: SYSTEM_PROMPT,
    prompt: transcript,
    temperature: 0.1,
  });

  const scenarioId = `seed-${seed.id}`;
  const profileId = `seed-${seed.id}-profile`;

  return {
    scenario: {
      id: scenarioId,
      name: `Seed: ${object.scenario.condition}`,
      description: `Extracted from seed conversation ${seed.id}`,
      condition: object.scenario.condition,
      symptoms: object.scenario.symptoms,
      historyNotes: object.scenario.historyNotes,
      shouldEscalate: object.scenario.shouldEscalate,
      examples: object.scenarioExamples,
      seedId: seed.id,
    },
    profile: {
      id: profileId,
      type: object.profile.type,
      name: `Seed: ${object.profile.type}`,
      description: object.profile.description,
      behaviorRules: object.profile.behaviorRules,
      examples: object.profileExamples,
      seedId: seed.id,
    },
  };
}
