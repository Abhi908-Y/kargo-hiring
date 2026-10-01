"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/config/scoring";

export function SettingsForm({ initial, defaults }: { initial: Settings; defaults: Settings }) {
  const router = useRouter();
  const [s, setS] = useState({
    autoRejectBelow: String(initial.autoRejectBelow),
    autoInviteAbove: String(initial.autoInviteAbove),
    holdHours: String(initial.holdHours),
    calendarLink: initial.calendarLink,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });

  async function post(body: object) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save." });
    const saved = data.settings as Settings;
    setS({ autoRejectBelow: String(saved.autoRejectBelow), autoInviteAbove: String(saved.autoInviteAbove), holdHours: String(saved.holdHours), calendarLink: saved.calendarLink });
    setMsg({ ok: true, text: `Saved. ${data.resorted ?? 0} candidate(s) re-sorted into columns.` });
    router.refresh();
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600";
  const lo = Number(s.autoRejectBelow);
  const hi = Number(s.autoInviteAbove);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        post({ autoRejectBelow: lo, autoInviteAbove: hi, holdHours: Number(s.holdHours), calendarLink: s.calendarLink });
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Auto-reject below</span>
          <input type="number" min={0} max={100} value={s.autoRejectBelow} onChange={set("autoRejectBelow")} className={`${input} tabular-nums`} />
          <span className="mt-1 block text-xs text-slate-500">Score under this goes to the Auto-rejected column. Default {defaults.autoRejectBelow}.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Auto-invite above</span>
          <input type="number" min={0} max={100} value={s.autoInviteAbove} onChange={set("autoInviteAbove")} className={`${input} tabular-nums`} />
          <span className="mt-1 block text-xs text-slate-500">Score over this goes to the Auto-selected column. Default {defaults.autoInviteAbove}.</span>
        </label>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <div className="mb-2 flex h-3 overflow-hidden rounded-full">
          <div className="bg-rose-400" style={{ width: `${Math.max(0, Math.min(100, lo))}%` }} />
          <div className="bg-amber-300" style={{ width: `${Math.max(0, Math.min(100, hi) - Math.max(0, lo))}%` }} />
          <div className="flex-1 bg-emerald-400" />
        </div>
        0–{lo - 1}: <b>Auto-rejected</b> · {lo}–{hi}: <b>Review</b> · {hi + 1}–100: <b>Auto-selected</b>. Nothing is emailed until you click Send.
        <div className="mt-1 text-xs text-slate-500">
          Safety checks put a candidate in Review instead: no email address, unreadable CV, a strong Kargo pattern on an auto-reject (the rubric&apos;s rescue rule), or no calendar link for invites when test mode is off. Saving re-sorts everyone not yet emailed.
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-800">Interview calendar link</span>
        <input type="text" value={s.calendarLink} onChange={set("calendarLink")} placeholder="https://cal.com/arjun/interview" className={input} />
        <span className="mt-1 block text-xs text-slate-500">
          Fills <code>{"{calendar_link}"}</code> in invite emails.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm("Reset thresholds and hold time to the defaults?") && post({ reset: true })}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          Reset to defaults
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
