import Link from "next/link";
import { CandidateActions } from "@/components/CandidateActions";
import { BandLabel, Card, EmptyState, PageHeader, RoleChip, ScoreBar, TotalScore, displayName } from "@/components/ui";
import { PATTERN_MAX, ROLE_FIT_MAX } from "@/config/scoring";
import { db } from "@/lib/supabase/server";
import type { Candidate } from "@/lib/types";

export const metadata = { title: "Review · Kargo Hiring" };

export default async function ReviewPage() {
  const { data } = await db()
    .from("candidates")
    .select("*")
    .eq("stage", "review")
    .order("total_score", { ascending: false, nullsFirst: true });
  const candidates = (data ?? []) as Candidate[];

  return (
    <div>
      <PageHeader
        title="Review queue"
        subtitle="Borderline, rescued and flagged candidates, highest score first. Approve or Reject sends the email straight away."
      />
      {candidates.length === 0 ? (
        <EmptyState>Nothing to review. Nice.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map((c) => (
            <ReviewCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ c }: { c: Candidate }) {
  const why = c.brief?.why_ranked_here ?? [];
  const probe = c.brief?.what_to_probe?.[0];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/candidates/${c.id}`} className="text-lg font-semibold text-slate-900 hover:underline">
            {displayName(c)}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RoleChip role={c.assigned_role ?? c.tagged_role} inferred={c.role_source === "inferred"} />
            <BandLabel band={c.band} />
            {c.rescued && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700">Rescued</span>}
            {c.role_mismatch && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">Role mismatch</span>}
          </div>
        </div>
        <TotalScore total={c.total_score} band={c.band} />
      </div>

      {c.scoring_error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Scoring failed: {c.scoring_error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ScoreBar label="Pattern" value={c.pattern_score} max={PATTERN_MAX} />
            <ScoreBar label="Role fit" value={c.role_fit_score} max={ROLE_FIT_MAX} />
          </div>
          {c.brief?.who_they_are && <p className="text-sm text-slate-700">{c.brief.who_they_are}</p>}
          {why.length > 0 && (
            <ul className="space-y-1 text-sm text-slate-700">
              {why.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-teal-600">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          {probe && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Probe: </span>
              {probe}
            </p>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">{c.route_reasons.join(" ")}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <CandidateActions id={c.id} stage={c.stage} scheduledFor={c.email_scheduled_for} hasEmail={!!c.email} scoringError={c.scoring_error} />
        <Link href={`/candidates/${c.id}`} className="text-sm font-medium text-teal-700 hover:underline">
          Full details →
        </Link>
      </div>
    </Card>
  );
}
