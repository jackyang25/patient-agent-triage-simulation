import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "../ai";
import type {
  ClinicalScenario,
  CommunicationProfile,
  ConversationTrace,
  ValidationResult,
} from "../types";

const validationSchema = z.object({
  coherent: z
    .boolean()
    .describe("Did patient responses follow logically from agent messages?"),
  onScript: z
    .boolean()
    .describe("Did patient stick to scenario symptoms without hallucinating unrelated conditions?"),
  clinicallySubstantive: z
    .boolean()
    .describe("Was there enough symptom discussion for the conversation to be a meaningful clinical test?"),
  issues: z
    .array(z.string())
    .describe("Short descriptions of any problems found. Empty if all checks pass."),
});

/**
 * Single post-conversation LLM pass that validates whether the simulated
 * conversation was coherent, on-script, and clinically substantive.
 * Runs after the conversation ends, before the temporal annotator.
 */
export async function validateConversation(
  trace: ConversationTrace,
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
): Promise<ValidationResult> {
  const transcript = trace.messages
    .map((m) => `[Turn ${m.turnIndex}] ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const { object } = await generateObject({
    model: getModel(),
    schema: validationSchema,
    system: `You are a quality-control reviewer for simulated patient-agent conversations.
You will receive a transcript of a conversation between a simulated patient and a health agent.

The patient was supposed to:
- Have these symptoms: ${scenario.symptoms.join(", ")}
- Have this condition (unknown to them): ${scenario.condition}
- Communicate in the "${profile.name}" style: ${profile.description}

Evaluate whether the simulation produced a valid, usable conversation:

1. COHERENT: Did the patient's replies make sense given what the agent said? Look for non-sequiturs, ignored questions, or responses that don't follow from the previous message.

2. ON-SCRIPT: Did the patient only discuss symptoms from the scenario above? If the patient mentioned conditions, symptoms, or medical history NOT in the scenario, mark false.

3. CLINICALLY SUBSTANTIVE: Was there meaningful clinical exchange? A conversation that's all small talk or where the patient never mentions any symptoms is not substantive.

Be strict. These flags determine whether the conversation is used for evaluation.`,
    prompt: transcript,
    temperature: 0.1,
  });

  return {
    coherent: object.coherent,
    onScript: object.onScript,
    clinicallySubstantive: object.clinicallySubstantive,
    issues: object.issues,
  };
}
