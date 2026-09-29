"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Runs steps 2 + 3 (briefs and drafts) one candidate per request until none are left. */
export function DraftRefresher({ stale }: { stale: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; done: number; total: number; error?: string }>({ running: false, done: 0, total: stale });

  async function run() {
    setState({ running: true, done: 0, total: stale });
    let done = 0;
    for (let guard = 0; guard < 500; guard++) {
      const res = await fetch("/api/drafts/refresh", { method: "POST" }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !data) {
        setState((s) => ({ ...s, running: false, error: data?.error ?? "Couldn't update drafts. Try again." }));
        router.refresh();
        return;
      }
      if (!data.drafted) break;
      done++;
      setState({ running: true, done, total: done + data.remaining });
      if (data.remaining === 0) break;
    }
    setState((s) => ({ ...s, running: false }));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={state.running}
        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {state.running ? `Writing drafts… ${state.done}/${state.total}` : "Write drafts now"}
      </button>
      {state.error && <span className="text-xs text-rose-700">{state.error}</span>}
    </div>
  );
}

export function ScoreButton({ id, label = "Score now" }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/candidates/${id}/score`, { method: "POST" }).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : {};
          if (!res?.ok) setError(data.error ?? "Scoring failed.");
          else if (data.scoringError) setError(data.scoringError);
          else await fetch("/api/drafts/refresh", { method: "POST" }).catch(() => null);
          setBusy(false);
          router.refresh();
        }}
        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? "Scoring…" : label}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
