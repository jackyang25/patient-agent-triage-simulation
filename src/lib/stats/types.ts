/**
 * Typed outputs from the stats engine.
 * Components consume these — never raw SimulationRun[].
 */

// --- Aggregate accuracy ---

export interface AccuracyMetrics {
  accuracy: number;
  /** recall for escalation-worthy cases */
  sensitivity: number;
  /** recall for non-escalation cases */
  specificity: number;
  f1: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  total: number;
}

// --- Per-scenario breakdown ---

export interface ScenarioBreakdown {
  scenarioId: string;
  shouldEscalate: boolean;
  total: number;
  correct: number;
  passRate: number;
}

// --- Scenario x profile cross-tabulation ---

export interface FailureHeatmapCell {
  scenarioId: string;
  profileId: string;
  total: number;
  failures: number;
  failureRate: number;
}

// --- Ranked worst combinations ---

export interface RankedFailure {
  scenarioId: string;
  profileId: string;
  failureRate: number;
  failures: number;
  total: number;
}

// --- Validation summary ---

export interface ValidationSummary {
  total: number;
  validated: number;
  coherent: number;
  onScript: number;
  clinicallySubstantive: number;
  allPassed: number;
  passRate: number;
}

// --- Survival analysis ---

export interface KMPoint {
  turn: number;
  survival: number;
}

export interface KMCurve {
  profileId: string;
  points: KMPoint[];
  medianTurns: number | null;
  n: number;
  events: number;
}

export interface ProfileComparison {
  profileA: string;
  profileB: string;
  medianDiff: number | null;
  /** ratio of median time-to-escalation (B / A). >1 means B is slower. */
  medianRatio: number | null;
}

// --- Temporal summary by profile ---

export interface FailureModeCount {
  mode: "never_probed" | "probed_but_abandoned" | "detected_but_no_action";
  count: number;
}

export interface ProfileTemporalSummary {
  profileId: string;
  n: number;
  meanSignalRecognition: number | null;
  sdSignalRecognition: number | null;
  meanCommitmentTurn: number | null;
  sdCommitmentTurn: number | null;
  meanInfoExtraction: number | null;
  sdInfoExtraction: number | null;
  nearMissCount: number;
  failureModes: FailureModeCount[];
}

// --- Population-weighted estimate ---

export interface WeightedEstimate {
  /** estimated % of real-world escalation cases the agent would miss */
  weightedMissRate: number;
  /** estimated % of all real-world cases the agent gets wrong */
  weightedErrorRate: number;
}

// --- Cox proportional hazards ---

export interface CoxCoefficient {
  profileId: string;
  /** log hazard ratio relative to baseline profile */
  coefficient: number;
  /** exp(coefficient) -- multiplicative effect on escalation rate */
  hazardRatio: number;
  se: number;
  ciLower: number;
  ciUpper: number;
}

export interface CoxResult {
  baselineProfile: string;
  coefficients: CoxCoefficient[];
  n: number;
  events: number;
}

// --- Change-point detection (aggregated by profile) ---

export interface ChangePointSummary {
  profileId: string;
  n: number;
  /** conversations where a meaningful trajectory shift was detected */
  withChangePoint: number;
  /** mean position of change point as fraction of conversation (0-1) */
  meanPosition: number | null;
  sdPosition: number | null;
  meanShiftMagnitude: number | null;
}

// --- Mixed-effects model ---

export interface ProfileFixedEffect {
  profileId: string;
  /** estimated effect on failure probability relative to baseline */
  estimate: number;
  se: number;
}

export interface MixedEffectsResult {
  intercept: number;
  profileEffects: ProfileFixedEffect[];
  baselineProfile: string;
  /** between-scenario variance in failure rates */
  scenarioVariance: number;
  residualVariance: number;
  /** intraclass correlation: proportion of variance from scenario difficulty */
  icc: number;
  n: number;
}

// --- Top-level result ---

export interface StatsResult {
  accuracy: AccuracyMetrics;
  scenarioBreakdowns: ScenarioBreakdown[];
  failureHeatmap: FailureHeatmapCell[];
  rankedFailures: RankedFailure[];
  validationSummary: ValidationSummary;
  survivalCurves: KMCurve[];
  profileComparisons: ProfileComparison[];
  profileSummaries: ProfileTemporalSummary[];
  coxResult: CoxResult | null;
  changePointSummaries: ChangePointSummary[];
  mixedEffects: MixedEffectsResult | null;
  totalRuns: number;
  runsWithTemporal: number;
}
