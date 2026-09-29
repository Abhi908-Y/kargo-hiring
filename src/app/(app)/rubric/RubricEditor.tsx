"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

type Role = "PM" | "SPM";

export interface EditorRow {
  dimension_key: string;
  code: string;
  max: number;
  roles: Role[];
  name: string;
  description: string;
  weights: Partial<Record<Role, number>>;
}

export function RubricEditor({ initial }: { initial: EditorRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const sum = (role: Role) => rows.reduce((s, r) => s + (r.roles.includes(role) ? Number(r.weights[role] ?? 0) : 0), 0);
  const sums = { PM: sum("PM"), SPM: sum("SPM") };
  const valid = sums.PM === 100 && sums.SPM === 100;

  const update = (key: string, patch: Partial<EditorRow>) => setRows((prev) => prev.map((r) => (r.dimension_key === key ? { ...r, ...patch } : r)));

  async function post(body: object, okText: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/rubric", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save." });
    setMsg({ ok: true, text: `${okText} ${data.recalculated ?? 0} candidate score${data.recalculated === 1 ? "" : "s"} recalculated.` });
    router.refresh();
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600";

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex gap-4 text-sm">
          {(["PM", "SPM"] as Role[]).map((r) => (
            <span key={r} className={cx("font-semibold tabular-nums", sums[r] === 100 ? "text-emerald-700" : "text-rose-700")}>
              {r} weights: {sums[r]}%{sums[r] !== 100 && ` (must be 100)`}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{msg.text}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm("Reset every criterion's name, description and weights to the original rubric?") && post({ reset: true }, "Reset to the original rubric.")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            Reset to original
          </button>
          <button
            type="button"
            disabled={busy || !dirty || !valid}
            onClick={() =>
              post(
                {
                  criteria: rows.map((r) => ({
                    dimension_key: r.dimension_key,
                    name: r.name,
                    description: r.description,
                    weights: Object.fromEntries(r.roles.map((role) => [role, Number(r.weights[role] ?? 0)])),
                  })),
                },
                "Saved.",
              )
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save rubric"}
          </button>
        </div>
      </div>

      {rows.map((r) => (
        <section key={r.dimension_key} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_14rem]">
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-bold text-white">{r.code}</span>
                <span className="text-xs text-slate-500">
                  {r.roles.length === 2 ? "Used for both roles" : r.roles[0] === "PM" ? "PM bar only" : "Senior PM bar only"} · AI scores it 0–{r.max}
                </span>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Name</span>
                <input value={r.name} onChange={(e) => update(r.dimension_key, { name: e.target.value })} className={`mt-1 ${input}`} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">What a strong candidate looks like (the AI scores against this; keep the 0–{r.max} anchors)</span>
                <textarea value={r.description} onChange={(e) => update(r.dimension_key, { description: e.target.value })} rows={4} className={`mt-1 ${input}`} />
              </label>
            </div>
            <div className="space-y-3">
              {r.roles.map((role) => (
                <label key={role} className="block">
                  <span className="text-xs font-medium text-slate-600">{role === "PM" ? "Product Manager" : "Senior PM"} weight</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={Number(r.weights[role] ?? 0)}
                      onChange={(e) => update(r.dimension_key, { weights: { ...r.weights, [role]: Number(e.target.value) } })}
                      className="flex-1 accent-teal-700"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={r.weights[role] ?? 0}
                      onChange={(e) => update(r.dimension_key, { weights: { ...r.weights, [role]: e.target.value === "" ? 0 : Number(e.target.value) } })}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
