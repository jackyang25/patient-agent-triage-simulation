import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { SCENARIOS } from "@/lib/scenarios";
import { PROFILES } from "@/lib/profiles";
import { getRubric } from "@/lib/rubrics";
import { store } from "@/lib/store";
import { runConversation } from "@/lib/simulator/runner";
import { evaluateEscalation } from "@/lib/simulator/evaluator";
import { annotateConversation } from "@/lib/simulator/annotator";
import { deriveTemporalFeatures } from "@/lib/simulator/temporal";
import { validateConversation } from "@/lib/simulator/validator";
import { HttpAgentAdapter } from "@/lib/simulator/http-adapter";
import type { AgentAdapter } from "@/lib/simulator/adapter";
import type { SimulationRun, AdapterConfig, Rubric } from "@/lib/types";

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
  rubricId: z.string(),
  adapterConfig: z.union([stubConfigSchema, httpConfigSchema]),
  maxTurns: z.number().min(4).max(30).optional(),
  concurrency: z.number().min(1).max(10).optional(),
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

  const { rubricId, adapterConfig: rawConfig, maxTurns, concurrency = 3 } = parsed.data;
  const adapterConfig = rawConfig as AdapterConfig;

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
      store.saveRun(run);
      runs.push(run);
    }
  }

  runMatrix(runs, rubric, adapterConfig, baseUrl, maxTurns, concurrency).catch((err) => {
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

async function runMatrix(
  runs: SimulationRun[],
  rubric: Rubric,
  adapterConfig: AdapterConfig,
  baseUrl: string,
  maxTurns: number | undefined,
  concurrency: number,
) {
  const queue = [...runs];

  async function worker() {
    while (queue.length > 0) {
      const run = queue.shift();
      if (!run) break;
      await runSingle(run, rubric, adapterConfig, baseUrl, maxTurns);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
}

async function runSingle(
  run: SimulationRun,
  rubric: Rubric,
  adapterConfig: AdapterConfig,
  baseUrl: string,
  maxTurns: number | undefined,
) {
  const scenario = SCENARIOS.find((s) => s.id === run.scenarioId);
  const profile = PROFILES.find((p) => p.id === run.profileId);
  if (!scenario || !profile) {
    store.updateRun(run.id, {
      status: "failed",
      error: `Scenario or profile not found: ${run.scenarioId} / ${run.profileId}`,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    store.updateRun(run.id, { status: "simulating" });
    const agent = createAdapter(adapterConfig, baseUrl);
    const { trace, symptomDisclosure } = await runConversation(scenario, profile, agent, undefined, maxTurns);
    store.updateRun(run.id, { status: "evaluating", trace });

    const evaluation = evaluateEscalation(trace, scenario);
    const informationExtractionRate = symptomDisclosure.disclosureRate;

    let validation;
    try {
      validation = await validateConversation(trace, scenario, profile);
    } catch (validationErr) {
      console.error(`Validation failed for run ${run.id}:`, validationErr);
    }

    try {
      const { turnAnnotations } = await annotateConversation(trace, scenario, rubric);
      trace.turnAnnotations = turnAnnotations;
      const temporalFeatures = deriveTemporalFeatures(
        turnAnnotations,
        evaluation,
        informationExtractionRate,
      );
      store.updateRun(run.id, {
        status: "completed",
        trace,
        evaluation,
        temporalFeatures,
        validation,
        completedAt: new Date().toISOString(),
      });
    } catch (annotationErr) {
      console.error(`Temporal annotation failed for run ${run.id}:`, annotationErr);
      store.updateRun(run.id, {
        status: "completed",
        evaluation,
        validation,
        completedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    store.updateRun(run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  }
}
