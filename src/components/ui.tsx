import type { Role } from "@/config/scoring";
import type { Band } from "@/lib/scores";
import type { Stage } from "@/lib/types";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Chip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "emerald" | "rose" | "sky" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-800",
    rose: "bg-rose-50 text-rose-800",
    sky: "bg-sky-50 text-sky-800",
    violet: "bg-violet-50 text-violet-800",
  };
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function RoleChip({ role, inferred }: { role: Role | null; inferred?: boolean }) {
  if (!role) return <span className="text-xs text-slate-400">No role</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
      {role}
      {inferred && <span className="font-normal text-slate-300">· AI picked</span>}
    </span>
  );
}

export function StatusChip({ stage, band, sentKind }: { stage: Stage; band: Band | null; sentKind: "invite" | "rejection" | null }) {
  if (stage === "sent") return <Chip tone="emerald">✓ {sentKind === "invite" ? "Invite" : "Rejection"} sent</Chip>;
  if (stage === "auto_selected") return <Chip tone="emerald">Auto-selected</Chip>;
  if (stage === "auto_rejected") return <Chip tone="rose">Auto-rejected</Chip>;
  if (stage === "review") return <Chip tone="amber">Needs your review</Chip>;
  if (stage === "drafting") return <Chip>Writing drafts…</Chip>;
  if (stage === "invite_pending" || stage === "reject_pending") return <Chip>Scheduled (old)</Chip>;
  if (band) return <Chip>{band.replace("_", "-")}</Chip>;
  return <Chip>Not scored</Chip>;
}

export function Score({ value, size = "md" }: { value: number | null; size?: "md" | "lg" }) {
  return (
    <div className={cx("font-semibold tabular-nums leading-none text-slate-900", size === "lg" ? "text-5xl" : "text-3xl")}>
      {value ?? "–"}
      <span className={cx("font-normal text-slate-400", size === "lg" ? "text-xl" : "text-sm")}>/100</span>
    </div>
  );
}

export function ScoreBar({ value, max, label, muted }: { value: number | null; max: number; label?: string; muted?: boolean }) {
  const pct = value == null ? 0 : Math.round((value / max) * 100);
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-slate-600">{label}</span>
          <span className="shrink-0 font-medium tabular-nums text-slate-900">
            {value ?? "–"}/{max}
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full", muted ? "bg-slate-300" : "bg-teal-600")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-slate-200 bg-white p-4 sm:p-5", className)}>{children}</section>;
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{children}</div>;
}

const IST = "Asia/Kolkata";

export function formatDateTime(iso: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: IST }).format(new Date(iso));
}

export function displayName(c: { full_name: string | null; file_name: string }) {
  return c.full_name || c.file_name.replace(/\.(pdf|docx)$/i, "");
}
