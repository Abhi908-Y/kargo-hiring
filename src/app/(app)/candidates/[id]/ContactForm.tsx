"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContactForm(props: { id: string; fullName: string; email: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(props.fullName);
  const [email, setEmail] = useState(props.email);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = fullName !== props.fullName || email !== props.email;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/candidates/${props.id}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setStatus({ kind: "error", text: data.error ?? "Couldn't save." });
    else {
      setStatus({ kind: "ok", text: "Saved." });
      router.refresh();
    }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600";
  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Name (used in the greeting, &quot;Hi there&quot; if empty)</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={!dirty || busy}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {status && <span className={status.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{status.text}</span>}
      </div>
    </form>
  );
}
