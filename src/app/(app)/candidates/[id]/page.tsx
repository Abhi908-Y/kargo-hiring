import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateActions } from "@/components/CandidateActions";
import {
  BandLabel,
  Card,
  PageHeader,
  RoleChip,
  ScoreBar,
  SectionTitle,
  StageBadge,
  TotalScore,
  cx,
  displayName,
  formatDateTime,
} from "@/components/ui";
import { PATTERN_DIMENSIONS, PATTERN_MAX, ROLE_FIT_DIMENSIONS, ROLE_FIT_MAX, ROLE_TITLES } from "@/config/scoring";
import { resolveRecipient } from "@/lib/emails/send";
import { getCandidate, previewEmail } from "@/lib/pipeline";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/supabase/server";
import type { CandidateEvent, EmailRow } from "@/lib/types";
import { ContactForm } from "./ContactForm";

const FLAG_TEXT: Record<string, string> = {
  location: "Based outside Mumbai, no mention of relocating (never affects the score)",
  low_extraction_confidence: "CV text may be garbled or incomplete, so check the original",
};

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCandidate(id);
  if (!c) notFound();

  const [settings, emailsRes, eventsRes] = await Promise.all([
    getSettings(),
    db().from("emails").select("*").eq("candidate_id", id).order("created_at", { ascending: false }),
    db().from("candidate_events").select("*").eq("candidate_id", id).order("created_at", { ascending: true }),
  ]);
  const emails = (emailsRes.data ?? []) as EmailRow[];
  const events = (eventsRes.data ?? []) as CandidateEvent[];
  const role = c.assigned_role ?? c.tagged_role;
  const ds = c.dimension_scores;

  let previewTo: string | null = null;
  try {
    previewTo = c.email ? resolveRecipient(c.email).to : null;
  } catch {
    previewTo = null;
  }

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href="/candidates" className="text-slate-500 hover:text-slate-900">
          ← All candidates
        </Link>
      </div>

      <PageHeader
        title={displayName(c)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <RoleChip role={role} inferred={c.role_source === "inferred"} />
            <StageBadge stage={c.stage} />
            <span>Uploaded {formatDateTime(c.created_at)}</span>
            <a href={`/api/candidates/${c.id}/cv`} className="font-medium text-teal-700 hover:underline">
              Original CV
            </a>
          </span>
        }
      />

      {/* 30-second view */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-4 lg:col-span-2">
          <div className="flex items-end justify-between gap-3">
            <TotalScore total={c.total_score} band={c.band} size="lg" />
            <BandLabel band={c.band} />
          </div>
          <div className="space-y-3">
            <ScoreBar label="Arjun's pattern" value={c.pattern_score} max={PATTERN_MAX} />
            <ScoreBar label={`Role fit (${role ?? "?"})`} value={c.role_fit_score} max={ROLE_FIT_MAX} />
          </div>
          {c.total_other_role != null && role && (
            <p className="text-xs text-slate-500">
              As {role === "PM" ? "SPM" : "PM"} they would score {c.total_other_role}.
            </p>
          )}
          <ul className="space-y-1 text-xs text-slate-600">
            {c.route_reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
          {c.scoring_error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Scoring failed: {c.scoring_error}</p>}
          <div className="border-t border-slate-100 pt-4">
            <CandidateActions id={c.id} stage={c.stage} scheduledFor={c.email_scheduled_for} hasEmail={!!c.email} scoringError={c.scoring_error} />
            {(c.stage === "shortlisted" || c.stage === "rejected") && (
              <p className="text-sm text-slate-600">
                {c.stage === "shortlisted" ? "Shortlisted" : "Rejected"} {c.decided_by === "auto" ? "automatically" : "by Arjun"}
                {c.decided_at ? ` on ${formatDateTime(c.decided_at)}` : ""}.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-4 lg:col-span-3">
          <div>
            <SectionTitle>Who they are</SectionTitle>
            <p className="text-sm leading-relaxed text-slate-800">{c.brief?.who_they_are ?? "Not scored yet."}</p>
          </div>
          {c.brief && (
            <>
              <div>
                <SectionTitle>Why they ranked here</SectionTitle>
                <ul className="space-y-1.5 text-sm text-slate-800">
                  {c.brief.why_ranked_here.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-teal-600">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <SectionTitle>What to probe in the interview</SectionTitle>
                <ol className="space-y-1.5 text-sm text-slate-800">
                  {c.brief.what_to_probe.map((q, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-semibold tabular-nums text-slate-400">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
          {(c.flags.length > 0 || c.role_mismatch) && (
            <div className="flex flex-wrap gap-2">
              {c.role_mismatch && (
                <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-800">Role mismatch: may fit {role === "PM" ? "SPM" : "PM"} better</span>
              )}
              {c.flags.map((f, i) => (
                <span key={i} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {FLAG_TEXT[f] ?? f.replace(/^claims_to_verify:\s*/i, "Verify: ")}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Score breakdown */}
      {ds && (
        <Card>
          <SectionTitle hint="Every point is backed by a line from the CV">Score breakdown</SectionTitle>
          <div className="space-y-6">
            <DimensionGroup
              title={`Arjun's pattern · ${c.pattern_score}/${PATTERN_MAX}`}
              rows={PATTERN_DIMENSIONS.map((d) => ({ ...d, data: ds[d.key], active: true }))}
            />
            <DimensionGroup
              title={`Role fit · ${c.role_fit_score}/${ROLE_FIT_MAX}`}
              rows={ROLE_FIT_DIMENSIONS.map((d) => ({
                ...d,
                data: ds[d.key],
                active:
                  d.key === "B2_thrives_without_structure" ||
                  (d.key === "B1_product_ownership_pm" ? role === "PM" : role === "SPM"),
              }))}
            />
          </div>
          {c.role_reasoning && (
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">
                Role call ({c.role_source === "inferred" ? "picked by AI, checked by server" : `tagged ${c.tagged_role}`}):{" "}
              </span>
              {c.role_reasoning}
            </div>
          )}
        </Card>
      )}

      {/* Emails */}
      <Card>
        <SectionTitle hint={c.email ? `To ${c.email}${previewTo && previewTo !== c.email ? ` (test mode: goes to ${previewTo})` : ""}` : "No email address"}>
          Email
        </SectionTitle>
        {emails.length > 0 && (
          <div className="mb-4 space-y-3">
            {emails.map((e) => (
              <EmailBox key={e.id} e={e} />
            ))}
          </div>
        )}
        {(c.stage === "review" || c.stage === "processing") && (
          <div className="grid gap-3 md:grid-cols-2">
            {(["shortlist", "rejection"] as const).map((kind) => {
              const p = previewEmail(c, kind, settings);
              return (
                <div key={kind} className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
                    Preview if you {kind === "shortlist" ? "Approve" : "Reject"}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium text-slate-900">{p.subject}</div>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{p.text}</pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {emails.length === 0 && c.stage !== "review" && c.stage !== "processing" && <p className="text-sm text-slate-500">No emails yet.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Stored for emails only, never sent to the AI">Contact</SectionTitle>
          <ContactForm id={c.id} fullName={c.full_name ?? ""} email={c.email ?? ""} />
          {c.phone && <p className="mt-3 text-sm text-slate-600">Phone: {c.phone}</p>}
        </Card>
        <Card>
          <SectionTitle>Activity</SectionTitle>
          <ol className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-36 shrink-0 text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
                <span className="text-slate-700">
                  <span className="font-medium">{e.action.replace(/_/g, " ")}</span>
                  {e.detail ? `: ${e.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">
            What the AI saw (personal details removed)
          </summary>
          {c.extraction_warning && <p className="mt-3 text-sm text-amber-800">Extraction warning: {c.extraction_warning}</p>}
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
            {c.redacted_text}
          </pre>
          {c.model && <p className="mt-2 text-xs text-slate-500">Scored by {c.model} on {formatDateTime(c.scored_at)} for {role ? ROLE_TITLES[role] : "?"}.</p>}
        </details>
      </Card>
    </div>
  );
}

function DimensionGroup({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; code: string; label: string; max: number; active: boolean; data?: { score: number; status: string; evidence: string } }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map((r) => (
          <div key={r.key} className={cx("grid gap-2 p-3 sm:grid-cols-[14rem_1fr] sm:gap-4", !r.active && "opacity-60")}>
            <div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  <span className="mr-1 text-xs font-semibold text-slate-400">{r.code}</span>
                  {r.label}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1">
                  <ScoreBar value={r.data?.score ?? 0} max={r.max} muted={!r.active} />
                </div>
                <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {r.data?.score ?? 0}/{r.max}
                </span>
              </div>
              {!r.active && <div className="mt-1 text-[11px] text-slate-500">Other role&apos;s bar (not counted)</div>}
            </div>
            <div className="text-sm">
              {r.data?.status === "not_evidenced" ? (
                <span className="mr-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Not in CV: probe it</span>
              ) : null}
              <span className="text-slate-700">{r.data?.evidence ? <q className="italic">{r.data.evidence}</q> : "No evidence."}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMAIL_STATUS: Record<EmailRow["status"], string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
  simulated: "Simulated",
  cancelled: "Cancelled (Undo)",
  failed: "Failed",
};

function EmailBox({ e }: { e: EmailRow }) {
  const when = e.status === "scheduled" ? `for ${formatDateTime(e.scheduled_for)}` : e.sent_at ? formatDateTime(e.sent_at) : formatDateTime(e.created_at);
  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-medium capitalize text-slate-900">{e.kind}</span>
        <span
          className={cx(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            e.status === "failed" ? "bg-rose-50 text-rose-700" : e.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-teal-50 text-teal-800",
          )}
        >
          {EMAIL_STATUS[e.status]}
          {e.simulated && e.status !== "cancelled" ? " · not delivered (no Resend key)" : ""}
        </span>
        {e.test_mode && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Test mode</span>}
        <span className="text-xs text-slate-500">
          {e.trigger === "auto" ? "Automatic" : "By Arjun"} · {when}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3 text-sm">
        <div className="text-xs text-slate-500">
          From {e.from_address ?? "–"} · To {e.delivered_to ?? e.intended_to}
        </div>
        <div className="mt-1 font-medium text-slate-900">{e.subject}</div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{e.body_text}</pre>
        {e.error && <p className="mt-2 text-rose-700">Error: {e.error}</p>}
      </div>
    </details>
  );
}
