"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DraftEditor(props: { id: string; kind: "invite" | "rejection"; subject: string; body: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = subject !== props.subject || body !== props.body;

  async function post(action: "save" | "regenerate") {
    if (action === "regenerate" && dirty && !window.confirm("Discard your edits and let the AI write this draft again?")) return;
    setBusy(action);
    setMsg(null);
    const res = await fetch(`/api/candidates/${props.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "save" ? { action, kind: props.kind, subject, body } : { action, kind: props.kind }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) return setMsg({ ok: false, text: data.error ?? "Something went wrong." });
    setMsg({ ok: true, text: action === "save" ? "Saved." : "New draft written." });
    router.refresh();
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600";
  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">Edit this draft</summary>
      <div className="space-y-3 border-t border-slate-100 p-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">
            Body. <code>[NAME]</code> becomes the first name and <code>{"{calendar_link}"}</code> your booking link when sent.
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} className={`mt-1 font-sans ${input}`} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!dirty || !!busy}
            onClick={() => post("save")}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => post("regenerate")}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
          >
            {busy === "regenerate" ? "Writing…" : "Rewrite with AI"}
          </button>
          {dirty && <span className="text-xs text-amber-700">Unsaved. Save before sending.</span>}
          {msg && <span className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{msg.text}</span>}
        </div>
      </div>
    </details>
  );
}
