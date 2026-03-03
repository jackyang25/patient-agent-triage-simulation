import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getScenario } from "@/lib/scenarios";
import { getProfile } from "@/lib/profiles";
import { getRubric } from "@/lib/rubrics";
import { store } from "@/lib/store";
import { runConversation } from "@/lib/simulator/runner";
import { evaluateEscalation } from "@/lib/simulator/evaluator";
import { annotateConversation } from "@/lib/simulator/annotator";
import { deriveTemporalFeatures } from "@/lib/simulator/temporal";
import { validateConversation } from "@/lib/simulator/validator";
import { HttpAgentAdapter } from "@/lib/simulator/http-adapter";
import type { AgentAdapter } from "@/lib/simulator/adapter";
import type { SimulationRun, AdapterConfig, ClinicalScenario, CommunicationProfile, Rubric } from "@/lib/types";

const stubConfigSchema = z.object({
  type: z.literal("stub"),
});

const httpConfigSchema = z.object({
  type: z.literal("http"),
  endpoint: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  escalationPatterns: z.array(z.string()).optional(),
});

const requestSchema = z.object({
  scenarioId: z.string(),
  profileId: z.string(),
  rubricId: z.string(),
  adapterConfig: z.union([stubConfigSchema, httpConfigSchema]),
  maxTurns: z.number().min(4).max(30).optional(),
});

function createAdapter(config: AdapterConfig, baseUrl: string): AgentAdapter {
  switch (config.type) {
    case "stub":
      return new HttpAgentAdapter({
        type: "http",
        endpoint: `${baseUrl}/api/agents/stub`,
      });
    case "http":
      return new HttpAgentAdapter(config);
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { scenarioId, profileId, rubricId, adapterConfig: rawConfig, maxTurns } = parsed.data;
  const adapterConfig = rawConfig as AdapterConfig;

  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: `Scenario not found: ${scenarioId}` }, { status: 404 });
  }

  const profile = getProfile(profileId);
  if (!profile) {
    return NextResponse.json({ error: `Profile not found: ${profileId}` }, { status: 404 });
  }

  const rubric = getRubric(rubricId);
  if (!rubric) {
    return NextResponse.json({ error: `Rubric not found: ${rubricId}` }, { status: 404 });
  }

  const run: SimulationRun = {
    id: uuidv4(),
    scenarioId,
    profileId,
    rubricId,
    adapterConfig,
    status: "simulating",
    startedAt: new Date().toISOString(),
  };
  store.saveRun(run);

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const agent = createAdapter(adapterConfig, baseUrl);

  runSimulation(run.id, scenario, profile, rubric, agent, maxTurns).catch((err) => {
    store.updateRun(run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  });

  return NextResponse.json({ id: run.id, status: run.status }, { status: 201 });
}

async function runSimulation(
  runId: string,
  scenario: ClinicalScenario,
  profile: CommunicationProfile,
  rubric: Rubric,
  agent: AgentAdapter,
  maxTurns?: number,
) {
  const { trace, symptomDisclosure } = await runConversation(scenario, profile, agent, undefined, maxTurns);
  store.updateRun(runId, { status: "evaluating", trace });

  const evaluation = evaluateEscalation(trace, scenario);
  const informationExtractionRate = symptomDisclosure.disclosureRate;

  let validation;
  try {
    validation = await validateConversation(trace, scenario, profile);
  } catch (err) {
    console.error("Validation failed, continuing without it:", err);
  }

  try {
    const { turnAnnotations } = await annotateConversation(trace, scenario, rubric);
    trace.turnAnnotations = turnAnnotations;
    const temporalFeatures = deriveTemporalFeatures(
      turnAnnotations,
      evaluation,
      informationExtractionRate,
    );
    store.updateRun(runId, {
      status: "completed",
      trace,
      evaluation,
      temporalFeatures,
      validation,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Temporal annotation failed, completing without it:", err);
    store.updateRun(runId, {
      status: "completed",
      evaluation,
      validation,
      completedAt: new Date().toISOString(),
    });
  }
}
