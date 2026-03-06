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
      engine.ts         descriptive stats + KM survival curves
      types.ts          statistical output types
analysis/
  harness.py            Layer 3 inferential statistics (Python)
  requirements.txt      lifelines, statsmodels, ruptures, matplotlib
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

**In-app** (TypeScript, instant) -- confusion matrix, accuracy/sensitivity/specificity/F1, per-scenario breakdowns, failure heatmap, Kaplan-Meier survival curves, profile temporal summaries, near-miss detection, failure mode classification.

**Offline** (Python, rigorous) -- Cox PH with p-values and log-rank tests, mixed-effects models with REML, PELT change-point detection, publication-quality plots.

```bash
pip install -r analysis/requirements.txt
python analysis/harness.py              # app must be running
```

Output goes to `analysis/output/`. The harness fetches from `/api/export`.
