"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ProviderId } from "@/lib/ai";
import {
  getSessionId,
  getCredentials,
  setCredentials as persistCredentials,
  clearCredentials as removeCredentials,
} from "@/lib/session";

interface SessionContextValue {
  sessionId: string;
  provider: ProviderId | null;
  apiKey: string | null;
  isConfigured: boolean;
  hasServerKeys: boolean;
  setCredentials: (provider: ProviderId, apiKey: string) => void;
  clearCredentials: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasServerKeys, setHasServerKeys] = useState(false);

  useEffect(() => {
    setSessionId(getSessionId());
    const creds = getCredentials();
    setProvider(creds.provider);
    setApiKey(creds.apiKey);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setHasServerKeys(data.hasServerKeys))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const handleSetCredentials = useCallback((p: ProviderId, k: string) => {
    persistCredentials(p, k);
    setProvider(p);
    setApiKey(k);
  }, []);

  const handleClearCredentials = useCallback(() => {
    removeCredentials();
    setProvider(null);
    setApiKey(null);
  }, []);

  if (!ready) return null;

  const clientConfigured = !!provider && !!apiKey;

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        provider,
        apiKey,
        isConfigured: clientConfigured || hasServerKeys,
        hasServerKeys,
        setCredentials: handleSetCredentials,
        clearCredentials: handleClearCredentials,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
