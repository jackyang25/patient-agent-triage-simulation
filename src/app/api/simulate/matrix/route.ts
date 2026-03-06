import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import { PROFILES, getProfile } from "@/lib/profiles";
import { getRubric } from "@/lib/rubrics";
import { store } from "@/lib/store";
import { executeSimulation } from "@/lib/simulator/pipeline";
import { createAdapter, adapterConfigSchema } from "@/lib/simulator/factory";
import { getSessionId, getModelFromRequest, getAIHeaders } from "@/lib/request-context";
import type { SimulationRun, AdapterConfig, Rubric } from "@/lib/types";

const requestSchema = z.object({
  rubricId: z.string(),
  adapterConfig: adapterConfigSchema,
  maxTurns: z.number().min(4).max(30).optional(),
  concurrency: z.number().min(1).max(10).optional(),
});

interface MatrixContext {
  rubric: Rubric;
  adapterConfig: AdapterConfig;
  baseUrl: string;
  aiHeaders: Record<string, string>;
  sessionId: string;
  model: LanguageModel;
  maxTurns: number | undefined;
}

export async function POST(request: Request) {
  const sessionId = getSessionId(request);
  const model = getModelFromRequest(request);
  const aiHeaders = getAIHeaders(request);

  const body = await request.json();

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rubricId, adapterConfig, maxTurns, concurrency = 3 } = parsed.data;

  const rubric = getRubric(rubricId);
  if (!rubric) {
    return NextResponse.json({ error: `Rubric not found: ${rubricId}` }, { status: 404 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const batchId = uuidv4();
  const runs: SimulationRun[] = [];

  for (const scenario of SCENARIOS) {
    for (const profile of PROFILES) {
      const run: SimulationRun = {
        id: uuidv4(),
        scenarioId: scenario.id,
        profileId: profile.id,
        rubricId,
        adapterConfig,
        status: "pending",
        startedAt: new Date().toISOString(),
        batchId,
      };
      store.saveRun(sessionId, run);
      runs.push(run);
    }
  }

  const ctx: MatrixContext = { rubric, adapterConfig, baseUrl, aiHeaders, sessionId, model, maxTurns };
  runMatrix(runs, ctx, concurrency).catch((err) => {
    console.error("Matrix run failed:", err);
  });

  return NextResponse.json(
    {
      batchId,
      totalRuns: runs.length,
      runIds: runs.map((r) => r.id),
    },
    { status: 201 },
  );
}

async function runMatrix(runs: SimulationRun[], ctx: MatrixContext, concurrency: number) {
  const queue = [...runs];

  async function worker() {
    while (queue.length > 0) {
      const run = queue.shift();
      if (!run) break;
      await runSingle(run, ctx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
}

async function runSingle(run: SimulationRun, ctx: MatrixContext) {
  const { rubric, adapterConfig, baseUrl, aiHeaders, sessionId, model, maxTurns } = ctx;

  const scenario = getScenario(run.scenarioId);
  const profile = getProfile(run.profileId);
  if (!scenario || !profile) {
    store.updateRun(sessionId, run.id, {
      status: "failed",
      error: `Scenario or profile not found: ${run.scenarioId} / ${run.profileId}`,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    store.updateRun(sessionId, run.id, { status: "simulating" });
    const agent = createAdapter(adapterConfig, baseUrl, aiHeaders);
    await executeSimulation(run.id, scenario, profile, rubric, agent, {
      sessionId, model, maxTurns,
    });
  } catch (err) {
    store.updateRun(sessionId, run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  }
}
