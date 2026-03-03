# Simulated Patient Agent Evaluation

Multi-turn behavioral stress testing for patient-facing health agents. Catches escalation failures, scope violations, and action correctness issues that single-turn benchmarks miss.

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key in .env.local
cp .env.local.example .env.local  # or edit .env.local directly

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
# Edit .env.local with your API key, then:
docker compose up --build
```

## Architecture

```
lib/
  types.ts           — shared type definitions
  personas.ts        — pre-built patient persona templates
  environments.ts    — pre-built environment configurations
  ai.ts              — multi-provider LLM setup (OpenAI, Anthropic)
  store.ts           — in-memory simulation run storage
  simulator/
    patient.ts       — LLM patient simulator driven by persona config
    agent.ts         — stub health agent with tool calling
    environment.ts   — service availability, capacity, system failures
    runner.ts        — turn-by-turn conversation orchestrator
    evaluator.ts     — post-conversation structured evaluation
```

## API

- `GET /api/scenarios` — list available personas and environments
- `POST /api/simulate` — start a simulation run
- `GET /api/results/:id` — get simulation status and results (poll for completion)
- `GET /api/runs` — list all simulation runs

## Configuration

Set in `.env.local`:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_PROVIDER` | Which provider to use: `openai` or `anthropic` |
