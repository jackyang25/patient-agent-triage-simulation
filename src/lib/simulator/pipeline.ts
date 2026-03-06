import type { LanguageModel } from "ai";
import { store } from "../store";
import { runConversation } from "./runner";
import { evaluateEscalation } from "./evaluator";
import { annotateConversation } from "./annotator";
import { deriveTemporalFeatures } from "./temporal";
import { validateConversation } from "./validator";
import type { AgentAdapter } from "./adapter";
import type { ClinicalScenario, CommunicationProfile, Rubric } from "../types";

export interface SimulationContext {
  sessionId: string;
  patientModel: LanguageModel;
  validatorModel: LanguageModel;
  annotatorModel: LanguageModel;
  maxTurns?: number;
}

/**
 * Full simulation pipeline: conversation -> evaluation -> validation -> annotation -> temporal features.
 *
 * Expects the run to already exist in the store with status "simulating".
 * Callers are responsible for creating the run, setting initial status,
 * creating the adapter, and handling top-level errors.
 */
export async function executeSimulation(
  runId: string,
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
  rubric: Rubric,
  agent: AgentAdapter,
  ctx: SimulationContext,
): Promise<void> {
  const { sessionId, patientModel, validatorModel, annotatorModel, maxTurns } = ctx;

  const { trace, symptomDisclosure } = await runConversation(
    scenario, profile, agent, { maxTurns, model: patientModel },
  );
  store.updateRun(sessionId, runId, { status: "evaluating", trace });

  const evaluation = evaluateEscalation(trace, scenario);
  const informationExtractionRate = symptomDisclosure.disclosureRate;

  let validation;
  try {
    validation = await validateConversation(trace, scenario, profile, validatorModel);
  } catch (err) {
    console.error(`Validation failed for run ${runId}:`, err);
  }

  try {
    const { turnAnnotations } = await annotateConversation(trace, scenario, rubric, annotatorModel);
    trace.turnAnnotations = turnAnnotations;
    const temporalFeatures = deriveTemporalFeatures(
      turnAnnotations, evaluation, informationExtractionRate,
    );
    store.updateRun(sessionId, runId, {
      status: "completed",
      trace,
      evaluation,
      temporalFeatures,
      validation,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Temporal annotation failed for run ${runId}:`, err);
    store.updateRun(sessionId, runId, {
      status: "completed",
      evaluation,
      validation,
      completedAt: new Date().toISOString(),
    });
  }
}
