import type { ClinicalScenario } from "../types";

export interface PerturbationVariant {
  scenario: ClinicalScenario;
  droppedSymptoms: string[];
}

/**
 * Generate scenario variants by systematically dropping symptoms.
 * - Drop each symptom one at a time (N variants with N-1 symptoms)
 * - Drop pairs for scenarios with 5+ symptoms
 *
 * Each variant inherits examples and seedId from the parent.
 * No LLM calls — pure combinatorics.
 */
export function generateVariants(scenario: ClinicalScenario): PerturbationVariant[] {
  const { symptoms } = scenario;
  if (symptoms.length < 2) return [];

  const variants: PerturbationVariant[] = [];

  for (let i = 0; i < symptoms.length; i++) {
    const dropped = [symptoms[i]];
    const remaining = symptoms.filter((_, idx) => idx !== i);

    variants.push({
      scenario: buildVariant(scenario, remaining, dropped),
      droppedSymptoms: dropped,
    });
  }

  if (symptoms.length >= 5) {
    for (let i = 0; i < symptoms.length; i++) {
      for (let j = i + 1; j < symptoms.length; j++) {
        const dropped = [symptoms[i], symptoms[j]];
        const remaining = symptoms.filter((_, idx) => idx !== i && idx !== j);

        variants.push({
          scenario: buildVariant(scenario, remaining, dropped),
          droppedSymptoms: dropped,
        });
      }
    }
  }

  return variants;
}

function buildVariant(
  parent: ClinicalScenario,
  remainingSymptoms: string[],
  droppedSymptoms: string[],
): ClinicalScenario {
  const dropLabel = droppedSymptoms
    .map((s) => s.toLowerCase().replace(/\s+/g, "_"))
    .join("+");

  return {
    ...parent,
    id: `${parent.id}-drop-${dropLabel}`,
    name: `${parent.name} (−${droppedSymptoms.join(", ")})`,
    symptoms: remainingSymptoms,
  };
}
