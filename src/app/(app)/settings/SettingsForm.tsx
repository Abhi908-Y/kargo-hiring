"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/config/scoring";

export function SettingsForm({ initial, defaults }: { initial: Settings; defaults: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: object) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save." });
    setS(data.settings);
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  const num = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: e.target.value === "" ? "" : Number(e.target.value) });
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums outline-none focus:border-teal-600";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        post(s);
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Auto-reject below" hint={`Total under this is auto-rejected, unless rescued. Default ${defaults.rejectBelow}.`}>
          <input type="number" min={0} max={99} value={s.rejectBelow} onChange={num("rejectBelow")} className={input} />
        </Field>
        <Field label="Auto-shortlist at or above" hint={`Default ${defaults.shortlistAt}. Everything in between goes to review.`}>
          <input type="number" min={1} max={100} value={s.shortlistAt} onChange={num("shortlistAt")} className={input} />
        </Field>
        <Field label="Rescue: pattern score at or above" hint={`Never auto-reject when the pattern score (out of 60) is this high. Default ${defaults.rescuePatternMin}.`}>
          <input type="number" min={0} max={60} value={s.rescuePatternMin} onChange={num("rescuePatternMin")} className={input} />
        </Field>
        <Field label="Hold automatic emails for (hours)" hint={`Undo window before auto emails send. Default ${defaults.holdHours}.`}>
          <input type="number" min={0.25} max={72} step={0.25} value={s.holdHours} onChange={num("holdHours")} className={input} />
        </Field>
      </div>
      <Field label="Interview calendar link" hint="Goes in shortlist emails, e.g. https://cal.com/arjun/interview. Shortlists are held in review until this is a real link (when test mode is off).">
        <input type="text" value={s.calendarLink} onChange={(e) => setS({ ...s, calendarLink: e.target.value })} className={input} placeholder="https://…" />
      </Field>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        With these values: under <b>{s.rejectBelow}</b> auto-reject (unless pattern ≥ <b>{s.rescuePatternMin}</b>), <b>{s.rejectBelow}</b>–<b>{Number(s.shortlistAt) - 1}</b> review,{" "}
        <b>{s.shortlistAt}</b>+ auto-shortlist. Auto emails wait <b>{s.holdHours}h</b>.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm("Reset all thresholds to the rubric defaults?") && post({ reset: true })}
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

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}
