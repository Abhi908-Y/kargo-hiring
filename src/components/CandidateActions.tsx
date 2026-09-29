"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Stage } from "@/lib/types";
import { cx } from "./ui";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Client-only clock (avoids a server/client mismatch in the countdown).
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

export function timeLeft(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "sending now";
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function CandidateActions(props: {
  id: string;
  stage: Stage;
  scheduledFor: string | null;
  hasEmail: boolean;
  scoringError: string | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: string, url: string, body?: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Something went wrong (${res.status}).`);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn = cx(
    "inline-flex items-center justify-center rounded-lg font-semibold disabled:opacity-50",
    props.size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
  );

  if (props.stage === "review") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            className={cx(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}
            disabled={!!busy || !props.hasEmail}
            onClick={() => call("approve", `/api/candidates/${props.id}/decision`, { action: "approve" }, "Shortlist this candidate? The interview email goes out now.")}
          >
            {busy === "approve" ? "Sending…" : "Approve"}
          </button>
          <button
            className={cx(btn, "bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50")}
            disabled={!!busy || !props.hasEmail}
            onClick={() => call("reject", `/api/candidates/${props.id}/decision`, { action: "reject" }, "Reject this candidate? The rejection email goes out now.")}
          >
            {busy === "reject" ? "Sending…" : "Reject"}
          </button>
          {props.scoringError && (
            <button
              className={cx(btn, "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50")}
              disabled={!!busy}
              onClick={() => call("retry", `/api/candidates/${props.id}/score`)}
            >
              {busy === "retry" ? "Scoring…" : "Retry scoring"}
            </button>
          )}
        </div>
        {!props.hasEmail && <p className="text-xs text-rose-700">No email address found. Add one on the candidate page.</p>}
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if ((props.stage === "reject_pending" || props.stage === "shortlist_pending") && props.scheduledFor) {
    const kind = props.stage === "reject_pending" ? "Rejection" : "Shortlist";
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={cx(btn, "bg-slate-900 text-white hover:bg-slate-800")}
            disabled={!!busy}
            onClick={() => call("undo", `/api/candidates/${props.id}/undo`)}
          >
            {busy === "undo" ? "Cancelling…" : "Undo"}
          </button>
          <span className="text-xs text-slate-600">
            {kind} email {now ? timeLeft(props.scheduledFor, now) : ""}
          </span>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if (props.stage === "processing") {
    return (
      <div className="space-y-2">
        <button
          className={cx(btn, "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50")}
          disabled={!!busy}
          onClick={() => call("retry", `/api/candidates/${props.id}/score`)}
        >
          {busy === "retry" ? "Scoring…" : "Score now"}
        </button>
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  return null;
}
