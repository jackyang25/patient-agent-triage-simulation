# PATS

> Temporal behavioral evaluation for patient-facing health agents.

Tracks how escalation decisions unfold across multi-turn conversations with varied patient communication styles. Not just *whether* the agent gets it right, but *when* it recognizes severity, *how* it converges on a decision, and *why* it fails.

Full design rationale in [`AGENTS.md`](AGENTS.md).

---

## Setup

```bash
npm install
npm run dev   # http://localhost:3000
```

Or with Docker:

```bash
docker compose up --build
```

API keys are entered in the UI (nav bar). Each key is validated before saving. Keys are stored in `sessionStorage` (per-tab, never persisted server-side).

---

## Project structure

```
src/
  app/                  routes + API
  components/           UI
  lib/
    types.ts            shared types
    session.ts          client-side session + credential management
    request-context.ts  server-side header extraction (session, model)
    scenarios.ts        clinical scenarios (human-authored)
    profiles.ts         communication profiles (human-authored)
    rubrics.ts          escalation rubric definitions
    ai.ts               LLM provider setup + key validation
    store.ts            session-scoped in-memory run storage
    simulator/
      patient.ts        LLM patient simulator
      agent.ts          built-in stub agent
      adapter.ts        agent adapter interface
      http-adapter.ts   HTTP adapter for external agents
      factory.ts        adapter creation + validation
      runner.ts         turn-by-turn conversation loop
      tracker.ts        deterministic symptom disclosure tracking
      evaluator.ts      rule-based binary evaluation (Layer 1)
      validator.ts      post-conversation LLM validation
      annotator.ts      rubric-driven LLM turn annotation
      temporal.ts       temporal feature derivation (Layer 2)
      pipeline.ts       orchestrates the full pipeline
    stats/
      engine.ts         all three layers of statistical analysis
      types.ts          statistical output types
```

---

## Session isolation

Each browser tab gets an isolated session. Runs from one tab never appear in another.

- **Session ID** -- random UUID per tab, stored in `sessionStorage`, sent as `X-Session-ID` header on every request.
- **API keys** -- stored in `sessionStorage`, sent as request headers, never persisted on the server.
- **Server store** -- in-memory `Map<sessionId, Map<runId, Run>>`. Abandoned sessions expire after 1 hour. Server restart clears everything.

---

## API

```
POST   /api/config/validate     validate an API key (provider + key)
GET    /api/scenarios            scenarios, profiles, rubrics
POST   /api/simulate             single run (scenario + profile + rubric)
POST   /api/simulate/matrix      all scenario x profile combinations
GET    /api/results/:id          run status + results
GET    /api/runs                 list all runs
DELETE /api/runs                 clear all runs
GET    /api/export               completed runs as flat JSON
```

All routes except `/api/scenarios` and `/api/config/validate` require `X-Session-ID`. Simulation routes also require `X-AI-Provider` and `X-API-Key`.

---

## Statistical analysis

All computed in-app. Results appear on the history page after running simulations.

**Layer 1** -- confusion matrix, accuracy, sensitivity, specificity, F1, per-scenario breakdowns, failure heatmap.

**Layer 2** -- temporal summaries by profile (signal recognition turn, commitment turn, info extraction rate), near-miss detection, failure mode classification.

**Layer 3** -- Kaplan-Meier survival curves, Cox proportional hazards (hazard ratios + CIs), change-point detection, mixed-effects variance decomposition.
