import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { SimulationRun } from "./types";

const DATA_DIR = join(process.cwd(), ".data");
const RUNS_FILE = join(DATA_DIR, "runs.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromDisk(): Map<string, SimulationRun> {
  ensureDir();
  if (!existsSync(RUNS_FILE)) return new Map();
  try {
    const raw = readFileSync(RUNS_FILE, "utf-8");
    const arr: SimulationRun[] = JSON.parse(raw);
    return new Map(arr.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function saveToDisk(runs: Map<string, SimulationRun>) {
  ensureDir();
  const arr = Array.from(runs.values());
  writeFileSync(RUNS_FILE, JSON.stringify(arr, null, 2));
}

// survive Next.js dev-mode hot reloads by pinning to globalThis
const globalStore = globalThis as unknown as {
  __simulationRuns?: Map<string, SimulationRun>;
};

if (!globalStore.__simulationRuns) {
  globalStore.__simulationRuns = loadFromDisk();
}

const runs = globalStore.__simulationRuns;

export const store = {
  getRun(id: string): SimulationRun | undefined {
    return runs.get(id);
  },

  getAllRuns(): SimulationRun[] {
    return Array.from(runs.values()).sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  },

  saveRun(run: SimulationRun): void {
    runs.set(run.id, run);
    saveToDisk(runs);
  },

  updateRun(id: string, patch: Partial<SimulationRun>): SimulationRun {
    const existing = runs.get(id);
    if (!existing) throw new Error(`Run not found: ${id}`);
    const updated = { ...existing, ...patch };
    runs.set(id, updated);
    saveToDisk(runs);
    return updated;
  },

  clear(): void {
    runs.clear();
    saveToDisk(runs);
  },
};
