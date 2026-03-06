# Patient-Agent Triage Simulation (PATS)

Temporal behavioral evaluation for patient-facing health agents. Tracks how escalation decisions unfold across multi-turn conversations with varied patient communication styles.

See `AGENTS.md` for the full design document.

## Quick Start

```bash
npm install

# Set your API key in .env.local
cp .env.local.example .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker compose up --build
```

## Architecture

```
lib/
  types.ts              — shared type definitions
  scenarios.ts          — clinical scenario library
  profiles.ts           — communication profile library
  rubrics.ts            — escalation rubric definitions
  ai.ts                 — multi-provider LLM setup (OpenAI, Anthropic)
  store.ts              — file-backed simulation run storage
  constants.ts          — UI display constants
  simulator/
    patient.ts          — LLM patient simulator driven by scenario + profile
    agent.ts            — built-in stub agent with tool-based escalation
    adapter.ts          — agent adapter interface
    http-adapter.ts     — HTTP adapter for external agents
    factory.ts          — adapter creation and config validation
    runner.ts           — turn-by-turn conversation orchestrator
    tracker.ts          — deterministic symptom disclosure tracking
    evaluator.ts        — rule-based binary escalation evaluation
    validator.ts        — post-conversation LLM validation
    annotator.ts        — rubric-driven LLM turn annotation
    temporal.ts         — temporal feature derivation from annotations
    pipeline.ts         — full simulation pipeline orchestrator
  stats/
    types.ts            — statistical output type definitions
    engine.ts           — pure-computation stats engine
    index.ts            — public exports
```

## API

- `GET /api/scenarios` — list scenarios, profiles, and rubrics
- `POST /api/simulate` — run a single simulation (scenario + profile + rubric)
- `POST /api/simulate/matrix` — run all scenario x profile combinations
- `GET /api/results/:id` — get simulation status and results
- `GET /api/runs` — list all simulation runs
- `DELETE /api/runs` — clear all runs
- `GET /api/export` — export completed runs as flat JSON

## Configuration

Set in `.env.local`:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_PROVIDER` | Which provider to use: `openai` or `anthropic` |
