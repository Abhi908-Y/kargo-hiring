"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CandidateNote } from "@/lib/types";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function Notes({ candidateId, notes }: { candidateId: string; notes: CandidateNote[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/candidates/${candidateId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Couldn't save. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await post({ body: text })) setText("");
        }}
        className="space-y-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write anything about this candidate: likes, dislikes, interview notes, follow-ups…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex items-center gap-3">
          <button
            disabled={busy || !text.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Add note"}
          </button>
          <span className="text-xs text-slate-400">Ctrl+Enter to save</span>
          {error && <span className="text-xs text-rose-700">{error}</span>}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ol className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{fmt(n.created_at)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => window.confirm("Delete this note?") && post({ action: "delete", noteId: n.id })}
                  className="text-slate-400 hover:text-rose-600"
                >
                  Delete
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
