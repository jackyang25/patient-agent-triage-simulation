/**
 * Pure computation. No side effects, no UI, no network.
 * Takes SimulationRun[] in, returns StatsResult out.
 */

import type { SimulationRun, FailureMode } from "../types";
import type {
  StatsResult,
  AccuracyMetrics,
  ScenarioBreakdown,
  FailureHeatmapCell,
  RankedFailure,
  ValidationSummary,
  KMCurve,
  KMPoint,
  ProfileComparison,
  ProfileTemporalSummary,
  FailureModeCount,
} from "./types";

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sd(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Kaplan-Meier estimator
// ---------------------------------------------------------------------------

interface Observation {
  duration: number;
  event: boolean;
}

function kaplanMeier(obs: Observation[]): KMPoint[] {
  if (obs.length === 0) return [];

  const sorted = [...obs].sort((a, b) => a.duration - b.duration);
  const points: KMPoint[] = [{ turn: 0, survival: 1.0 }];

  let atRisk = sorted.length;
  let survival = 1.0;
  let i = 0;

  while (i < sorted.length) {
    const t = sorted[i].duration;
    let events = 0;
    let censored = 0;

    while (i < sorted.length && sorted[i].duration === t) {
      if (sorted[i].event) events++;
      else censored++;
      i++;
    }

    if (events > 0) {
      survival *= (atRisk - events) / atRisk;
      points.push({ turn: t, survival });
    }

    atRisk -= events + censored;
  }

  return points;
}

function medianFromKM(points: KMPoint[]): number | null {
  for (const p of points) {
    if (p.survival <= 0.5) return p.turn;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Aggregate accuracy
// ---------------------------------------------------------------------------

function computeAccuracy(runs: SimulationRun[]): AccuracyMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of runs) {
    switch (r.evaluation!.outcome) {
      case "true_positive": tp++; break;
      case "false_positive": fp++; break;
      case "true_negative": tn++; break;
      case "false_negative": fn++; break;
    }
  }

  const total = tp + fp + tn + fn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const sensitivity = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const specificity = (tn + fp) > 0 ? tn / (tn + fp) : 0;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
  const f1 = (precision + sensitivity) > 0
    ? 2 * (precision * sensitivity) / (precision + sensitivity)
    : 0;

  return { accuracy, sensitivity, specificity, f1, tp, fp, tn, fn, total };
}

// ---------------------------------------------------------------------------
// 2. Per-scenario breakdown
// ---------------------------------------------------------------------------

function computeScenarioBreakdowns(runs: SimulationRun[]): ScenarioBreakdown[] {
  const byScenario = groupBy(runs, (r) => r.scenarioId);
  const breakdowns: ScenarioBreakdown[] = [];

  for (const [scenarioId, scenarioRuns] of byScenario) {
    const correct = scenarioRuns.filter(
      (r) => r.evaluation!.outcome === "true_positive" || r.evaluation!.outcome === "true_negative",
    ).length;

    breakdowns.push({
      scenarioId,
      shouldEscalate: scenarioRuns[0].evaluation!.shouldHaveEscalated,
      total: scenarioRuns.length,
      correct,
      passRate: scenarioRuns.length > 0 ? correct / scenarioRuns.length : 0,
    });
  }

  return breakdowns.sort((a, b) => a.passRate - b.passRate);
}

// ---------------------------------------------------------------------------
// 3. Scenario x profile failure heatmap
// ---------------------------------------------------------------------------

function computeFailureHeatmap(runs: SimulationRun[]): FailureHeatmapCell[] {
  const byKey = groupBy(runs, (r) => `${r.scenarioId}::${r.profileId}`);
  const cells: FailureHeatmapCell[] = [];

  for (const [key, cellRuns] of byKey) {
    const [scenarioId, profileId] = key.split("::");
    const failures = cellRuns.filter(
      (r) => r.evaluation!.outcome === "false_positive" || r.evaluation!.outcome === "false_negative",
    ).length;

    cells.push({
      scenarioId,
      profileId,
      total: cellRuns.length,
      failures,
      failureRate: cellRuns.length > 0 ? failures / cellRuns.length : 0,
    });
  }

  return cells.sort((a, b) => b.failureRate - a.failureRate);
}

// ---------------------------------------------------------------------------
// 4. Ranked worst failures
// ---------------------------------------------------------------------------

function computeRankedFailures(heatmap: FailureHeatmapCell[]): RankedFailure[] {
  return heatmap
    .filter((c) => c.failures > 0)
    .map((c) => ({
      scenarioId: c.scenarioId,
      profileId: c.profileId,
      failureRate: c.failureRate,
      failures: c.failures,
      total: c.total,
    }))
    .sort((a, b) => b.failureRate - a.failureRate || b.failures - a.failures);
}

// ---------------------------------------------------------------------------
// 5. Validation summary
// ---------------------------------------------------------------------------

function computeValidationSummary(runs: SimulationRun[]): ValidationSummary {
  const withValidation = runs.filter((r) => r.validation);
  const coherent = withValidation.filter((r) => r.validation!.coherent).length;
  const onScript = withValidation.filter((r) => r.validation!.onScript).length;
  const clinicallySubstantive = withValidation.filter((r) => r.validation!.clinicallySubstantive).length;
  const allPassed = withValidation.filter(
    (r) => r.validation!.coherent && r.validation!.onScript && r.validation!.clinicallySubstantive,
  ).length;

  return {
    total: runs.length,
    validated: withValidation.length,
    coherent,
    onScript,
    clinicallySubstantive,
    allPassed,
    passRate: withValidation.length > 0 ? allPassed / withValidation.length : 0,
  };
}

// ---------------------------------------------------------------------------
// Survival curves
// ---------------------------------------------------------------------------

function computeSurvivalCurves(runs: SimulationRun[]): KMCurve[] {
  const escalateRuns = runs.filter((r) => r.evaluation!.shouldHaveEscalated);
  const byProfile = groupBy(escalateRuns, (r) => r.profileId);

  const curves: KMCurve[] = [];

  for (const [profileId, profileRuns] of byProfile) {
    const obs: Observation[] = profileRuns.map((r) => ({
      duration: r.trace?.totalTurns ?? 12,
      event: r.evaluation!.agentEscalated,
    }));

    const points = kaplanMeier(obs);
    curves.push({
      profileId,
      points,
      medianTurns: medianFromKM(points),
      n: obs.length,
      events: obs.filter((o) => o.event).length,
    });
  }

  return curves.sort((a, b) => a.profileId.localeCompare(b.profileId));
}

// ---------------------------------------------------------------------------
// Profile comparisons
// ---------------------------------------------------------------------------

function computeProfileComparisons(runs: SimulationRun[]): ProfileComparison[] {
  const escalateRuns = runs.filter((r) => r.evaluation!.shouldHaveEscalated);
  const byProfile = groupBy(escalateRuns, (r) => r.profileId);
  const profiles = Array.from(byProfile.keys()).sort();

  const medians = new Map<string, number | null>();
  for (const [profileId, profileRuns] of byProfile) {
    const obs: Observation[] = profileRuns.map((r) => ({
      duration: r.trace?.totalTurns ?? 12,
      event: r.evaluation!.agentEscalated,
    }));
    medians.set(profileId, medianFromKM(kaplanMeier(obs)));
  }

  const comparisons: ProfileComparison[] = [];
  if (profiles.length < 2) return comparisons;

  const baseline = profiles[0];
  const baselineMedian = medians.get(baseline) ?? null;

  for (let i = 1; i < profiles.length; i++) {
    const other = profiles[i];
    const otherMedian = medians.get(other) ?? null;

    comparisons.push({
      profileA: baseline,
      profileB: other,
      medianDiff:
        baselineMedian !== null && otherMedian !== null
          ? otherMedian - baselineMedian
          : null,
      medianRatio:
        baselineMedian !== null && otherMedian !== null && baselineMedian > 0
          ? otherMedian / baselineMedian
          : null,
    });
  }

  return comparisons;
}

// ---------------------------------------------------------------------------
// Profile temporal summaries (with SD)
// ---------------------------------------------------------------------------

function computeProfileSummaries(runs: SimulationRun[]): ProfileTemporalSummary[] {
  const byProfile = groupBy(runs, (r) => r.profileId);
  const summaries: ProfileTemporalSummary[] = [];

  for (const [profileId, profileRuns] of byProfile) {
    const withT = profileRuns.filter((r) => r.temporalFeatures);

    const signalTurns = withT
      .map((r) => r.temporalFeatures!.signalRecognitionTurn)
      .filter((t): t is number => t !== null);

    const commitTurns = withT
      .map((r) => r.temporalFeatures!.decisionCommitmentTurn)
      .filter((t): t is number => t !== null);

    const infoRates = withT.map(
      (r) => r.temporalFeatures!.informationExtractionRate,
    );

    const nearMisses = withT.filter((r) => r.temporalFeatures!.nearMiss);

    const modeMap = new Map<FailureMode, number>();
    for (const r of withT) {
      const mode = r.temporalFeatures!.failureMode;
      if (mode) modeMap.set(mode, (modeMap.get(mode) ?? 0) + 1);
    }

    const failureModes: FailureModeCount[] = Array.from(modeMap.entries()).map(
      ([mode, count]) => ({ mode, count }),
    );

    summaries.push({
      profileId,
      n: profileRuns.length,
      meanSignalRecognition: mean(signalTurns),
      sdSignalRecognition: sd(signalTurns),
      meanCommitmentTurn: mean(commitTurns),
      sdCommitmentTurn: sd(commitTurns),
      meanInfoExtraction: mean(infoRates),
      sdInfoExtraction: sd(infoRates),
      nearMissCount: nearMisses.length,
      failureModes,
    });
  }

  return summaries.sort((a, b) => a.profileId.localeCompare(b.profileId));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeStats(runs: SimulationRun[]): StatsResult {
  const completed = runs.filter((r) => r.status === "completed" && r.evaluation);
  const withTemporal = completed.filter((r) => r.temporalFeatures);
  const heatmap = computeFailureHeatmap(completed);

  return {
    accuracy: computeAccuracy(completed),
    scenarioBreakdowns: computeScenarioBreakdowns(completed),
    failureHeatmap: heatmap,
    rankedFailures: computeRankedFailures(heatmap),
    validationSummary: computeValidationSummary(completed),
    survivalCurves: computeSurvivalCurves(completed),
    profileComparisons: computeProfileComparisons(completed),
    profileSummaries: computeProfileSummaries(completed),
    totalRuns: completed.length,
    runsWithTemporal: withTemporal.length,
  };
}
