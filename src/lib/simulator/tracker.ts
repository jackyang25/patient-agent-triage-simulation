import type { Message } from "../types";

export interface SymptomDisclosureState {
  total: number;
  disclosed: string[];
  undisclosed: string[];
  elicited: string[];
  volunteered: string[];
  disclosureRate: number;
}

/**
 * Deterministic per-turn symptom tracker. Maintains which scenario symptoms
 * have appeared in patient messages and whether they were elicited by an
 * agent question or volunteered unprompted.
 */
export class SymptomTracker {
  private symptoms: string[];
  private disclosedSet = new Set<string>();
  private elicitedSet = new Set<string>();

  constructor(symptoms: string[]) {
    this.symptoms = symptoms;
  }

  /**
   * Call after each patient message. Checks which new symptoms appeared
   * and whether the agent's preceding message contained a question.
   */
  update(patientMessage: string, agentAskedQuestion: boolean): void {
    const lower = patientMessage.toLowerCase();

    for (const symptom of this.symptoms) {
      if (this.disclosedSet.has(symptom)) continue;
      if (this.matchesSymptom(lower, symptom)) {
        this.disclosedSet.add(symptom);
        if (agentAskedQuestion) {
          this.elicitedSet.add(symptom);
        }
      }
    }
  }

  getState(): SymptomDisclosureState {
    const disclosed = this.symptoms.filter((s) => this.disclosedSet.has(s));
    const undisclosed = this.symptoms.filter((s) => !this.disclosedSet.has(s));
    const elicited = disclosed.filter((s) => this.elicitedSet.has(s));
    const volunteered = disclosed.filter((s) => !this.elicitedSet.has(s));

    return {
      total: this.symptoms.length,
      disclosed,
      undisclosed,
      elicited,
      volunteered,
      disclosureRate: this.symptoms.length > 0
        ? disclosed.length / this.symptoms.length
        : 0,
    };
  }

  private matchesSymptom(lowerText: string, symptom: string): boolean {
    const words = symptom.toLowerCase().split(/\s+/);
    return words.some((w) => w.length > 3 && lowerText.includes(w));
  }
}

/**
 * Check whether the last agent message in the history contained a question.
 */
export function lastAgentAskedQuestion(history: Message[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "agent") {
      return history[i].content.includes("?");
    }
  }
  return false;
}
