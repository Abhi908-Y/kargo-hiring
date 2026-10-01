"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";

/** Send one candidate's invite or rejection right now. */
export function SendButton(props: { id: string; kind: "invite" | "rejection"; to: string | null; size?: "sm" | "md"; label?: string }) {
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
        {busy ? "Sending…" : (props.label ?? (props.kind === "invite" ? "Approve: send invite" : "Reject: send rejection"))}
      </button>
      {!props.to && <p className="text-xs text-rose-700">No email address. Add one on the candidate page.</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** Take a candidate out of an automatic column and put them in Review. */
export function MoveToReviewButton({ id, size }: { id: string; size?: "sm" | "md" }) {
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
          const res = await fetch(`/api/candidates/${id}/move`, { method: "POST" }).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : {};
          if (!res?.ok) setError(data.error ?? "Couldn't move.");
          setBusy(false);
          router.refresh();
        }}
        className={cx(
          "rounded-lg bg-white font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        )}
      >
        {busy ? "Moving…" : "Move to review"}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** "Send to all" for a whole automatic column. */
export function BulkSendButton({ column, count }: { column: "auto_selected" | "auto_rejected"; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: { name: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invite = column === "auto_selected";
  const what = invite ? "interview invite" : "rejection";

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || count === 0}
        onClick={async () => {
          if (!window.confirm(`Send the ${what} to all ${count} candidate${count === 1 ? "" : "s"} in this column?`)) return;
          setBusy(true);
          setError(null);
          setResult(null);
          const res = await fetch("/api/bulk-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ column }),
          }).catch(() => null);
          const data = res ? await res.json().catch(() => null) : null;
          if (!res?.ok || !data) setError(data?.error ?? "Bulk send failed. Some emails may have gone; check Sent emails.");
          else setResult(data);
          setBusy(false);
          router.refresh();
        }}
        className={cx(
          "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50",
          invite ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
        )}
      >
        {busy ? `Sending ${count}…` : `Send ${invite ? "invites" : "rejections"} to all ${count}`}
      </button>
      {result && (
        <div className="text-sm">
          <p className="text-emerald-700">Sent {result.sent}.</p>
          {result.failed.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-rose-700">
              {result.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
