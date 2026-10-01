import Link from "next/link";
import { dimensionsForRole, type Role } from "@/config/scoring";
import { personalise } from "@/lib/drafting/draft";
import { draftOf } from "@/lib/pipeline";
import type { Candidate, EmailKind } from "@/lib/types";
import { MoveToReviewButton, SendButton } from "./SendButton";
import { Chip, RoleChip, Score, ScoreBar, StatusChip, cx, displayName, formatDateTime } from "./ui";

function DraftPreview(props: { c: Candidate; kind: EmailKind; calendarLink: string; open?: boolean; action?: React.ReactNode }) {
  const d = draftOf(props.c, props.kind);
  if (!d.subject || !d.body) return null;
  return (
    <details className="rounded-xl border border-slate-200" open={props.open}>
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2 text-sm">
        <span className={cx("text-xs font-semibold uppercase", props.kind === "invite" ? "text-emerald-700" : "text-rose-700")}>
          {props.kind === "invite" ? "Invite" : "Rejection"}
        </span>
        <span className="font-medium text-slate-900">{personalise(d.subject, props.c.first_name, props.calendarLink)}</span>
        <span className="text-xs text-slate-500">{d.source === "edited" ? "edited by you" : d.source === "ai" ? "AI draft" : "standard wording"}</span>
      </summary>
      <pre className="whitespace-pre-wrap border-t border-slate-100 px-3 py-3 font-sans text-sm text-slate-700">
        {personalise(d.body, props.c.first_name, props.calendarLink)}
      </pre>
      {props.action && <div className="border-t border-slate-100 px-3 py-2">{props.action}</div>}
    </details>
  );
}

export function CandidateCard(props: {
  c: Candidate;
  role: Role;
  rank: number | null;
  calendarLink: string;
  names: Record<string, string>;
  note?: { body: string; created_at: string; count: number };
}) {
  const { c, role, rank } = props;
  const score = role === "PM" ? c.score_pm : c.score_spm;
  const otherRole: Role = role === "PM" ? "SPM" : "PM";
  const otherScore = role === "PM" ? c.score_spm : c.score_pm;
  const autoKind: EmailKind | null = c.stage === "auto_selected" ? "invite" : c.stage === "auto_rejected" ? "rejection" : null;

  return (
    <article
      className={cx(
        "rounded-2xl border bg-white p-4 sm:p-5",
        c.stage === "review" ? "border-amber-300" : c.stage === "auto_selected" ? "border-emerald-300" : c.stage === "auto_rejected" ? "border-rose-200" : "border-slate-200",
      )}
    >
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
            <StatusChip stage={c.stage} band={c.band} sentKind={c.sent_kind} />
            {c.strong_pattern && c.stage === "review" && <Chip tone="violet">Strong Kargo pattern ({c.pattern_score}/60): check before rejecting</Chip>}
            {c.role_mismatch && <Chip tone="sky">May fit {otherRole} better</Chip>}
            {c.flags.includes("location") && <Chip>Outside Mumbai</Chip>}
            {c.same_email_as && <Chip tone="amber">Same email as {c.same_email_as}</Chip>}
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
            <ScoreBar key={d.key} label={`${d.code} ${props.names[d.key] ?? ""}`} value={c.dimension_scores![d.key]?.score ?? 0} max={d.max} />
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

      {c.route_reason && <p className="mt-3 text-xs text-slate-500">{c.route_reason}</p>}

      {props.note && (
        <Link href={`/candidates/${c.id}`} className="mt-3 block rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-sm hover:border-sky-200">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
            Your note{props.note.count > 1 ? `s (${props.note.count}, latest shown)` : ""} · {formatDateTime(props.note.created_at)}
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-slate-800">{props.note.body}</p>
        </Link>
      )}

      <div className="mt-4 space-y-2">
        {c.stage === "review" && (
          <>
            <DraftPreview c={c} kind="invite" calendarLink={props.calendarLink} action={<SendButton id={c.id} kind="invite" to={c.email} size="sm" />} />
            <DraftPreview c={c} kind="rejection" calendarLink={props.calendarLink} action={<SendButton id={c.id} kind="rejection" to={c.email} size="sm" />} />
          </>
        )}
        {autoKind && <DraftPreview c={c} kind={autoKind} calendarLink={props.calendarLink} />}
        {c.stage === "sent" && c.sent_kind && <DraftPreview c={c} kind={c.sent_kind} calendarLink={props.calendarLink} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        {autoKind ? (
          <div className="flex flex-wrap items-start gap-2">
            <SendButton id={c.id} kind={autoKind} to={c.email} size="sm" label={autoKind === "invite" ? "Send invite now" : "Send rejection now"} />
            <MoveToReviewButton id={c.id} size="sm" />
          </div>
        ) : c.stage === "sent" ? (
          <span className="text-sm text-emerald-700">
            {c.sent_kind === "invite" ? "Invite" : "Rejection"} sent {formatDateTime(c.sent_at)} {c.decided_by === "auto" ? "(bulk send)" : "(by you)"}
          </span>
        ) : c.stage === "drafting" ? (
          <span className="text-xs text-slate-500">Drafts are being written…</span>
        ) : c.stage === "review" ? (
          <span className="text-xs text-slate-500">Open a draft above to send it, or edit it on the candidate page.</span>
        ) : (
          <span />
        )}
        <Link href={`/candidates/${c.id}`} className="text-sm font-medium text-teal-700 hover:underline">
          Details{c.stage !== "sent" ? " & edit drafts" : ""} →
        </Link>
      </div>
    </article>
  );
}
