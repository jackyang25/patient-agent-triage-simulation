import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { SCENARIOS } from "@/lib/scenarios";
import { PROFILES } from "@/lib/profiles";

/**
 * Export all completed simulation runs as a flat JSON array
 * for consumption by the statistical harness.
 *
 * GET /api/export
 */
export async function GET() {
  const runs = store.getAllRuns();
  const completed = runs.filter((r) => r.status === "completed" && r.evaluation);

  const scenarioMap = new Map(SCENARIOS.map((s) => [s.id, s]));
  const profileMap = new Map(PROFILES.map((p) => [p.id, p]));

  const rows = completed.map((r) => {
    const scenario = scenarioMap.get(r.scenarioId);
    const profile = profileMap.get(r.profileId);

    return {
      run_id: r.id,
      batch_id: r.batchId ?? null,
      scenario_id: r.scenarioId,
      scenario_name: scenario?.name ?? r.scenarioId,
      should_escalate: r.evaluation!.shouldHaveEscalated,
      scenario_prevalence: scenario?.prevalence ?? null,
      profile_id: r.profileId,
      profile_name: profile?.name ?? r.profileId,
      profile_prevalence: profile?.prevalence ?? null,
      agent_escalated: r.evaluation!.agentEscalated,
      outcome: r.evaluation!.outcome,
      total_turns: r.trace?.totalTurns ?? null,
      termination_reason: r.trace?.terminationReason ?? null,
      // temporal features (null if annotation failed)
      signal_recognition_turn: r.temporalFeatures?.signalRecognitionTurn ?? null,
      escalation_convergence: r.temporalFeatures?.escalationConvergence ?? null,
      information_extraction_rate: r.temporalFeatures?.informationExtractionRate ?? null,
      decision_commitment_turn: r.temporalFeatures?.decisionCommitmentTurn ?? null,
      near_miss: r.temporalFeatures?.nearMiss ?? null,
      failure_mode: r.temporalFeatures?.failureMode ?? null,
    };
  });

  return NextResponse.json(rows);
}
