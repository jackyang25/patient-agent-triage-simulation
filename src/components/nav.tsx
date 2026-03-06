"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import type { ProviderId } from "@/lib/ai";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function KeySetup() {
  const { provider, apiKey, isConfigured, setCredentials, clearCredentials } = useSession();
  const [open, setOpen] = useState(false);
  const [formProvider, setFormProvider] = useState<ProviderId>(provider ?? "openai");
  const [formKey, setFormKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = formKey.trim();
    if (!key) return;

    setValidating(true);
    setError(null);

    try {
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: formProvider, apiKey: key }),
      });
      const data = await res.json();

      if (!data.valid) {
        setError(data.error ?? "Invalid API key.");
        return;
      }

      setCredentials(formProvider, key);
      setFormKey("");
      setOpen(false);
    } catch {
      setError("Validation request failed.");
    } finally {
      setValidating(false);
    }
  }

  if (!open && isConfigured) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {provider} <code className="bg-muted px-1 rounded text-[10px]">{maskKey(apiKey!)}</code>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          change
        </button>
        <button
          onClick={clearCredentials}
          className="text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
        >
          clear
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Set API Key
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <select
          value={formProvider}
          onChange={(e) => { setFormProvider(e.target.value as ProviderId); setError(null); }}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          disabled={validating}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <input
          type="text"
          placeholder="sk-..."
          value={formKey}
          onChange={(e) => { setFormKey(e.target.value); setError(null); }}
          className="w-44 rounded-md border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
          disabled={validating}
        />
        <Button type="submit" size="sm" disabled={!formKey.trim() || validating}>
          {validating ? "Checking..." : "Save"}
        </Button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setFormKey(""); }}
          className="text-xs text-muted-foreground hover:text-foreground"
          disabled={validating}
        >
          cancel
        </button>
      </form>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

export function Nav() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-primary">PATS</span>
          <span className="text-xs text-muted-foreground font-normal">Patient-Agent Triage Simulation</span>
        </Link>
        <div className="flex items-center gap-6">
          <KeySetup />
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Run</Link>
            <Link href="/history" className="text-muted-foreground hover:text-foreground transition-colors">Results</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
