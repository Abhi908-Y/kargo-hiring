import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { DraftRefresher, ScoreButton } from "@/components/PipelineButtons";
import { Card, EmptyState, PageHeader, cx, displayName } from "@/components/ui";
import { ROLE_TITLES, type Role } from "@/config/scoring";
import { isCalendarPlaceholder } from "@/lib/emails/templates";
import { configWarnings, env } from "@/lib/env";
import { allCandidates, missingDrafts, rankCandidates } from "@/lib/pipeline";
import { getRubric } from "@/lib/rubric";
import { getSettings } from "@/lib/settings";
import type { Candidate } from "@/lib/types";

export const metadata = { title: "Dashboard · Kargo Hiring" };

const FILTERS: { value: string; label: string; match: (c: Candidate) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "selected", label: "Auto-selected", match: (c) => c.stage === "auto_selected" },
  { value: "review", label: "Review", match: (c) => c.stage === "review" || c.stage === "drafting" },
  { value: "rejected", label: "Auto-rejected", match: (c) => c.stage === "auto_rejected" },
  { value: "sent", label: "Sent", match: (c) => c.stage === "sent" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ role?: string; show?: string }> }) {
  const params = await searchParams;
  const role: Role = params.role === "SPM" ? "SPM" : "PM";
  const filter = FILTERS.find((f) => f.value === params.show) ?? FILTERS[0];

  const [candidates, settings, rubric] = await Promise.all([allCandidates(), getSettings(), getRubric()]);
  const names = Object.fromEntries(rubric.filter((r) => r.role === role).map((r) => [r.dimension_key, r.name]));
  const rank = rankCandidates(candidates);
  const missing = candidates.reduce((n, c) => n + missingDrafts(c).length, 0);
  const unscored = candidates.filter((c) => c.stage === "processing");
  const scored = candidates.filter((c) => c.stage !== "processing");
  const inRole = (r: Role) => scored.filter((c) => c.assigned_role === r);
  const list = inRole(role)
    .filter(filter.match)
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));

  const warnings = configWarnings();
  if (isCalendarPlaceholder(settings.calendarLink))
    warnings.push(
      env.testMode()
        ? "The interview calendar link is still the {calendar_link} placeholder. Set it in Settings before going live."
        : "Set the interview calendar link in Settings. Until you do, high scorers go to Review instead of Auto-selected.",
    );

  const stats = [
    { label: "Auto-selected", value: scored.filter((c) => c.stage === "auto_selected").length, href: "/selected" },
    { label: "Waiting for your review", value: scored.filter((c) => c.stage === "review").length, href: "/review" },
    { label: "Auto-rejected", value: scored.filter((c) => c.stage === "auto_rejected").length, href: "/rejected" },
    { label: "Emails sent", value: scored.filter((c) => c.stage === "sent").length, href: `/?role=${role}&show=sent` },
  ];

  const href = (r: Role, show: string) => `/?role=${r}${show === "all" ? "" : `&show=${show}`}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidates"
        subtitle={
          <>
            Ranked by score within each role. Above <b>{settings.autoInviteAbove}</b>: Auto-selected. Below <b>{settings.autoRejectBelow}</b>:
            Auto-rejected. In between: your Review. Nothing is emailed until you click Send (one at a time, or a whole column at once).
          </>
        }
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300">
            <div className="text-3xl font-semibold tabular-nums text-slate-900">{s.value}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
          </Link>
        ))}
      </div>

      {missing > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-teal-200 bg-teal-50/50">
          <p className="text-sm text-slate-800">
            {missing} email draft{missing === 1 ? "" : "s"} still to write. Candidates move into Auto-selected, Review or Auto-rejected once their drafts are ready.
          </p>
          <DraftRefresher stale={missing} />
        </Card>
      )}

      {unscored.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Not scored yet ({unscored.length})</h2>
          <ul className="divide-y divide-slate-100">
            {unscored.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {displayName(c)}
                  </Link>
                  {c.scoring_error && <p className="text-xs text-rose-700">Scoring failed: {c.scoring_error}</p>}
                </div>
                <ScoreButton id={c.id} label={c.scoring_error ? "Retry scoring" : "Score now"} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(["PM", "SPM"] as Role[]).map((r) => (
            <Link
              key={r}
              href={href(r, filter.value)}
              className={cx("rounded-lg px-4 py-1.5 text-sm font-medium", r === role ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {ROLE_TITLES[r]} <span className="tabular-nums text-slate-400">{inRole(r).length}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(role, f.value)}
              className={cx(
                "rounded-full px-3 py-1 text-sm",
                f.value === filter.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState>
          {scored.length === 0 ? (
            <>
              No CVs scored yet. <Link href="/upload" className="font-medium text-teal-700 hover:underline">Upload the first batch</Link>.
            </>
          ) : (
            "No candidates here."
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {list.map((c) => (
            <CandidateCard key={c.id} c={c} role={role} rank={rank.get(c.id) ?? null} calendarLink={settings.calendarLink} names={names} />
          ))}
        </div>
      )}
    </div>
  );
}
