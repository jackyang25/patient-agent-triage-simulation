import { generateText, type LanguageModel } from "ai";
import type { ClinicalScenario, CommunicationProfile, Message } from "../types";
import type { SymptomDisclosureState } from "./tracker";

const OPENING_REVEAL: Record<string, number> = {
  direct: 3,
  indirect: 1,
  vague: 1,
  code_switching: 2,
  pushy: 2,
};

function buildExamplesSection(
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
): string {
  const scenarioEx = scenario.examples ?? [];
  const profileEx = profile.examples ?? [];
  const combined = [...new Set([...scenarioEx, ...profileEx])];
  if (combined.length === 0) return "";

  const bullets = combined.map((e) => `- "${e}"`).join("\n");
  return `

## How Real Patients Like You Talk
Here are examples from a real patient with similar issues:
${bullets}

Sound like THEM. Match their vocabulary, sentence length, and tone.`;
}

function buildSystemPrompt(
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
): string {
  const openingCount = OPENING_REVEAL[profile.type] ?? 1;

  return `You are a real patient texting a health service chatbot. Sound like a REAL PERSON, not an AI.

## Who You Are
You are a patient using a health support service.
You have: ${scenario.symptoms.join(", ")}
Your actual condition (you don't know this clinical name): ${scenario.condition}
${scenario.historyNotes ? `History: ${scenario.historyNotes}` : ""}

## How You Communicate — "${profile.name}" Style
${profile.description}

${profile.behaviorRules.map((r) => `- ${r}`).join("\n")}

## Symptom Reveal Pacing
You have ${scenario.symptoms.length} symptoms. For your communication style:
- Opening message: mention at most ${openingCount} symptom(s) — pick the least alarming
- Only reveal more symptoms when the agent asks a relevant question
- Never list all your symptoms at once — that's not how real patients talk
- If the agent doesn't ask, don't volunteer

## Hard Rules
- You are the PATIENT. You ask for help, you don't give it.
- NEVER say "How can I help you" or "Let me know if you need anything"
- Sound like a real person texting. Short, messy, casual.
- NEVER repeat something you already said. If you've mentioned a symptom, don't mention it again.
- If the agent asks the same question twice, get annoyed.
- If the agent isn't helping, get frustrated, change topic, or say you'll go somewhere else.
- Keep messages to 1-2 sentences. No paragraphs.
- Do NOT start with greetings like "Hi" or "Hello" after the first message.
- If you've already said thanks/goodbye ONCE, do NOT say it again. Real people don't send 5 thank-you messages. The conversation is over.
- If the agent says "take care" or wraps up, you're done. Say one short thing at most and stop.${buildExamplesSection(scenario, profile)}`;
}

function getStage(
  turnIndex: number,
  maxTurns: number,
): "opening" | "middle" | "closing" {
  const progress = turnIndex / (maxTurns * 2);
  if (progress < 0.15) return "opening";
  if (progress > 0.7) return "closing";
  return "middle";
}

function extractPatientSaid(history: Message[]): string[] {
  return history
    .filter((m) => m.role === "patient" && m.content)
    .map((m) => m.content);
}

function lastAgentMessage(history: Message[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "agent" && history[i].content) {
      return history[i].content;
    }
  }
  return null;
}

const STAGE_GUIDANCE: Record<string, string> = {
  opening:
    "You're just starting the conversation. Be casual. Mention why you're reaching out but don't dump details.",
  middle:
    "Conversation is underway. Respond to what the agent just said. Only share new info if asked.",
  closing:
    "Conversation has been going on a while. If you're not getting help, express frustration or wrap up. Don't introduce new topics.",
};

const SHORT_MESSAGE_THRESHOLD = 20;
const MIN_DISCLOSURE_FOR_END = 0.3;

function buildTurnPrompt(
  history: Message[],
  stage: "opening" | "middle" | "closing",
  isFirstTurn: boolean,
  symptomState?: SymptomDisclosureState,
): string {
  if (isFirstTurn) {
    return "You're opening a chat with a health service. Send your first message — mention why you're reaching out, casually. One sentence, like a real text.";
  }

  const agentSaid = lastAgentMessage(history);
  const patientPrev = extractPatientSaid(history);

  const parts: string[] = [];

  parts.push(`Stage: ${stage}. ${STAGE_GUIDANCE[stage]}`);

  if (symptomState) {
    if (symptomState.disclosed.length > 0) {
      parts.push(
        `Symptoms you've already mentioned (${symptomState.disclosed.length}/${symptomState.total}): ${symptomState.disclosed.join(", ")}`,
      );
    }
    if (symptomState.undisclosed.length > 0 && stage !== "closing") {
      parts.push(
        `Symptoms you haven't mentioned yet: ${symptomState.undisclosed.join(", ")}. Only reveal these if the agent asks something relevant.`,
      );
    }
  }

  if (agentSaid) {
    parts.push(`The agent just said: "${agentSaid}"`);
    parts.push("Respond to what they said. Don't ignore their question.");
  }

  if (patientPrev.length > 0) {
    parts.push(
      "You have already told the agent:\n" +
        patientPrev.map((s) => `- "${s}"`).join("\n"),
    );
    parts.push("Do NOT repeat any of the above. Say something new or respond to the agent's question.");
  }

  parts.push("Your next message (1-2 sentences, sound human):");

  return parts.join("\n\n");
}

/**
 * Word-level Jaccard similarity. Used to catch near-duplicate messages.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function isTooSimilar(newMsg: string, prevMessages: string[]): boolean {
  return prevMessages.some((prev) => jaccardSimilarity(newMsg, prev) > 0.55);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function hasQuestion(text: string): boolean {
  return text.includes("?");
}

function hasClinicalContent(text: string, symptoms: string[]): boolean {
  const lower = text.toLowerCase();
  return symptoms.some((s) => {
    const words = s.toLowerCase().split(/\s+/);
    return words.some((w) => w.length > 3 && lower.includes(w));
  });
}

/**
 * Structural + scenario-aware end-of-conversation detection.
 * Won't trigger if less than MIN_DISCLOSURE_FOR_END of symptoms have surfaced,
 * ensuring conversations don't end before meaningful clinical exchange.
 */
export function shouldEndConversation(
  history: Message[],
  symptoms: string[],
  disclosureRate: number,
): boolean {
  if (history.length < 4) return false;

  // don't end if the patient hasn't disclosed enough for a valid test
  if (disclosureRate < MIN_DISCLOSURE_FOR_END) return false;

  const tail = history.slice(-4);
  const allShort = tail.every((m) => wordCount(m.content) < SHORT_MESSAGE_THRESHOLD);
  const noQuestions = tail.every((m) => !hasQuestion(m.content));
  const noClinical = tail.every((m) => !hasClinicalContent(m.content, symptoms));

  if (allShort && noQuestions && noClinical) return true;

  const patientMsgs = history.filter((m) => m.role === "patient");
  if (patientMsgs.length >= 2) {
    const lastTwo = patientMsgs.slice(-2);
    const bothShort = lastTwo.every((m) => wordCount(m.content) < SHORT_MESSAGE_THRESHOLD);
    const bothNoQuestion = lastTwo.every((m) => !hasQuestion(m.content));
    const bothNoClinical = lastTwo.every((m) => !hasClinicalContent(m.content, symptoms));
    if (bothShort && bothNoQuestion && bothNoClinical) return true;
  }

  return false;
}

const MAX_RETRIES = 2;

export async function generatePatientMessage(
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
  conversationHistory: Message[],
  isFirstTurn: boolean,
  maxTurns: number = 12,
  symptomState: SymptomDisclosureState | undefined,
  model: LanguageModel,
): Promise<string> {
  const system = buildSystemPrompt(scenario, profile);
  const stage = getStage(conversationHistory.length, maxTurns);
  const prevPatientMessages = extractPatientSaid(conversationHistory);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = attempt === 0
      ? buildTurnPrompt(conversationHistory, stage, isFirstTurn, symptomState)
      : buildTurnPrompt(conversationHistory, stage, isFirstTurn, symptomState) +
        "\n\nIMPORTANT: Your previous attempt was too similar to something you already said. Say something DIFFERENT.";

    const result = await generateText({
      model,
      system,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 120,
    });

    const text = result.text.trim();

    if (!text) continue;
    if (!isFirstTurn && isTooSimilar(text, prevPatientMessages)) continue;

    return text;
  }

  const fallback = await generateText({
    model,
    system,
    prompt: "Respond briefly to the agent. One sentence. Don't repeat anything you said before.",
    temperature: 0.5,
    maxOutputTokens: 60,
  });

  return fallback.text.trim() || "ok";
}
