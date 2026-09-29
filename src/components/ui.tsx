import type { Role } from "@/config/scoring";
import type { Band } from "@/lib/routing";
import type { Stage } from "@/lib/types";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const STAGE_STYLES: Record<Stage, { label: string; className: string }> = {
  processing: { label: "Scoring", className: "bg-slate-100 text-slate-700 ring-slate-200" },
  review: { label: "In review", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  reject_pending: { label: "Rejecting · email held", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  shortlist_pending: { label: "Shortlisting · email held", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-800 ring-rose-200" },
  shortlisted: { label: "Shortlisted", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGE_STYLES[stage];
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", s.className)}>
      {s.label}
    </span>
  );
}

const BAND_LABEL: Record<Band, string> = {
  auto_reject: "Score says: reject",
  review: "Score says: review",
  auto_shortlist: "Score says: shortlist",
};

export function BandLabel({ band }: { band: Band | null }) {
  if (!band) return null;
  const color = band === "auto_reject" ? "text-rose-700" : band === "auto_shortlist" ? "text-emerald-700" : "text-amber-700";
  return <span className={cx("text-xs font-medium", color)}>{BAND_LABEL[band]}</span>;
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

export function scoreColor(total: number | null, band: Band | null) {
  if (total == null) return "text-slate-400";
  if (band === "auto_shortlist") return "text-emerald-700";
  if (band === "auto_reject") return "text-rose-700";
  return "text-amber-700";
}

export function TotalScore({ total, band, size = "md" }: { total: number | null; band: Band | null; size?: "md" | "lg" }) {
  return (
    <div className={cx("font-semibold tabular-nums leading-none", scoreColor(total, band), size === "lg" ? "text-5xl" : "text-2xl")}>
      {total ?? "–"}
      <span className={cx("font-normal text-slate-400", size === "lg" ? "text-xl" : "text-sm")}>/100</span>
    </div>
  );
}

export function ScoreBar({ value, max, label, muted }: { value: number | null; max: number; label?: string; muted?: boolean }) {
  const pct = value == null ? 0 : Math.round((value / max) * 100);
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-slate-600">{label}</span>
          <span className="font-medium tabular-nums text-slate-900">
            {value ?? "–"}/{max}
          </span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
    <div className="mb-3 flex items-baseline justify-between gap-3">
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
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
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

export function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: IST }).format(new Date(iso));
}

export function displayName(c: { full_name: string | null; file_name: string }) {
  return c.full_name || c.file_name.replace(/\.(pdf|docx)$/i, "");
}
