import type { LanguageModel } from "ai";
import type {
  ClinicalScenario,
  CommunicationProfile,
  Message,
  ConversationTrace,
} from "../types";
import { generatePatientMessage, shouldEndConversation } from "./patient";
import { SymptomTracker, lastAgentAskedQuestion } from "./tracker";
import type { SymptomDisclosureState } from "./tracker";
import type { AgentAdapter } from "./adapter";

export interface ConversationResult {
  trace: ConversationTrace;
  symptomDisclosure: SymptomDisclosureState;
}

const DEFAULT_MAX_TURNS = 12;
const STALL_WINDOW = 3;
const STALL_THRESHOLD = 0.5;

export interface RunnerCallbacks {
  onTurn?: (turn: Message) => void;
  onComplete?: (trace: ConversationTrace) => void;
}

/**
 * Detect conversations that have stalled (agent and patient repeating
 * the same exchange). Compares the last STALL_WINDOW agent messages
 * by word-overlap. If all are too similar, the conversation is stuck.
 */
function isStalled(messages: Message[]): boolean {
  const agentMsgs = messages
    .filter((m) => m.role === "agent" && m.content)
    .map((m) => m.content);

  if (agentMsgs.length < STALL_WINDOW) return false;

  const recent = agentMsgs.slice(-STALL_WINDOW);
  const first = new Set(recent[0].toLowerCase().split(/\s+/));

  for (let i = 1; i < recent.length; i++) {
    const other = new Set(recent[i].toLowerCase().split(/\s+/));
    const intersection = [...first].filter((w) => other.has(w)).length;
    const union = new Set([...first, ...other]).size;
    if (union === 0 || intersection / union < STALL_THRESHOLD) return false;
  }

  return true;
}

export interface RunOptions {
  model: LanguageModel;
  maxTurns?: number;
  callbacks?: RunnerCallbacks;
}

export async function runConversation(
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
  agent: AgentAdapter,
  options: RunOptions,
): Promise<ConversationResult> {
  const { maxTurns = DEFAULT_MAX_TURNS, callbacks, model } = options;
  const messages: Message[] = [];
  const tracker = new SymptomTracker(scenario.symptoms);
  let turnIndex = 0;
  let terminationReason: ConversationTrace["terminationReason"] = "max_turns";

  const opening = await generatePatientMessage(
    scenario,
    profile,
    [],
    true,
    maxTurns,
    tracker.getState(),
    model,
  );
  const patientOpening: Message = {
    role: "patient",
    content: opening,
    turnIndex: turnIndex++,
  };
  messages.push(patientOpening);
  tracker.update(opening, false);
  callbacks?.onTurn?.(patientOpening);

  while (turnIndex < maxTurns * 2) {
    const agentResponse = await agent.respond(messages, turnIndex);
    const agentMsg: Message = {
      role: "agent",
      content: agentResponse.content,
      turnIndex: turnIndex++,
    };
    messages.push(agentMsg);
    callbacks?.onTurn?.(agentMsg);

    if (agentResponse.escalated) {
      terminationReason = "escalation";
      break;
    }

    if (
      isStalled(messages) ||
      shouldEndConversation(messages, scenario.symptoms, tracker.getState().disclosureRate)
    ) {
      terminationReason = "no_escalation";
      break;
    }

    const symptomState = tracker.getState();
    const patientContent = await generatePatientMessage(
      scenario,
      profile,
      messages,
      false,
      maxTurns,
      symptomState,
      model,
    );
    const patientMsg: Message = {
      role: "patient",
      content: patientContent,
      turnIndex: turnIndex++,
    };
    messages.push(patientMsg);
    tracker.update(patientContent, lastAgentAskedQuestion(messages));
    callbacks?.onTurn?.(patientMsg);
  }

  if (terminationReason === "max_turns") {
    terminationReason = "no_escalation";
  }

  const trace: ConversationTrace = {
    messages,
    terminationReason,
    totalTurns: Math.ceil(turnIndex / 2),
  };

  callbacks?.onComplete?.(trace);
  return { trace, symptomDisclosure: tracker.getState() };
}
