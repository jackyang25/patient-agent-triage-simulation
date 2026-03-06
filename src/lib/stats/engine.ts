/**
 * Pure computation. No side effects, no UI, no network.
 * Takes SimulationRun[] in, returns StatsResult out.
 */

import type {
  SimulationRun,
  FailureMode,
  ClinicalScenario,
  CommunicationProfile,
} from "../types";
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
  WeightedEstimate,
  CoxResult,
  CoxCoefficient,
  ChangePointSummary,
  MixedEffectsResult,
  ProfileFixedEffect,
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
// Profile comparisons (derived from already-computed survival curves)
// ---------------------------------------------------------------------------

function computeProfileComparisons(curves: KMCurve[]): ProfileComparison[] {
  if (curves.length < 2) return [];

  const sorted = [...curves].sort((a, b) => a.profileId.localeCompare(b.profileId));
  const baseline = sorted[0];

  return sorted.slice(1).map((other) => ({
    profileA: baseline.profileId,
    profileB: other.profileId,
    medianDiff:
      baseline.medianTurns !== null && other.medianTurns !== null
        ? other.medianTurns - baseline.medianTurns
        : null,
    medianRatio:
      baseline.medianTurns !== null && other.medianTurns !== null && baseline.medianTurns > 0
        ? other.medianTurns / baseline.medianTurns
        : null,
  }));
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
// Linear algebra (small matrices for Cox PH)
// ---------------------------------------------------------------------------

function vecDot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;

    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => {
    const id = new Array(n).fill(0);
    id[i] = 1;
    return [...row, ...id];
  });

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;

    const pivot = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let j = 0; j < 2 * n; j++) M[row][j] -= f * M[col][j];
    }
  }

  return M.map((row) => row.slice(n));
}

// ---------------------------------------------------------------------------
// Cox Proportional Hazards (no p-values — requires chi-squared CDF not native to JS)
// ---------------------------------------------------------------------------

interface CoxObs {
  time: number;
  event: boolean;
  x: number[];
  profileId: string;
}

function fitCox(
  obs: CoxObs[],
): { beta: number[]; variance: number[][] } | null {
  const p = obs[0]?.x.length ?? 0;
  if (p === 0 || obs.length === 0) return null;

  const events = obs.filter((o) => o.event);
  if (events.length < 2) return null;

  const eventTimes = [...new Set(events.map((o) => o.time))].sort(
    (a, b) => a - b,
  );

  const beta = new Array(p).fill(0);
  const MAX_ITER = 25;
  const TOL = 1e-9;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const score = new Array(p).fill(0);
    const info: number[][] = Array.from({ length: p }, () =>
      new Array(p).fill(0),
    );

    for (const t of eventTimes) {
      const eventsHere = obs.filter((o) => o.event && o.time === t);
      const d = eventsHere.length;

      let s0 = 0;
      const s1 = new Array(p).fill(0);
      const s2: number[][] = Array.from({ length: p }, () =>
        new Array(p).fill(0),
      );

      for (const o of obs) {
        if (o.time >= t) {
          const w = Math.exp(vecDot(o.x, beta));
          s0 += w;
          for (let j = 0; j < p; j++) {
            s1[j] += o.x[j] * w;
            for (let k = 0; k < p; k++) {
              s2[j][k] += o.x[j] * o.x[k] * w;
            }
          }
        }
      }

      if (s0 === 0) continue;

      for (const e of eventsHere) {
        for (let j = 0; j < p; j++) {
          score[j] += e.x[j] - s1[j] / s0;
        }
      }

      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          info[j][k] += d * (s2[j][k] / s0 - (s1[j] / s0) * (s1[k] / s0));
        }
      }
    }

    const delta = solveLinear(info, score);
    if (!delta) return null;

    let maxDelta = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += delta[j];
      maxDelta = Math.max(maxDelta, Math.abs(delta[j]));
    }

    if (maxDelta < TOL) break;
  }

  const finalInfo: number[][] = Array.from({ length: p }, () =>
    new Array(p).fill(0),
  );
  for (const t of eventTimes) {
    const d = obs.filter((o) => o.event && o.time === t).length;

    let s0 = 0;
    const s1 = new Array(p).fill(0);
    const s2: number[][] = Array.from({ length: p }, () =>
      new Array(p).fill(0),
    );

    for (const o of obs) {
      if (o.time >= t) {
        const w = Math.exp(vecDot(o.x, beta));
        s0 += w;
        for (let j = 0; j < p; j++) {
          s1[j] += o.x[j] * w;
          for (let k = 0; k < p; k++) {
            s2[j][k] += o.x[j] * o.x[k] * w;
          }
        }
      }
    }

    if (s0 === 0) continue;

    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        finalInfo[j][k] +=
          d * (s2[j][k] / s0 - (s1[j] / s0) * (s1[k] / s0));
      }
    }
  }

  const variance = invertMatrix(finalInfo);
  if (!variance) return null;

  return { beta, variance };
}

function computeCoxPH(runs: SimulationRun[]): CoxResult | null {
  const escalateRuns = runs.filter(
    (r) => r.evaluation?.shouldHaveEscalated && r.trace,
  );
  if (escalateRuns.length < 5) return null;

  const profiles = [...new Set(escalateRuns.map((r) => r.profileId))].sort();
  if (profiles.length < 2) return null;

  const baseline = profiles[0];
  const nonBaseline = profiles.slice(1);
  const profileIndex = new Map(nonBaseline.map((p, i) => [p, i]));

  const obs: CoxObs[] = escalateRuns.map((r) => {
    const x = new Array(nonBaseline.length).fill(0);
    const idx = profileIndex.get(r.profileId);
    if (idx !== undefined) x[idx] = 1;
    return {
      time: r.trace!.totalTurns,
      event: r.evaluation!.agentEscalated,
      x,
      profileId: r.profileId,
    };
  });

  const fit = fitCox(obs);
  if (!fit) return null;

  const z95 = 1.96;
  const coefficients: CoxCoefficient[] = nonBaseline.map((profileId, i) => {
    const coef = fit.beta[i];
    const se = Math.sqrt(Math.max(0, fit.variance[i][i]));
    const hr = Math.exp(coef);
    return {
      profileId,
      coefficient: coef,
      hazardRatio: hr,
      se,
      ciLower: Math.exp(coef - z95 * se),
      ciUpper: Math.exp(coef + z95 * se),
    };
  });

  return {
    baselineProfile: baseline,
    coefficients,
    n: obs.length,
    events: obs.filter((o) => o.event).length,
  };
}

// ---------------------------------------------------------------------------
// Change-point detection (binary segmentation)
// ---------------------------------------------------------------------------

interface DetectedCP {
  position: number;
  shiftMagnitude: number;
}

function detectChangePoint(trajectory: number[]): DetectedCP | null {
  if (trajectory.length < 3) return null;

  const n = trajectory.length;
  const totalMean = trajectory.reduce((a, b) => a + b, 0) / n;
  const totalSS = trajectory.reduce(
    (sum, v) => sum + (v - totalMean) ** 2,
    0,
  );

  if (totalSS === 0) return null;

  let bestK = -1;
  let bestReduction = 0;

  for (let k = 1; k < n; k++) {
    const left = trajectory.slice(0, k);
    const right = trajectory.slice(k);

    const leftMean = left.reduce((a, b) => a + b, 0) / left.length;
    const rightMean = right.reduce((a, b) => a + b, 0) / right.length;

    const leftSS = left.reduce((sum, v) => sum + (v - leftMean) ** 2, 0);
    const rightSS = right.reduce((sum, v) => sum + (v - rightMean) ** 2, 0);

    const reduction = totalSS - leftSS - rightSS;
    if (reduction > bestReduction) {
      bestReduction = reduction;
      bestK = k;
    }
  }

  if (bestK < 0 || bestReduction / totalSS < 0.2) return null;

  const leftMean =
    trajectory.slice(0, bestK).reduce((a, b) => a + b, 0) / bestK;
  const rightMean =
    trajectory.slice(bestK).reduce((a, b) => a + b, 0) / (n - bestK);

  return {
    position: bestK / n,
    shiftMagnitude: Math.abs(rightMean - leftMean),
  };
}

function computeChangePointSummaries(
  runs: SimulationRun[],
): ChangePointSummary[] {
  const withTrajectory = runs.filter(
    (r) =>
      r.temporalFeatures &&
      r.temporalFeatures.escalationConvergence.length >= 3,
  );

  const byProfile = groupBy(withTrajectory, (r) => r.profileId);
  const summaries: ChangePointSummary[] = [];

  for (const [profileId, profileRuns] of byProfile) {
    const detected: DetectedCP[] = [];

    for (const r of profileRuns) {
      const cp = detectChangePoint(
        r.temporalFeatures!.escalationConvergence,
      );
      if (cp) detected.push(cp);
    }

    const positions = detected.map((d) => d.position);
    const magnitudes = detected.map((d) => d.shiftMagnitude);

    summaries.push({
      profileId,
      n: profileRuns.length,
      withChangePoint: detected.length,
      meanPosition: mean(positions),
      sdPosition: sd(positions),
      meanShiftMagnitude: mean(magnitudes),
    });
  }

  return summaries.sort((a, b) => a.profileId.localeCompare(b.profileId));
}

// ---------------------------------------------------------------------------
// Mixed-effects model (random intercept for scenario, fixed for profile)
// ---------------------------------------------------------------------------

function computeMixedEffects(
  runs: SimulationRun[],
): MixedEffectsResult | null {
  const completed = runs.filter((r) => r.evaluation);
  if (completed.length < 10) return null;

  const data = completed.map((r) => ({
    scenarioId: r.scenarioId,
    profileId: r.profileId,
    failure:
      r.evaluation!.outcome === "false_negative" ||
      r.evaluation!.outcome === "false_positive"
        ? 1
        : 0,
  }));

  const scenarios = [...new Set(data.map((d) => d.scenarioId))].sort();
  const profiles = [...new Set(data.map((d) => d.profileId))].sort();
  if (scenarios.length < 2 || profiles.length < 2) return null;

  const grandMean =
    data.reduce((sum, d) => sum + d.failure, 0) / data.length;

  const scenarioMeans = new Map<string, number>();
  for (const s of scenarios) {
    const scenarioData = data.filter((d) => d.scenarioId === s);
    scenarioMeans.set(
      s,
      scenarioData.reduce((sum, d) => sum + d.failure, 0) /
        scenarioData.length,
    );
  }

  const profileResiduals = new Map<string, number[]>();
  for (const p of profiles) profileResiduals.set(p, []);

  for (const d of data) {
    const residual = d.failure - scenarioMeans.get(d.scenarioId)!;
    profileResiduals.get(d.profileId)!.push(residual);
  }

  const profileMeanResiduals = new Map<string, number>();
  for (const [p, residuals] of profileResiduals) {
    profileMeanResiduals.set(
      p,
      residuals.length > 0
        ? residuals.reduce((a, b) => a + b, 0) / residuals.length
        : 0,
    );
  }

  const baseline = profiles[0];
  const baselineResidual = profileMeanResiduals.get(baseline) ?? 0;

  const profileEffects: ProfileFixedEffect[] = profiles.slice(1).map((p) => {
    const effect =
      (profileMeanResiduals.get(p) ?? 0) - baselineResidual;
    const residuals = profileResiduals.get(p)!;
    const pMean = profileMeanResiduals.get(p) ?? 0;
    const n = residuals.length;
    const se =
      n > 1
        ? Math.sqrt(
            residuals.reduce((sum, r) => sum + (r - pMean) ** 2, 0) /
              (n * (n - 1)),
          )
        : 0;
    return { profileId: p, estimate: effect, se };
  });

  const scenarioValues = Array.from(scenarioMeans.values());
  const scenarioGrandMean =
    scenarioValues.reduce((a, b) => a + b, 0) / scenarioValues.length;
  const scenarioVariance =
    scenarioValues.length > 1
      ? scenarioValues.reduce(
          (sum, v) => sum + (v - scenarioGrandMean) ** 2,
          0,
        ) /
        (scenarioValues.length - 1)
      : 0;

  let residualSS = 0;
  for (const d of data) {
    const sMean = scenarioMeans.get(d.scenarioId)!;
    const pEffect =
      d.profileId === baseline
        ? 0
        : (profileMeanResiduals.get(d.profileId) ?? 0) - baselineResidual;
    const predicted = sMean + pEffect;
    residualSS += (d.failure - predicted) ** 2;
  }

  const df = Math.max(
    1,
    data.length - profiles.length - scenarios.length + 1,
  );
  const residualVariance = residualSS / df;

  const totalVariance = scenarioVariance + residualVariance;
  const icc = totalVariance > 0 ? scenarioVariance / totalVariance : 0;

  return {
    intercept: grandMean,
    profileEffects,
    baselineProfile: baseline,
    scenarioVariance,
    residualVariance,
    icc,
    n: data.length,
  };
}

// ---------------------------------------------------------------------------
// Population-weighted estimate
// ---------------------------------------------------------------------------

export function computeWeightedEstimate(
  runs: SimulationRun[],
  scenarios: ClinicalScenario[],
  profiles: CommunicationProfile[],
): WeightedEstimate | null {
  const completed = runs.filter((r) => r.evaluation);
  if (completed.length === 0) return null;

  const scenarioMap = new Map(scenarios.map((s) => [s.id, s]));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const hasScenarioWeights = scenarios.some((s) => s.prevalence != null);
  const hasProfileWeights = profiles.some((p) => p.prevalence != null);
  if (!hasScenarioWeights || !hasProfileWeights) return null;

  let weightedErrors = 0;
  let weightedTotal = 0;
  let weightedMisses = 0;
  let weightedEscalationCases = 0;

  for (const run of completed) {
    const scenario = scenarioMap.get(run.scenarioId);
    const profile = profileMap.get(run.profileId);
    if (!scenario || !profile) continue;

    const weight = (scenario.prevalence ?? 0) * (profile.prevalence ?? 0);
    weightedTotal += weight;

    const isError =
      run.evaluation!.outcome === "false_negative" ||
      run.evaluation!.outcome === "false_positive";
    if (isError) weightedErrors += weight;

    if (scenario.shouldEscalate) {
      weightedEscalationCases += weight;
      if (run.evaluation!.outcome === "false_negative") {
        weightedMisses += weight;
      }
    }
  }

  if (weightedTotal === 0) return null;

  return {
    weightedMissRate: weightedEscalationCases > 0
      ? (weightedMisses / weightedEscalationCases) * 100
      : 0,
    weightedErrorRate: (weightedErrors / weightedTotal) * 100,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeStats(runs: SimulationRun[]): StatsResult {
  const completed = runs.filter((r) => r.status === "completed" && r.evaluation);
  const withTemporal = completed.filter((r) => r.temporalFeatures);
  const heatmap = computeFailureHeatmap(completed);
  const survivalCurves = computeSurvivalCurves(completed);

  return {
    accuracy: computeAccuracy(completed),
    scenarioBreakdowns: computeScenarioBreakdowns(completed),
    failureHeatmap: heatmap,
    rankedFailures: computeRankedFailures(heatmap),
    validationSummary: computeValidationSummary(completed),
    survivalCurves,
    profileComparisons: computeProfileComparisons(survivalCurves),
    profileSummaries: computeProfileSummaries(completed),
    coxResult: computeCoxPH(completed),
    changePointSummaries: computeChangePointSummaries(completed),
    mixedEffects: computeMixedEffects(completed),
    totalRuns: completed.length,
    runsWithTemporal: withTemporal.length,
  };
}
