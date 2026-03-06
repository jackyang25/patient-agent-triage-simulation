# PATS

> Temporal behavioral evaluation for patient-facing health agents.

Tracks how escalation decisions unfold across multi-turn conversations with varied patient communication styles. Not just *whether* the agent gets it right, but *when* it recognizes severity, *how* it converges on a decision, and *why* it fails.

Full design rationale in [`AGENTS.md`](AGENTS.md).

---

## Setup

```bash
npm install
cp .env.local.example .env.local   # add your API key
npm run dev                         # http://localhost:3000
```

Or with Docker:

```bash
docker compose up --build
```

### Environment

| Variable | |
|---|---|
| `AI_PROVIDER` | `openai` or `anthropic` |
| `OPENAI_API_KEY` | Required if using OpenAI |
| `ANTHROPIC_API_KEY` | Required if using Anthropic |

---

## Project structure

```
src/
  app/                  routes + API
  components/           UI
  lib/
    types.ts            shared types
    scenarios.ts        clinical scenarios (human-authored)
    profiles.ts         communication profiles (human-authored)
    rubrics.ts          escalation rubric definitions
    ai.ts               LLM provider setup (OpenAI, Anthropic)
    store.ts            file-backed run storage (.data/)
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

## API

```
GET    /api/scenarios          scenarios, profiles, rubrics
POST   /api/simulate           single run (scenario + profile + rubric)
POST   /api/simulate/matrix    all scenario x profile combinations
GET    /api/results/:id        run status + results
GET    /api/runs               list all runs
DELETE /api/runs               clear all runs
GET    /api/export             completed runs as flat JSON
```

---

## Statistical analysis

All computed in-app. Results appear on the history page after running simulations.

**Layer 1** -- confusion matrix, accuracy, sensitivity, specificity, F1, per-scenario breakdowns, failure heatmap.

**Layer 2** -- temporal summaries by profile (signal recognition turn, commitment turn, info extraction rate), near-miss detection, failure mode classification.

**Layer 3** -- Kaplan-Meier survival curves, Cox proportional hazards (hazard ratios + CIs), change-point detection, mixed-effects variance decomposition.
