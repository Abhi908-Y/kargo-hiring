"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/config/scoring";

export function SettingsForm({ initial, defaults }: { initial: Settings; defaults: Settings }) {
  const router = useRouter();
  const [topN, setTopN] = useState(String(initial.topN));
  const [calendarLink, setCalendarLink] = useState(initial.calendarLink);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topN: Number(topN), calendarLink }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save." });
    setMsg({ ok: true, text: "Saved. If the top list changed, use \"Write drafts now\" on the dashboard." });
    router.refresh();
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600";
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block max-w-xs">
        <span className="text-sm font-medium text-slate-800">Top candidates per role</span>
        <input type="number" min={1} max={100} value={topN} onChange={(e) => setTopN(e.target.value)} className={`${input} tabular-nums`} />
        <span className="mt-1 block text-xs text-slate-500">
          These get an interview brief and an invite draft. Everyone else gets a rejection draft. Default {defaults.topN}.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-800">Interview calendar link</span>
        <input type="text" value={calendarLink} onChange={(e) => setCalendarLink(e.target.value)} placeholder="https://cal.com/arjun/interview" className={input} />
        <span className="mt-1 block text-xs text-slate-500">
          Fills <code>{"{calendar_link}"}</code> in invite emails. With test mode off, invites can&apos;t be sent until this is a real link.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Delete all demo data?")) return;
        setBusy(true);
        await fetch("/api/demo/reset", { method: "POST" });
        setBusy(false);
        router.push("/");
        router.refresh();
      }}
      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 disabled:opacity-50"
    >
      {busy ? "Resetting…" : "Reset demo data"}
    </button>
  );
}
