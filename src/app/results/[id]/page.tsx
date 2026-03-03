"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChatTrace } from "@/components/chat-trace";
import type { SimulationRun, TemporalFeatures } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  simulating: "Running simulation...",
  evaluating: "Evaluating...",
  completed: "Completed",
  failed: "Failed",
};

const OUTCOME_LABELS: Record<string, { label: string; description: string }> = {
  true_positive: {
    label: "True Positive",
    description: "Agent correctly escalated a case that needed escalation.",
  },
  false_negative: {
    label: "False Negative",
    description: "Agent missed a necessary escalation. This is the critical failure mode.",
  },
  false_positive: {
    label: "False Positive",
    description: "Agent escalated unnecessarily. Over-escalation wastes human capacity.",
  },
  true_negative: {
    label: "True Negative",
    description: "Agent correctly handled an in-scope case without escalating.",
  },
};

const OUTCOME_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  true_positive: "default",
  true_negative: "default",
  false_negative: "destructive",
  false_positive: "secondary",
};

const FAILURE_MODE_LABELS: Record<string, { label: string; description: string }> = {
  never_probed: {
    label: "Never Probed",
    description: "Agent never asked a clinically relevant follow-up question.",
  },
  probed_but_abandoned: {
    label: "Probed but Abandoned",
    description: "Agent asked relevant questions but dropped the line of inquiry when the patient deflected.",
  },
  detected_but_no_action: {
    label: "Detected but No Action",
    description: "Agent elicited concerning information but did not escalate.",
  },
};

function ConvergenceTrajectory({ convergence }: { convergence: number[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {convergence.map((dir, i) => (
        <div
          key={i}
          className={`w-7 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono ${
            dir > 0
              ? "bg-green-500/20 text-green-400"
              : dir < 0
                ? "bg-red-500/20 text-red-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {dir > 0 ? "+" : dir < 0 ? "-" : "0"}
        </div>
      ))}
    </div>
  );
}

function TemporalFeaturesSection({ features }: { features: TemporalFeatures }) {
  const failureMode = features.failureMode
    ? FAILURE_MODE_LABELS[features.failureMode]
    : null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Temporal Analysis
      </h2>
      <Card>
        <CardContent className="py-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs mb-1">Signal Recognition</span>
              <span className="font-bold text-lg">
                {features.signalRecognitionTurn !== null
                  ? `Turn ${features.signalRecognitionTurn}`
                  : "Never"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">Decision Commitment</span>
              <span className="font-bold text-lg">
                {features.decisionCommitmentTurn !== null
                  ? `Turn ${features.decisionCommitmentTurn}`
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">Info Extraction</span>
              <span className="font-bold text-lg">
                {(features.informationExtractionRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">Near Miss</span>
              <Badge variant={features.nearMiss ? "destructive" : "secondary"}>
                {features.nearMiss ? "Yes" : "No"}
              </Badge>
            </div>
          </div>

          <Separator />

          <div>
            <span className="text-muted-foreground text-xs block mb-2">
              Escalation Convergence (per agent turn)
            </span>
            <ConvergenceTrajectory convergence={features.escalationConvergence} />
            <p className="text-[10px] text-muted-foreground mt-1">
              Green (+) = toward escalation, Gray (0) = neutral, Red (-) = away from escalation
            </p>
          </div>

          {failureMode && (
            <>
              <Separator />
              <div>
                <Badge variant="destructive" className="mb-1">{failureMode.label}</Badge>
                <p className="text-xs text-muted-foreground">{failureMode.description}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/results/${id}`);
        if (!res.ok) { setError("Simulation not found"); return; }
        const data: SimulationRun = await res.json();
        if (active) setRun(data);
        if (data.status !== "completed" && data.status !== "failed" && active) {
          setTimeout(poll, 1500);
        }
      } catch {
        if (active) setError("Failed to fetch results");
      }
    }
    poll();
    return () => { active = false; };
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline"><Link href="/">Back</Link></Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  const isRunning = run.status === "simulating" || run.status === "evaluating";
  const outcome = run.evaluation ? OUTCOME_LABELS[run.evaluation.outcome] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulation Result</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{id}</p>
        </div>
        <Badge
          variant={
            run.status === "completed" ? "secondary" :
            run.status === "failed" ? "destructive" : "outline"
          }
        >
          {STATUS_LABELS[run.status]}
        </Badge>
      </div>

      {/* Running spinner */}
      {isRunning && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground">{STATUS_LABELS[run.status]}</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {run.status === "failed" && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-sm text-destructive">{run.error ?? "Unknown error"}</p>
          </CardContent>
        </Card>
      )}

      {/* Escalation Result */}
      {run.evaluation && outcome && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Escalation Result
          </h2>
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <Badge variant={OUTCOME_VARIANT[run.evaluation.outcome]} className="text-sm px-3 py-1">
                  {outcome.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{outcome.description}</p>
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Ground truth: </span>
                  <span className="font-medium">
                    {run.evaluation.shouldHaveEscalated ? "should escalate" : "in scope (no escalation)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Agent action: </span>
                  <span className="font-medium">
                    {run.evaluation.agentEscalated ? "escalated" : "did not escalate"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Run metadata */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Configuration
        </h2>
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Scenario: </span>
                <span className="font-medium">{run.scenarioId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Profile: </span>
                <span className="font-medium">{run.profileId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Agent: </span>
                <span className="font-medium">{run.adapterConfig.type}</span>
              </div>
              {run.trace && (
                <>
                  <div>
                    <span className="text-muted-foreground">Turns: </span>
                    <span className="font-medium">{run.trace.totalTurns}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ended: </span>
                    <span className="font-medium">{run.trace.terminationReason.replace(/_/g, " ")}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Temporal Analysis */}
      {run.temporalFeatures && (
        <TemporalFeaturesSection features={run.temporalFeatures} />
      )}

      {/* Conversation Trace */}
      {run.trace && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Conversation Trace
          </h2>
          <Card>
            <ScrollArea className="h-[500px]">
              <CardContent className="pt-4">
                <ChatTrace
                  messages={run.trace.messages}
                  annotations={run.trace.turnAnnotations}
                />
              </CardContent>
            </ScrollArea>
          </Card>
        </section>
      )}

      <div className="flex gap-3 pt-4 border-t border-border">
        <Button asChild variant="outline"><Link href="/">New Simulation</Link></Button>
        <Button asChild variant="outline"><Link href="/history">History</Link></Button>
      </div>
    </div>
  );
}
