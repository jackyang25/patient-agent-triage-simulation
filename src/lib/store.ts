import type { SimulationRun } from "./types";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionBucket {
  runs: Map<string, SimulationRun>;
  lastAccess: number;
}

const globalStore = globalThis as unknown as {
  __sessions?: Map<string, SessionBucket>;
  __sweepTimer?: ReturnType<typeof setInterval>;
};

if (!globalStore.__sessions) {
  globalStore.__sessions = new Map();
}

if (!globalStore.__sweepTimer) {
  globalStore.__sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of globalStore.__sessions!) {
      if (now - bucket.lastAccess > SESSION_TTL_MS) {
        globalStore.__sessions!.delete(id);
      }
    }
  }, SWEEP_INTERVAL_MS);
}

const sessions = globalStore.__sessions;

function getBucket(sessionId: string): SessionBucket {
  let bucket = sessions.get(sessionId);
  if (!bucket) {
    bucket = { runs: new Map(), lastAccess: Date.now() };
    sessions.set(sessionId, bucket);
  } else {
    bucket.lastAccess = Date.now();
  }
  return bucket;
}

export const store = {
  getRun(sessionId: string, id: string): SimulationRun | undefined {
    return getBucket(sessionId).runs.get(id);
  },

  getAllRuns(sessionId: string): SimulationRun[] {
    return Array.from(getBucket(sessionId).runs.values()).sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  },

  saveRun(sessionId: string, run: SimulationRun): void {
    getBucket(sessionId).runs.set(run.id, run);
  },

  updateRun(sessionId: string, id: string, patch: Partial<SimulationRun>): SimulationRun {
    const bucket = getBucket(sessionId);
    const existing = bucket.runs.get(id);
    if (!existing) throw new Error(`Run not found: ${id}`);
    const updated = { ...existing, ...patch };
    bucket.runs.set(id, updated);
    return updated;
  },

  clear(sessionId: string): void {
    getBucket(sessionId).runs.clear();
  },
};
