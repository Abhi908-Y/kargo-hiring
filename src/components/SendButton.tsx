"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";

/** Arjun's one-click send. Nothing is emailed without this button. */
export function SendButton(props: { id: string; kind: "invite" | "rejection"; to: string | null; disabled?: boolean; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const what = props.kind === "invite" ? "interview invite" : "rejection";
    if (!window.confirm(`Send this ${what} to ${props.to}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${props.id}/send`, { method: "POST" });
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
        disabled={busy || props.disabled || !props.to}
        className={cx(
          "rounded-lg font-semibold text-white disabled:opacity-50",
          props.kind === "invite" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-slate-800",
          props.size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        )}
      >
        {busy ? "Sending…" : props.kind === "invite" ? "Confirm & send invite" : "Confirm & send rejection"}
      </button>
      {!props.to && <p className="text-xs text-rose-700">No email address. Add one on the candidate page.</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
