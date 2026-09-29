import Link from "next/link";
import { CandidateActions } from "@/components/CandidateActions";
import { Card, EmptyState, PageHeader, RoleChip, SectionTitle, StageBadge, TotalScore, displayName, formatDateTime } from "@/components/ui";
import { isCalendarPlaceholder } from "@/lib/emails/templates";
import { configWarnings, env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/supabase/server";
import type { Candidate, Stage } from "@/lib/types";

export const metadata = { title: "Dashboard · Kargo Hiring" };

export default async function DashboardPage() {
  const [{ data }, settings] = await Promise.all([
    db()
      .from("candidates")
      .select("id, created_at, file_name, full_name, email, stage, band, total_score, assigned_role, role_source, email_scheduled_for, scoring_error")
      .order("created_at", { ascending: false }),
    getSettings(),
  ]);
  const candidates = (data ?? []) as Candidate[];

  const count = (...stages: Stage[]) => candidates.filter((c) => stages.includes(c.stage)).length;
  const pending = candidates
    .filter((c) => c.stage === "reject_pending" || c.stage === "shortlist_pending")
    .sort((a, b) => (a.email_scheduled_for ?? "").localeCompare(b.email_scheduled_for ?? ""));
  const recent = candidates.slice(0, 6);

  const warnings = configWarnings();
  if (isCalendarPlaceholder(settings.calendarLink))
    warnings.push(
      env.testMode()
        ? "The calendar link is still the {calendar_link} placeholder. Set it in Settings before turning test mode off."
        : "The calendar link isn't set, so shortlisted candidates are held in review until you set it in Settings.",
    );

  const tiles = [
    { label: "Waiting for you", value: count("review"), href: "/review", accent: "text-amber-700" },
    { label: "Emails on hold", value: pending.length, href: "#held", accent: "text-slate-900" },
    { label: "Shortlisted", value: count("shortlisted", "shortlist_pending"), href: "/candidates?stage=shortlisted", accent: "text-emerald-700" },
    { label: "Rejected", value: count("rejected", "reject_pending"), href: "/candidates?stage=rejected", accent: "text-rose-700" },
    { label: "Total CVs", value: candidates.length, href: "/candidates", accent: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Where every candidate stands right now."
        actions={
          <Link href="/upload" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Upload CVs
          </Link>
        }
      />

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {warnings.map((w) => (
            <p key={w}>• {w}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300">
            <div className={`text-3xl font-semibold tabular-nums ${t.accent}`}>{t.value}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{t.label}</div>
          </Link>
        ))}
      </div>

      <Card>
        <SectionTitle hint={`Held for ${settings.holdHours}h before sending. Undo moves them to review.`}>
          <span id="held">Emails on hold</span>
        </SectionTitle>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No automatic emails waiting to go out.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {displayName(c)}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StageBadge stage={c.stage} />
                    <RoleChip role={c.assigned_role} />
                    <span className="text-xs tabular-nums text-slate-500">Score {c.total_score}</span>
                  </div>
                </div>
                <CandidateActions id={c.id} stage={c.stage} scheduledFor={c.email_scheduled_for} hasEmail={!!c.email} scoringError={c.scoring_error} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle hint={<Link href="/candidates" className="hover:underline">See all</Link>}>Recent uploads</SectionTitle>
        {recent.length === 0 ? (
          <EmptyState>
            No CVs yet. <Link href="/upload" className="font-medium text-teal-700 hover:underline">Upload the first batch</Link>.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/candidates/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{displayName(c)}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(c.created_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StageBadge stage={c.stage} />
                    <TotalScore total={c.total_score} band={c.band} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
