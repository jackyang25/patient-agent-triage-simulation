import type { ConversationTrace, ClinicalScenario, EscalationResult } from "../types";

/**
 * Rule-based evaluation. No LLM-as-judge.
 *
 * Compares agent behavior (did it escalate?) against ground truth
 * (should it have escalated?) to produce a confusion matrix cell.
 */
export function evaluateEscalation(
  trace: ConversationTrace,
  scenario: ClinicalScenario,
): EscalationResult {
  const agentEscalated = trace.terminationReason === "escalation";
  const shouldHaveEscalated = scenario.shouldEscalate;

  let outcome: EscalationResult["outcome"];
  if (agentEscalated && shouldHaveEscalated) {
    outcome = "true_positive";
  } else if (agentEscalated && !shouldHaveEscalated) {
    outcome = "false_positive";
  } else if (!agentEscalated && shouldHaveEscalated) {
    outcome = "false_negative";
  } else {
    outcome = "true_negative";
  }

  return {
    agentEscalated,
    shouldHaveEscalated,
    outcome,
  };
}
