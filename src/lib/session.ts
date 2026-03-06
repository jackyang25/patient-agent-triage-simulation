"use client";

import type { ProviderId } from "./ai";

const SESSION_ID_KEY = "pats_session_id";
const PROVIDER_KEY = "pats_provider";
const API_KEY_KEY = "pats_api_key";

function generateId(): string {
  return crypto.randomUUID();
}

export function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function getCredentials(): { provider: ProviderId | null; apiKey: string | null } {
  return {
    provider: sessionStorage.getItem(PROVIDER_KEY) as ProviderId | null,
    apiKey: sessionStorage.getItem(API_KEY_KEY),
  };
}

export function setCredentials(provider: ProviderId, apiKey: string): void {
  sessionStorage.setItem(PROVIDER_KEY, provider);
  sessionStorage.setItem(API_KEY_KEY, apiKey);
}

export function clearCredentials(): void {
  sessionStorage.removeItem(PROVIDER_KEY);
  sessionStorage.removeItem(API_KEY_KEY);
}

export function getSessionHeaders(): Record<string, string> {
  const { provider, apiKey } = getCredentials();
  const headers: Record<string, string> = {
    "x-session-id": getSessionId(),
  };
  if (provider) headers["x-ai-provider"] = provider;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const sessionHeaders = getSessionHeaders();
  const merged: RequestInit = {
    ...init,
    headers: {
      ...sessionHeaders,
      ...(init?.headers ?? {}),
    },
  };
  return fetch(url, merged);
}
