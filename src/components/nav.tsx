import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-primary">PATS</span>
          <span className="text-xs text-muted-foreground font-normal">Patient-Agent Triage Simulation</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Run</Link>
          <Link href="/history" className="text-muted-foreground hover:text-foreground transition-colors">Results</Link>
        </nav>
      </div>
    </header>
  );
}
