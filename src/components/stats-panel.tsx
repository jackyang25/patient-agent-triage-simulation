"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FAILURE_MODES } from "@/lib/constants";
import type {
  StatsResult,
  AccuracyMetrics,
  ScenarioBreakdown,
  FailureHeatmapCell,
  RankedFailure,
  ValidationSummary,
  KMCurve,
  ProfileComparison,
  ProfileTemporalSummary,
} from "@/lib/stats";

const PROFILE_COLORS: Record<string, string> = {
  direct: "#22c55e",
  indirect: "#ef4444",
  vague: "#f59e0b",
  code_switching: "#8b5cf6",
  pushy: "#06b6d4",
};

function fallbackColor(profileId: string): string {
  return PROFILE_COLORS[profileId] ?? "#94a3b8";
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function fmtMeanSd(m: number | null, s: number | null): string {
  if (m === null) return "N/A";
  if (s === null) return m.toFixed(1);
  return `${m.toFixed(1)} \u00B1 ${s.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// 1. Accuracy overview
// ---------------------------------------------------------------------------

function AccuracyCard({ metrics }: { metrics: AccuracyMetrics }) {
  const items = [
    { label: "Accuracy", value: pct(metrics.accuracy) },
    { label: "Sensitivity", value: pct(metrics.sensitivity), sub: "catches escalations" },
    { label: "Specificity", value: pct(metrics.specificity), sub: "avoids false alarms" },
    { label: "F1", value: pct(metrics.f1) },
  ];

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-3">
          Aggregate Accuracy
        </p>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {items.map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-2xl font-semibold">{it.value}</div>
              <div className="text-xs text-muted-foreground">{it.label}</div>
              {it.sub && <div className="text-[10px] text-muted-foreground/60">{it.sub}</div>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs text-center text-muted-foreground">
          <div>TP {metrics.tp}</div>
          <div>FP {metrics.fp}</div>
          <div>FN {metrics.fn}</div>
          <div>TN {metrics.tn}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Per-scenario breakdown
// ---------------------------------------------------------------------------

function ScenarioTable({ breakdowns }: { breakdowns: ScenarioBreakdown[] }) {
  if (breakdowns.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-3">
          Per-Scenario Pass Rate
        </p>
        <div className="space-y-1.5">
          {breakdowns.map((s) => (
            <div key={s.scenarioId} className="flex items-center gap-3 text-sm">
              <Badge
                variant={s.shouldEscalate ? "destructive" : "secondary"}
                className="text-[10px] w-20 justify-center"
              >
                {s.shouldEscalate ? "escalate" : "handle"}
              </Badge>
              <span className="flex-1 font-medium truncate">{s.scenarioId}</span>
              <div className="w-24 bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: pct(s.passRate),
                    backgroundColor: s.passRate >= 0.8 ? "#22c55e" : s.passRate >= 0.5 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <span className="w-16 text-right text-muted-foreground text-xs">
                {pct(s.passRate)} ({s.correct}/{s.total})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Failure heatmap (scenario x profile)
// ---------------------------------------------------------------------------

function FailureHeatmap({ cells }: { cells: FailureHeatmapCell[] }) {
  if (cells.length === 0) return null;

  const scenarios = [...new Set(cells.map((c) => c.scenarioId))];
  const profiles = [...new Set(cells.map((c) => c.profileId))].sort();
  const lookup = new Map(cells.map((c) => [`${c.scenarioId}::${c.profileId}`, c]));

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-1">
          Failure Heatmap (Scenario x Profile)
        </p>
        <p className="text-[10px] text-muted-foreground mb-3">
          Darker = higher failure rate. Hover for details.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                <th className="text-left p-1 text-muted-foreground font-medium">Scenario</th>
                {profiles.map((p) => (
                  <th key={p} className="text-center p-1 font-medium" style={{ color: fallbackColor(p) }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s}>
                  <td className="p-1 truncate max-w-[140px] text-muted-foreground">{s}</td>
                  {profiles.map((p) => {
                    const cell = lookup.get(`${s}::${p}`);
                    if (!cell || cell.total === 0) {
                      return <td key={p} className="p-1 text-center text-muted-foreground/40">-</td>;
                    }
                    const opacity = Math.max(0.05, cell.failureRate);
                    return (
                      <td
                        key={p}
                        className="p-1 text-center"
                        title={`${cell.failures}/${cell.total} failures`}
                      >
                        <div
                          className="rounded px-1.5 py-0.5 mx-auto w-fit"
                          style={{ backgroundColor: `rgba(239, 68, 68, ${opacity})` }}
                        >
                          {cell.failures}/{cell.total}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Ranked worst failures
// ---------------------------------------------------------------------------

function RankedFailuresCard({ failures }: { failures: RankedFailure[] }) {
  if (failures.length === 0) return null;

  const top = failures.slice(0, 5);

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-1">
          Worst Scenario x Profile Combinations
        </p>
        <p className="text-[10px] text-muted-foreground mb-3">
          Ranked by failure rate. These are where the agent struggles most.
        </p>
        <div className="space-y-2">
          {top.map((f, i) => (
            <div key={`${f.scenarioId}-${f.profileId}`} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-muted-foreground text-xs text-right">{i + 1}.</span>
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: fallbackColor(f.profileId) }}
              />
              <span className="flex-1 truncate">
                <span className="font-medium">{f.scenarioId}</span>
                <span className="text-muted-foreground"> / {f.profileId}</span>
              </span>
              <Badge variant="destructive" className="text-[10px]">
                {pct(f.failureRate)} fail
              </Badge>
              <span className="text-xs text-muted-foreground w-12 text-right">
                {f.failures}/{f.total}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Validation summary
// ---------------------------------------------------------------------------

function ValidationCard({ summary }: { summary: ValidationSummary }) {
  if (summary.validated === 0) return null;

  const items = [
    { label: "Coherent", value: summary.coherent, total: summary.validated },
    { label: "On Script", value: summary.onScript, total: summary.validated },
    { label: "Clinically Substantive", value: summary.clinicallySubstantive, total: summary.validated },
  ];

  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-1">
          Conversation Validation
        </p>
        <p className="text-[10px] text-muted-foreground mb-3">
          {summary.validated}/{summary.total} runs validated. {pct(summary.passRate)} passed all checks.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {items.map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-lg font-semibold">
                {it.total > 0 ? pct(it.value / it.total) : "N/A"}
              </div>
              <div className="text-xs text-muted-foreground">{it.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Survival curves (SVG)
// ---------------------------------------------------------------------------

function SurvivalChart({ curves }: { curves: KMCurve[] }) {
  if (curves.length === 0) return null;

  const W = 480;
  const H = 260;
  const PAD = { top: 16, right: 16, bottom: 36, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxTurn = Math.max(
    ...curves.flatMap((c) => c.points.map((p) => p.turn)),
    12,
  );

  const x = (turn: number) => PAD.left + (turn / maxTurn) * plotW;
  const y = (surv: number) => PAD.top + (1 - surv) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg">
      <line
        x1={PAD.left} y1={PAD.top}
        x2={PAD.left} y2={PAD.top + plotH}
        stroke="currentColor" strokeOpacity={0.2}
      />
      <line
        x1={PAD.left} y1={PAD.top + plotH}
        x2={PAD.left + plotW} y2={PAD.top + plotH}
        stroke="currentColor" strokeOpacity={0.2}
      />

      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text key={v} x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
          {(v * 100).toFixed(0)}%
        </text>
      ))}

      {Array.from({ length: Math.min(maxTurn, 12) + 1 }, (_, i) => i)
        .filter((t) => t % 2 === 0)
        .map((t) => (
          <text key={t} x={x(t)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.5}>
            {t}
          </text>
        ))}

      <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.4}>
        Conversation Turns
      </text>

      <line
        x1={PAD.left} y1={y(0.5)}
        x2={PAD.left + plotW} y2={y(0.5)}
        stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4,4"
      />

      {curves.map((curve) => {
        const color = fallbackColor(curve.profileId);
        const pts = curve.points;
        if (pts.length < 2) return null;

        let d = `M ${x(pts[0].turn)} ${y(pts[0].survival)}`;
        for (let i = 1; i < pts.length; i++) {
          d += ` H ${x(pts[i].turn)} V ${y(pts[i].survival)}`;
        }
        d += ` H ${x(maxTurn)}`;

        return (
          <path key={curve.profileId} d={d} fill="none" stroke={color} strokeWidth={2} />
        );
      })}

      {curves.map((curve, i) => (
        <g key={curve.profileId} transform={`translate(${PAD.left + 8}, ${PAD.top + 8 + i * 16})`}>
          <rect width={10} height={10} rx={2} fill={fallbackColor(curve.profileId)} />
          <text x={14} y={9} fontSize={10} fill="currentColor" opacity={0.7}>
            {curve.profileId} (n={curve.n})
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Profile comparisons
// ---------------------------------------------------------------------------

function ComparisonsTable({ comparisons }: { comparisons: ProfileComparison[] }) {
  const meaningful = comparisons.filter((c) => c.medianDiff !== null);
  if (meaningful.length === 0) return null;

  return (
    <div className="text-sm space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium mb-2">
        Time-to-Escalation vs. Baseline ({meaningful[0]?.profileA})
      </p>
      {meaningful.map((c) => (
        <div key={c.profileB} className="flex items-center gap-3">
          <span className="w-28 font-medium">{c.profileB}</span>
          <span className="text-muted-foreground">
            {c.medianDiff! > 0 ? "+" : ""}{c.medianDiff!.toFixed(1)} turns
          </span>
          {c.medianRatio !== null && c.medianRatio > 1 && (
            <Badge variant="outline" className="text-[10px]">
              {c.medianRatio.toFixed(1)}x slower
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile temporal summary (with SD)
// ---------------------------------------------------------------------------

function ProfileSummaryTable({ summaries }: { summaries: ProfileTemporalSummary[] }) {
  const withData = summaries.filter(
    (s) => s.meanSignalRecognition !== null || s.nearMissCount > 0 || s.failureModes.length > 0,
  );
  if (withData.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        <div>Profile</div>
        <div>Signal Turn</div>
        <div>Commit Turn</div>
        <div>Info Extraction</div>
        <div>Near Misses</div>
        <div>Failure Modes</div>
      </div>
      {summaries.map((s) => (
        <div key={s.profileId} className="grid grid-cols-6 gap-2 text-sm items-center">
          <div className="font-medium flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: fallbackColor(s.profileId) }}
            />
            {s.profileId}
            <span className="text-[10px] text-muted-foreground">n={s.n}</span>
          </div>
          <div title="mean \u00B1 SD">{fmtMeanSd(s.meanSignalRecognition, s.sdSignalRecognition)}</div>
          <div title="mean \u00B1 SD">{fmtMeanSd(s.meanCommitmentTurn, s.sdCommitmentTurn)}</div>
          <div title="mean \u00B1 SD">
            {s.meanInfoExtraction !== null
              ? `${(s.meanInfoExtraction * 100).toFixed(0)}%${s.sdInfoExtraction !== null ? ` \u00B1 ${(s.sdInfoExtraction * 100).toFixed(0)}%` : ""}`
              : "N/A"}
          </div>
          <div>
            {s.nearMissCount > 0 ? (
              <Badge variant="outline" className="text-amber-400 text-[10px]">{s.nearMissCount}</Badge>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {s.failureModes.length === 0 ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              s.failureModes.map((fm) => (
                <Badge key={fm.mode} variant="destructive" className="text-[10px]">
                  {fm.count} {FAILURE_MODES[fm.mode].label}
                </Badge>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function StatsPanel({ stats }: { stats: StatsResult }) {
  if (stats.totalRuns === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Statistical Analysis ({stats.totalRuns} runs)
      </h2>

      {/* Accuracy overview — the first thing a builder sees */}
      <AccuracyCard metrics={stats.accuracy} />

      {/* Ranked worst failures */}
      <RankedFailuresCard failures={stats.rankedFailures} />

      {/* Per-scenario breakdown */}
      <ScenarioTable breakdowns={stats.scenarioBreakdowns} />

      {/* Failure heatmap */}
      <FailureHeatmap cells={stats.failureHeatmap} />

      {/* Validation quality */}
      <ValidationCard summary={stats.validationSummary} />

      <Separator />

      {/* Survival curves */}
      {stats.survivalCurves.length > 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-xs text-muted-foreground font-medium mb-3">
              Time-to-Escalation Survival Curves
            </p>
            <p className="text-[10px] text-muted-foreground mb-4">
              For escalate-labeled scenarios: probability the agent has not yet escalated at each turn, by communication profile.
              Curves that drop fast = the agent escalates quickly. Curves that stay high = the agent is slow or never escalates.
            </p>
            <SurvivalChart curves={stats.survivalCurves} />

            {stats.profileComparisons.length > 0 && (
              <>
                <Separator className="my-4" />
                <ComparisonsTable comparisons={stats.profileComparisons} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Temporal summary by profile */}
      {stats.profileSummaries.some((s) => s.meanSignalRecognition !== null) && (
        <Card>
          <CardContent className="py-6">
            <p className="text-xs text-muted-foreground font-medium mb-3">
              Temporal Features by Profile
            </p>
            <p className="text-[10px] text-muted-foreground mb-4">
              Mean \u00B1 SD across conversations. Signal Turn = when the agent first probed.
              Commit Turn = when the agent locked in its decision.
            </p>
            <ProfileSummaryTable summaries={stats.profileSummaries} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
