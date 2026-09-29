import Link from "next/link";
import { CandidateCard } from "@/components/CandidateCard";
import { DraftRefresher, ScoreButton } from "@/components/PipelineButtons";
import { Card, EmptyState, PageHeader, cx, displayName } from "@/components/ui";
import { ROLE_TITLES, type Role } from "@/config/scoring";
import { isCalendarPlaceholder } from "@/lib/emails/templates";
import { configWarnings, env } from "@/lib/env";
import { currentRanking, staleDrafts } from "@/lib/pipeline";
import { desiredDraftKind } from "@/lib/ranking";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Dashboard · Kargo Hiring" };

const STATUS = [
  { value: "to_send", label: "To send" },
  { value: "sent", label: "Sent" },
  { value: "all", label: "All" },
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ role?: string; status?: string }> }) {
  const params = await searchParams;
  const role: Role = params.role === "SPM" ? "SPM" : "PM";
  const status = STATUS.find((s) => s.value === params.status)?.value ?? "to_send";

  const [{ ranking, candidates }, settings] = await Promise.all([currentRanking(), getSettings()]);
  const stale = staleDrafts(candidates, ranking).length;
  const unscored = candidates.filter((c) => c.stage === "processing");
  const scored = candidates.filter((c) => c.stage !== "processing");
  const inRole = (r: Role) => scored.filter((c) => c.assigned_role === r);

  const list = inRole(role)
    .filter((c) => (status === "all" ? true : status === "sent" ? c.stage === "sent" : c.stage === "scored"))
    .sort((a, b) => (ranking.rank.get(a.id) ?? 999) - (ranking.rank.get(b.id) ?? 999));

  const warnings = configWarnings();
  if (isCalendarPlaceholder(settings.calendarLink))
    warnings.push(
      env.testMode()
        ? "The interview calendar link is still the {calendar_link} placeholder. Set it in Settings before going live."
        : "Set the interview calendar link in Settings. Invites can't be sent until you do.",
    );

  const href = (r: Role, s: string) => `/?role=${r}${s === "to_send" ? "" : `&status=${s}`}`;
  const stats = [
    { label: "CVs uploaded", value: candidates.length },
    { label: "Invites to send", value: scored.filter((c) => c.stage === "scored" && c.draft_kind === "invite").length },
    { label: "Rejections to send", value: scored.filter((c) => c.stage === "scored" && c.draft_kind === "rejection").length },
    { label: "Sent", value: scored.filter((c) => c.stage === "sent").length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidates"
        subtitle={`Ranked by score within each role. The top ${settings.topN} per role get an interview brief and an invite draft; everyone else gets a rejection draft. Nothing is sent until you click Confirm.`}
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
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-3xl font-semibold tabular-nums text-slate-900">{s.value}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {stale > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-teal-200 bg-teal-50/50">
          <p className="text-sm text-slate-800">
            {stale} candidate{stale === 1 ? "" : "s"} need{stale === 1 ? "s" : ""} a new brief or email draft (new uploads or a change in the top {settings.topN}).
          </p>
          <DraftRefresher stale={stale} />
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
              href={href(r, status)}
              className={cx("rounded-lg px-4 py-1.5 text-sm font-medium", r === role ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {ROLE_TITLES[r]} <span className="tabular-nums text-slate-400">{inRole(r).length}</span>
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          {STATUS.map((s) => (
            <Link
              key={s.value}
              href={href(role, s.value)}
              className={cx(
                "rounded-full px-3 py-1 text-sm",
                s.value === status ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {s.label}
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
            <CandidateCard
              key={c.id}
              c={c}
              role={role}
              rank={ranking.rank.get(c.id) ?? null}
              isTop={ranking.top.has(c.id)}
              desiredKind={desiredDraftKind(c.id, ranking)}
              calendarLink={settings.calendarLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}
