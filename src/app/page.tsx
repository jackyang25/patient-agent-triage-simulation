"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/session";
import type { ClinicalScenario, CommunicationProfile, Rubric, AdapterType, AdapterConfig } from "@/lib/types";
import { PromptPreview } from "@/components/prompt-preview";

export default function ScenariosPage() {
  const router = useRouter();
  const { isConfigured } = useSession();
  const [scenarios, setScenarios] = useState<ClinicalScenario[]>([]);
  const [profiles, setProfiles] = useState<CommunicationProfile[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [selectedRubric, setSelectedRubric] = useState<string | null>(null);
  const [adapterType, setAdapterType] = useState<AdapterType>("stub");
  const [httpEndpoint, setHttpEndpoint] = useState("");
  const [httpAuthHeader, setHttpAuthHeader] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchingMatrix, setLaunchingMatrix] = useState(false);

  useEffect(() => {
    apiFetch("/api/scenarios")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load scenarios: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setScenarios(data.scenarios);
        setProfiles(data.profiles);
        setRubrics(data.rubrics);
        if (data.rubrics.length === 1) {
          setSelectedRubric(data.rubrics[0].id);
        }
      })
      .catch((err) => console.error("Failed to load scenarios:", err));
  }, []);

  function buildAdapterConfig(): AdapterConfig {
    if (adapterType === "http") {
      return {
        type: "http",
        endpoint: httpEndpoint,
        ...(httpAuthHeader ? { headers: { Authorization: httpAuthHeader } } : {}),
      };
    }
    return { type: "stub" };
  }

  async function handleLaunch() {
    if (!selectedScenario || !selectedProfile) return;
    if (adapterType === "http" && !httpEndpoint) return;
    setLaunching(true);
    try {
      const res = await apiFetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: selectedScenario,
          profileId: selectedProfile,
          rubricId: selectedRubric,
          adapterConfig: buildAdapterConfig(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Simulation launch failed");
      }
      const data = await res.json();
      router.push(`/results/${data.id}`);
    } catch (err) {
      console.error("Launch failed:", err);
    } finally {
      setLaunching(false);
    }
  }

  async function handleLaunchMatrix() {
    if (adapterType === "http" && !httpEndpoint) return;
    setLaunchingMatrix(true);
    try {
      const res = await apiFetch("/api/simulate/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubricId: selectedRubric,
          adapterConfig: buildAdapterConfig(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Matrix launch failed");
      }
      router.push("/history");
    } finally {
      setLaunchingMatrix(false);
    }
  }

  const selectedScenarioObj = scenarios.find((sc) => sc.id === selectedScenario) ?? null;
  const selectedProfileObj = profiles.find((p) => p.id === selectedProfile) ?? null;
  const selectedRubricObj = rubrics.find((r) => r.id === selectedRubric) ?? null;

  const canLaunch = isConfigured && selectedScenario && selectedProfile && selectedRubric && (adapterType === "stub" || httpEndpoint);
  const canLaunchMatrix = isConfigured && selectedRubric && (adapterType === "stub" || httpEndpoint);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run Simulation</h1>
        <p className="text-muted-foreground mt-1">
          Pick a clinical scenario and communication profile, then run against an agent.
        </p>
      </div>

      {/* Clinical Scenarios */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Clinical Scenario
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => (
            <Card
              key={s.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${selectedScenario === s.id ? "border-primary ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedScenario(s.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{s.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {s.prevalence != null && (
                      <span className="text-[10px] text-muted-foreground">{(s.prevalence * 100).toFixed(0)}%</span>
                    )}
                    <Badge variant={s.shouldEscalate ? "destructive" : "secondary"}>
                      {s.shouldEscalate ? "should escalate" : "in scope"}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-xs">{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {s.symptoms.map((sym) => (
                    <Badge key={sym} variant="outline" className="text-[10px]">
                      {sym}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Communication Profiles */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Communication Profile
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${selectedProfile === p.id ? "border-primary ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedProfile(p.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  {p.prevalence != null && (
                    <span className="text-[10px] text-muted-foreground">{(p.prevalence * 100).toFixed(0)}% of patients</span>
                  )}
                </div>
                <CardDescription className="text-xs">{p.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-[10px] text-muted-foreground space-y-0.5">
                  {p.behaviorRules.slice(0, 3).map((r, i) => (
                    <li key={i} className="truncate">{r}</li>
                  ))}
                  {p.behaviorRules.length > 3 && (
                    <li>+{p.behaviorRules.length - 3} more rules</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Evaluation Rubric */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Evaluation Rubric
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rubrics.map((r) => (
            <Card
              key={r.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${selectedRubric === r.id ? "border-primary ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedRubric(r.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{r.name}</CardTitle>
                <CardDescription className="text-xs">
                  {r.signals.length} signals: {r.signals.map((s) => s.id).join(", ")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {r.signals.map((s) => (
                    <Badge
                      key={s.id}
                      variant={s.direction === 1 ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {s.direction === 1 ? "+" : "-"} {s.id}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Prompt Preview */}
      <PromptPreview
        scenario={selectedScenarioObj}
        profile={selectedProfileObj}
        rubric={selectedRubricObj}
      />

      {/* Agent Under Test */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Agent Under Test
        </h2>
        <div className="flex gap-2">
          <Button
            variant={adapterType === "stub" ? "default" : "outline"}
            size="sm"
            onClick={() => setAdapterType("stub")}
          >
            Demo Agent
          </Button>
          <Button
            variant={adapterType === "http" ? "default" : "outline"}
            size="sm"
            onClick={() => setAdapterType("http")}
          >
            HTTP Agent
          </Button>
        </div>

        {adapterType === "stub" && (
          <p className="text-xs text-muted-foreground">
            Built-in demo agent served at <code className="text-[11px] bg-muted px-1 rounded">/api/agents/stub</code>. Uses the same HTTP interface as external agents. Escalates via an escalateToProvider tool when it judges the patient needs human attention.
          </p>
        )}

        {adapterType === "http" && (
          <div className="space-y-3 max-w-lg">
            <p className="text-xs text-muted-foreground">
              Connect to your agent via HTTP. Escalation is detected from response content or an explicit &quot;escalated&quot; flag.
            </p>
            <div className="space-y-1">
              <label htmlFor="endpoint" className="text-xs font-medium">
                Agent Endpoint
              </label>
              <input
                id="endpoint"
                type="url"
                placeholder="https://your-agent.example.com/chat"
                value={httpEndpoint}
                onChange={(e) => setHttpEndpoint(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="auth" className="text-xs font-medium">
                Authorization Header
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </label>
              <input
                id="auth"
                type="text"
                placeholder="Bearer sk-..."
                value={httpAuthHeader}
                onChange={(e) => setHttpAuthHeader(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4 pt-4 border-t border-border">
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            disabled={!canLaunch || launching || launchingMatrix}
            onClick={handleLaunch}
          >
            {launching ? "Launching..." : "Run Single"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={!canLaunchMatrix || launching || launchingMatrix}
            onClick={handleLaunchMatrix}
          >
            {launchingMatrix ? "Launching matrix..." : `Run Full Matrix (${scenarios.length} × ${profiles.length})`}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {!isConfigured
            ? "Set your API key in the nav bar to enable simulations."
            : !canLaunch && (!selectedScenario || !selectedProfile)
              ? "Select a scenario and profile for a single run, or run the full matrix across all combinations."
              : !canLaunch && adapterType === "http"
                ? "Enter the agent endpoint URL."
                : canLaunchMatrix
                  ? `Full matrix runs all ${scenarios.length * profiles.length} scenario × profile combinations and shows aggregate results.`
                  : ""}
        </p>
      </div>
    </div>
  );
}
