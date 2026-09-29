import Link from "next/link";
import { dimensionsForRole, type Role } from "@/config/scoring";
import { personalise } from "@/lib/drafting/draft";
import type { DraftKind } from "@/lib/ranking";
import type { Candidate } from "@/lib/types";
import { SendButton } from "./SendButton";
import { Chip, DraftChip, RoleChip, Score, ScoreBar, cx, displayName, formatDateTime } from "./ui";

export function CandidateCard(props: {
  c: Candidate;
  role: Role;
  rank: number | null;
  isTop: boolean;
  desiredKind: DraftKind;
  calendarLink: string;
}) {
  const { c, role, rank, isTop, desiredKind } = props;
  const score = role === "PM" ? c.score_pm : c.score_spm;
  const otherRole: Role = role === "PM" ? "SPM" : "PM";
  const otherScore = role === "PM" ? c.score_spm : c.score_pm;
  const sent = c.stage === "sent";
  const outOfDate = !sent && c.draft_kind && c.draft_kind !== desiredKind;

  return (
    <article className={cx("rounded-2xl border bg-white p-4 sm:p-5", isTop ? "border-emerald-300" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {rank != null && <span className="text-sm font-semibold tabular-nums text-slate-400">#{rank}</span>}
            <Link href={`/candidates/${c.id}`} className="truncate text-lg font-semibold text-slate-900 hover:underline">
              {displayName(c)}
            </Link>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <RoleChip role={c.assigned_role} inferred={c.role_source === "inferred"} />
            {isTop && <Chip tone="emerald">Top {rank}</Chip>}
            <DraftChip kind={c.draft_kind} sent={sent} />
            {!sent && c.draft_kind === "rejection" && c.strong_pattern && (
              <Chip tone="violet">Strong pattern ({c.pattern_score}/60): check before rejecting</Chip>
            )}
            {c.role_mismatch && <Chip tone="sky">May fit {otherRole} better</Chip>}
            {c.flags.includes("location") && <Chip>Outside Mumbai</Chip>}
            {c.flags.includes("low_extraction_confidence") && <Chip tone="amber">CV text may be incomplete</Chip>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Score value={score} />
          <div className="mt-1 text-xs tabular-nums text-slate-500">
            {otherRole} score {otherScore ?? "–"}
          </div>
        </div>
      </div>

      {c.dimension_scores && (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {dimensionsForRole(role).map((d) => (
            <ScoreBar key={d.key} label={`${d.code} ${d.label.replace(/ \((PM|Senior PM) bar\)/, "")}`} value={c.dimension_scores![d.key]?.score ?? 0} max={d.max} />
          ))}
        </div>
      )}

      {c.interview_brief ? (
        <div className="mt-4 rounded-xl bg-emerald-50/60 p-3 text-sm text-slate-800">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">Interview brief</div>
          {c.interview_brief}
        </div>
      ) : (
        c.brief?.who_they_are && <p className="mt-4 text-sm text-slate-700">{c.brief.who_they_are}</p>
      )}

      {c.draft_body && c.draft_subject && (
        <details className="mt-4 rounded-xl border border-slate-200" open={!sent && isTop}>
          <summary className="cursor-pointer px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">{personalise(c.draft_subject, c.first_name, props.calendarLink)}</span>
            <span className="ml-2 text-xs text-slate-500">
              {sent ? `sent ${formatDateTime(c.sent_at)}` : c.draft_source === "edited" ? "edited by you" : c.draft_source === "ai" ? "AI draft" : "standard wording"}
            </span>
          </summary>
          <pre className="whitespace-pre-wrap border-t border-slate-100 px-3 py-3 font-sans text-sm text-slate-700">
            {personalise(c.draft_body, c.first_name, props.calendarLink)}
          </pre>
        </details>
      )}

      {outOfDate && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ranking changed: this candidate should now get {desiredKind === "invite" ? "an invite" : "a rejection"}, but you edited the draft, so it wasn&apos;t replaced. Open the candidate to rewrite it.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        {sent ? (
          <span className="text-sm text-emerald-700">Sent {formatDateTime(c.sent_at)} to {c.email}</span>
        ) : c.draft_kind ? (
          <SendButton id={c.id} kind={c.draft_kind} to={c.email} size="sm" />
        ) : (
          <span className="text-xs text-slate-500">Draft not written yet.</span>
        )}
        <Link href={`/candidates/${c.id}`} className="text-sm font-medium text-teal-700 hover:underline">
          {sent ? "Details" : "Edit draft & details"} →
        </Link>
      </div>
    </article>
  );
}
