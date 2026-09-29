"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "./ui";

/** Review queue: Arjun sends the invite or the rejection right now. */
export function SendButton(props: { id: string; kind: "invite" | "rejection"; to: string | null; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const what = props.kind === "invite" ? "interview invite" : "rejection";
    if (!window.confirm(`Send the ${what} to ${props.to} now?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${props.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: props.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Something went wrong (${res.status}).`);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={send}
        disabled={busy || !props.to}
        className={cx(
          "rounded-lg font-semibold disabled:opacity-50",
          props.kind === "invite" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50",
          props.size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        )}
      >
        {busy ? "Sending…" : props.kind === "invite" ? "Approve: send invite" : "Reject: send rejection"}
      </button>
      {!props.to && <p className="text-xs text-rose-700">No email address. Add one on the candidate page.</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function timeLeft(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "sending now";
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

/** Automatic email on hold: shows the countdown and cancels it (moves to review). */
export function UndoButton(props: { id: string; kind: "invite" | "rejection"; scheduledFor: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await fetch(`/api/candidates/${props.id}/undo`, { method: "POST" }).catch(() => null);
            const data = res ? await res.json().catch(() => ({})) : {};
            if (!res?.ok) setError(data.error ?? "Couldn't undo.");
            setBusy(false);
            router.refresh();
          }}
          className={cx(
            "rounded-lg bg-slate-900 font-semibold text-white hover:bg-slate-800 disabled:opacity-50",
            props.size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          )}
        >
          {busy ? "Cancelling…" : "Undo"}
        </button>
        <span className="text-xs text-slate-600">
          Automatic {props.kind === "invite" ? "invite" : "rejection"} goes out {now ? timeLeft(props.scheduledFor, now) : ""}
        </span>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
