import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreButton } from "@/components/PipelineButtons";
import { SendButton } from "@/components/SendButton";
import { Card, Chip, DraftChip, PageHeader, RoleChip, Score, ScoreBar, SectionTitle, cx, displayName, formatDateTime } from "@/components/ui";
import { PATTERN_DIMENSIONS, PATTERN_MAX, ROLE_FIT_DIMENSIONS, ROLE_TITLES, type Role } from "@/config/scoring";
import { db } from "@/lib/db";
import { personalise } from "@/lib/drafting/draft";
import { resolveRecipient } from "@/lib/emails/send";
import { currentRanking } from "@/lib/pipeline";
import { desiredDraftKind } from "@/lib/ranking";
import { getSettings } from "@/lib/settings";
import type { CandidateEvent, EmailRow } from "@/lib/types";
import { ContactForm } from "./ContactForm";
import { DraftEditor } from "./DraftEditor";

const FLAG_TEXT: Record<string, string> = {
  location: "Based outside Mumbai, no mention of relocating (never affects the score)",
  low_extraction_confidence: "CV text may be garbled or incomplete, so check the original",
};

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ ranking, candidates }, settings, emailsRes, eventsRes] = await Promise.all([
    currentRanking(),
    getSettings(),
    db().from("emails").select("*").eq("candidate_id", id).order("created_at", { ascending: false }),
    db().from("candidate_events").select("*").eq("candidate_id", id).order("created_at", { ascending: true }),
  ]);
  const c = candidates.find((x) => x.id === id);
  if (!c) notFound();

  const emails = (emailsRes.data ?? []) as EmailRow[];
  const events = (eventsRes.data ?? []) as CandidateEvent[];
  const role = c.assigned_role ?? c.tagged_role;
  const rank = ranking.rank.get(c.id) ?? null;
  const isTop = ranking.top.has(c.id);
  const suggested = desiredDraftKind(c.id, ranking);
  const ds = c.dimension_scores;

  let deliversTo: string | null = null;
  try {
    deliversTo = c.email ? resolveRecipient(c.email).to : null;
  } catch {
    deliversTo = null;
  }

  return (
    <div className="space-y-5">
      <Link href={role ? `/?role=${role}` : "/"} className="text-sm text-slate-500 hover:text-slate-900">
        ← All candidates
      </Link>

      <PageHeader
        title={displayName(c)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <RoleChip role={role} inferred={c.role_source === "inferred"} />
            {rank != null && <Chip tone={isTop ? "emerald" : "slate"}>#{rank} of {role} applicants{isTop ? ` · top ${settings.topN}` : ""}</Chip>}
            <DraftChip kind={c.draft_kind} sent={c.stage === "sent"} />
            <span>Uploaded {formatDateTime(c.created_at)}</span>
            <a href={`/api/candidates/${c.id}/cv`} className="font-medium text-teal-700 hover:underline">
              Original CV
            </a>
          </span>
        }
      />

      {c.stage === "processing" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">{c.scoring_error ? `Scoring failed: ${c.scoring_error}` : "Not scored yet."}</p>
          <ScoreButton id={c.id} label={c.scoring_error ? "Retry scoring" : "Score now"} />
        </Card>
      )}

      {c.stage !== "processing" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              {(["PM", "SPM"] as Role[]).map((r) => (
                <div key={r} className={cx("rounded-xl p-3", r === role ? "bg-slate-50 ring-1 ring-slate-200" : "")}>
                  <div className="mb-2 text-xs font-medium text-slate-500">
                    {ROLE_TITLES[r]} {r === role && "· applied"}
                  </div>
                  <Score value={r === "PM" ? c.score_pm : c.score_spm} size={r === role ? "lg" : "md"} />
                </div>
              ))}
            </div>
            <ScoreBar label="Arjun's pattern (shared)" value={c.pattern_score} max={PATTERN_MAX} />
            <div className="flex flex-wrap gap-2">
              {c.strong_pattern && <Chip tone="violet">Strong pattern: check before rejecting</Chip>}
              {c.role_mismatch && <Chip tone="sky">May fit {role === "PM" ? "SPM" : "PM"} better</Chip>}
              {c.flags.map((f, i) => (
                <Chip key={i}>{FLAG_TEXT[f] ?? f.replace(/^claims_to_verify:\s*/i, "Verify: ")}</Chip>
              ))}
            </div>
            {c.role_reasoning && (
              <p className="text-xs text-slate-600">
                <span className="font-medium text-slate-800">Role call: </span>
                {c.role_reasoning}
              </p>
            )}
          </Card>

          <Card className="space-y-4 lg:col-span-3">
            {c.interview_brief && (
              <div className="rounded-xl bg-emerald-50/60 p-3">
                <SectionTitle>Interview brief</SectionTitle>
                <p className="text-sm leading-relaxed text-slate-800">{c.interview_brief}</p>
              </div>
            )}
            <div>
              <SectionTitle>Who they are</SectionTitle>
              <p className="text-sm leading-relaxed text-slate-800">{c.brief?.who_they_are}</p>
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
          </Card>
        </div>
      )}

      {/* Email: the draft, the editor and the one-click send */}
      {c.stage !== "processing" && (
        <Card>
          <SectionTitle
            hint={
              c.email
                ? `To ${c.email}${deliversTo && deliversTo !== c.email ? ` (test mode: goes to ${deliversTo})` : ""}`
                : "No email address: add one below"
            }
          >
            Email
          </SectionTitle>
          {c.stage === "sent" ? (
            emails.map((e) => (
              <div key={e.id} className="mb-3 rounded-xl border border-slate-200 p-3 text-sm">
                <div className="text-xs text-slate-500">
                  {e.status === "sent" ? `Sent ${formatDateTime(e.sent_at)}` : `Failed: ${e.error}`} · To {e.delivered_to ?? e.intended_to}
                  {e.test_mode ? " · test mode" : ""}
                  {e.simulated ? " · not delivered (no Resend key)" : ""}
                </div>
                <div className="mt-1 font-medium text-slate-900">{e.subject}</div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{e.body_text}</pre>
              </div>
            ))
          ) : c.draft_body && c.draft_subject && c.draft_kind ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">
                  Preview, exactly as it will be sent ({c.draft_source === "edited" ? "edited by you" : c.draft_source === "ai" ? "AI draft" : "standard wording"})
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-medium text-slate-900">{personalise(c.draft_subject, c.first_name, settings.calendarLink)}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{personalise(c.draft_body, c.first_name, settings.calendarLink)}</pre>
                </div>
                {c.draft_error && <p className="mt-2 text-xs text-amber-700">{c.draft_error}</p>}
                <div className="mt-3">
                  <SendButton id={c.id} kind={c.draft_kind} to={c.email} />
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">Edit</div>
                <DraftEditor key={c.updated_at} id={c.id} subject={c.draft_subject} body={c.draft_body} kind={c.draft_kind} suggestedKind={suggested} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">The draft hasn&apos;t been written yet. Use &quot;Write drafts now&quot; on the dashboard.</p>
          )}
        </Card>
      )}

      {ds && role && (
        <Card>
          <SectionTitle hint="Every point is backed by a line from the CV">Score breakdown (both rubrics)</SectionTitle>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {[...PATTERN_DIMENSIONS, ...ROLE_FIT_DIMENSIONS].map((d) => {
              const data = ds[d.key];
              const onlyFor = d.key === "B1_product_ownership_pm" ? "PM" : d.key === "B1_product_ownership_spm" ? "SPM" : null;
              return (
                <div key={d.key} className="grid gap-2 p-3 sm:grid-cols-[15rem_1fr] sm:gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      <span className="mr-1 text-xs font-semibold text-slate-400">{d.code}</span>
                      {d.label}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1">
                        <ScoreBar value={data?.score ?? 0} max={d.max} muted={!!onlyFor && onlyFor !== role} />
                      </div>
                      <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-900">
                        {data?.score ?? 0}/{d.max}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{onlyFor ? `Counts for ${onlyFor} only` : "Counts for both roles"}</div>
                  </div>
                  <div className="text-sm">
                    {data?.status === "not_evidenced" && (
                      <span className="mr-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Not in CV: probe it</span>
                    )}
                    <span className="text-slate-700">{data?.evidence ? <q className="italic">{data.evidence}</q> : "No evidence."}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Stored privately, never sent to the AI">Personal details</SectionTitle>
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
          {c.model && <p className="mt-2 text-xs text-slate-500">Scored by {c.model} on {formatDateTime(c.scored_at)}.</p>}
        </details>
      </Card>
    </div>
  );
}
