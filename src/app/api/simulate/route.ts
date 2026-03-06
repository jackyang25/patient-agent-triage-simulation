import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getScenario } from "@/lib/scenarios";
import { getProfile } from "@/lib/profiles";
import { getRubric } from "@/lib/rubrics";
import { store } from "@/lib/store";
import { executeSimulation } from "@/lib/simulator/pipeline";
import { createAdapter, adapterConfigSchema } from "@/lib/simulator/factory";
import { getSessionId, getProviderFromRequest, getAIHeaders, buildRoleModels, modelConfigSchema } from "@/lib/request-context";
import type { SimulationRun, ModelConfig } from "@/lib/types";

const requestSchema = z.object({
  scenarioId: z.string(),
  profileId: z.string(),
  rubricId: z.string(),
  adapterConfig: adapterConfigSchema,
  modelConfig: modelConfigSchema,
  maxTurns: z.number().min(4).max(30).optional(),
});

export async function POST(request: Request) {
  const sessionId = getSessionId(request);
  const { provider, apiKey } = getProviderFromRequest(request);
  const aiHeaders = getAIHeaders(request);

  const body = await request.json();

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { scenarioId, profileId, rubricId, adapterConfig, modelConfig, maxTurns } = parsed.data;

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

  const { patientModel, validatorModel, annotatorModel } = buildRoleModels(provider, apiKey, modelConfig);

  const agentModelId = modelConfig.agent ?? modelConfig.patient;
  const agentHeaders = { ...aiHeaders, "x-ai-model": agentModelId };

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const agent = createAdapter(adapterConfig, baseUrl, agentHeaders);

  const run: SimulationRun = {
    id: uuidv4(),
    scenarioId,
    profileId,
    rubricId,
    adapterConfig,
    modelConfig: modelConfig as ModelConfig,
    status: "simulating",
    startedAt: new Date().toISOString(),
  };
  store.saveRun(sessionId, run);

  executeSimulation(run.id, scenario, profile, rubric, agent, {
    sessionId, patientModel, validatorModel, annotatorModel, maxTurns,
  }).catch((err) => {
    store.updateRun(sessionId, run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  });

  return NextResponse.json({ id: run.id, status: run.status }, { status: 201 });
}
