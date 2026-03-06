"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { computeStats, computeWeightedEstimate } from "@/lib/stats";
import type { WeightedEstimate } from "@/lib/stats";
import { StatsPanel } from "@/components/stats-panel";
import { OUTCOME_SHORT, OUTCOME_VARIANT } from "@/lib/constants";
import { apiFetch } from "@/lib/session";
import type { SimulationRun, ClinicalScenario, CommunicationProfile } from "@/lib/types";

// --- Components ---

function ConfusionMatrix({ runs }: { runs: SimulationRun[] }) {
  const completed = runs.filter((r) => r.evaluation);
  const tp = completed.filter((r) => r.evaluation!.outcome === "true_positive").length;
  const fp = completed.filter((r) => r.evaluation!.outcome === "false_positive").length;
  const fn = completed.filter((r) => r.evaluation!.outcome === "false_negative").length;
  const tn = completed.filter((r) => r.evaluation!.outcome === "true_negative").length;
  const total = completed.length;

  if (total === 0) return null;

  const accuracy = total > 0 ? ((tp + tn) / total * 100).toFixed(0) : "0";
  const sensitivity = (tp + fn) > 0 ? (tp / (tp + fn) * 100).toFixed(0) : "N/A";
  const falseNegRate = (tp + fn) > 0 ? (fn / (tp + fn) * 100).toFixed(0) : "N/A";

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground mb-3 font-medium">Unweighted Results (test suite)</p>
        <div className="flex items-start gap-8">
          {/* Matrix */}
          <div>
            <div className="grid grid-cols-3 gap-0 text-center text-xs">
              <div />
              <div className="px-3 py-1 text-muted-foreground font-medium">Escalated</div>
              <div className="px-3 py-1 text-muted-foreground font-medium">Not Esc.</div>

              <div className="px-3 py-2 text-muted-foreground font-medium text-right">Should Esc.</div>
              <div className={`px-3 py-2 font-bold ${tp > 0 ? "text-green-400" : "text-muted-foreground"}`}>{tp}</div>
              <div className={`px-3 py-2 font-bold ${fn > 0 ? "text-red-400" : "text-muted-foreground"}`}>{fn}</div>

              <div className="px-3 py-2 text-muted-foreground font-medium text-right">In Scope</div>
              <div className={`px-3 py-2 font-bold ${fp > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>{fp}</div>
              <div className={`px-3 py-2 font-bold ${tn > 0 ? "text-green-400" : "text-muted-foreground"}`}>{tn}</div>
            </div>
          </div>

          <Separator orientation="vertical" className="h-24" />

          {/* Summary stats */}
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Accuracy: </span>
              <span className="font-bold">{accuracy}%</span>
              <span className="text-muted-foreground text-xs ml-1">({tp + tn}/{total})</span>
            </div>
            <div>
              <span className="text-muted-foreground">Sensitivity: </span>
              <span className="font-bold">{sensitivity}{sensitivity !== "N/A" ? "%" : ""}</span>
              <span className="text-xs text-muted-foreground ml-1">(catches escalations)</span>
            </div>
            <div>
              <span className="text-muted-foreground">Missed escalations: </span>
              <span className={`font-bold ${fn > 0 ? "text-red-400" : ""}`}>{falseNegRate}{falseNegRate !== "N/A" ? "%" : ""}</span>
              <span className="text-xs text-muted-foreground ml-1">({fn} false negatives)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightedEstimateCard({ estimate }: { estimate: WeightedEstimate }) {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground mb-3 font-medium">
          Population-Weighted Estimate
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Estimated missed escalation rate: </span>
            <span className={`font-bold text-lg ${estimate.weightedMissRate > 0 ? "text-red-400" : "text-green-400"}`}>
              ~{estimate.weightedMissRate.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Given your patient population&apos;s estimated communication profile mix and case prevalence,
            the agent would miss approximately {estimate.weightedMissRate.toFixed(1)}% of cases that
            need escalation. Overall weighted error rate: ~{estimate.weightedErrorRate.toFixed(1)}%.
          </p>
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            These estimates are based on prevalence weights set in scenario and profile definitions.
            They are only as accurate as those assumptions. Validate with real conversation logs when available.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileBreakdown({ runs }: { runs: SimulationRun[] }) {
  const completed = runs.filter((r) => r.evaluation);
  if (completed.length === 0) return null;

  const byProfile = new Map<string, SimulationRun[]>();
  for (const r of completed) {
    const list = byProfile.get(r.profileId) ?? [];
    list.push(r);
    byProfile.set(r.profileId, list);
  }

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground mb-3 font-medium">Accuracy by Communication Profile</p>
        <div className="space-y-2">
          {Array.from(byProfile.entries()).map(([profileId, profileRuns]) => {
            const correct = profileRuns.filter(
              (r) => r.evaluation!.outcome === "true_positive" || r.evaluation!.outcome === "true_negative"
            ).length;
            const total = profileRuns.length;
            const pct = ((correct / total) * 100).toFixed(0);
            const fn = profileRuns.filter((r) => r.evaluation!.outcome === "false_negative").length;

            return (
              <div key={profileId} className="flex items-center gap-3 text-sm">
                <span className="w-32 font-medium">{profileId}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${fn > 0 ? "bg-red-400" : "bg-green-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-muted-foreground">{pct}% ({correct}/{total})</span>
                {fn > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{fn} FN</Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function isRunInProgress(run: SimulationRun): boolean {
  return run.status === "pending" || run.status === "simulating" || run.status === "evaluating";
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [scenarios, setScenarios] = useState<ClinicalScenario[]>([]);
  const [profiles, setProfiles] = useState<CommunicationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    const runsData = await apiFetch("/api/runs").then((r) => r.json());
    setRuns(runsData);
    return runsData as SimulationRun[];
  }, []);

  // initial load
  useEffect(() => {
    Promise.all([
      fetchRuns(),
      apiFetch("/api/scenarios").then((r) => r.json()),
    ])
      .then(([, scenarioData]) => {
        setScenarios(scenarioData.scenarios);
        setProfiles(scenarioData.profiles);
      })
      .finally(() => setLoading(false));
  }, [fetchRuns]);

  // poll while any run is still in progress
  useEffect(() => {
    const hasInProgress = runs.some(isRunInProgress);

    if (hasInProgress && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        fetchRuns().then((latest) => {
          const stillRunning = latest.some(isRunInProgress);
          if (!stillRunning && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        });
      }, 2000);
    }

    if (!hasInProgress && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runs, fetchRuns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground animate-pulse">Loading history...</p>
      </div>
    );
  }

  const inProgressCount = runs.filter(isRunInProgress).length;
  const completedCount = runs.filter((r) => r.status === "completed" || r.status === "failed").length;

  const weighted = computeWeightedEstimate(runs, scenarios, profiles);

  async function handleClear() {
    if (!confirm("Clear all simulation runs and results?")) return;
    await apiFetch("/api/runs", { method: "DELETE" });
    setRuns([]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Results</h1>
          <p className="text-muted-foreground mt-1">
            {runs.length} simulation{runs.length !== 1 ? "s" : ""} recorded
            {inProgressCount > 0 && (
              <span className="ml-2 text-primary animate-pulse">
                ({inProgressCount} running, {completedCount} done)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runs.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClear}>
              Clear All
            </Button>
          )}
          <Button asChild><Link href="/">New Simulation</Link></Button>
        </div>
      </div>

      {/* Aggregate view */}
      <ConfusionMatrix runs={runs} />
      {weighted && <WeightedEstimateCard estimate={weighted} />}
      <ProfileBreakdown runs={runs} />
      <StatsPanel stats={computeStats(runs)} />

      {/* Individual runs */}
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No simulations yet. Run one from the home page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Individual Runs
          </h2>
          {runs.map((run) => (
            <Link key={run.id} href={`/results/${run.id}`}>
              <Card className="hover:border-primary/50 transition-all cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium">{run.scenarioId}</p>
                        <p className="text-xs text-muted-foreground">{run.profileId} / {run.adapterConfig.type}</p>
                      </div>
                      <Badge
                        variant={
                          run.status === "completed" ? "secondary" :
                          run.status === "failed" ? "destructive" : "outline"
                        }
                      >
                        {run.status}
                      </Badge>
                      {run.trace && (
                        <span className="text-xs text-muted-foreground">
                          {run.trace.totalTurns} turns
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {run.evaluation && (
                        <Badge variant={OUTCOME_VARIANT[run.evaluation.outcome]}>
                          {OUTCOME_SHORT[run.evaluation.outcome]}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
