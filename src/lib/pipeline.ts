import "server-only";
import crypto from "node:crypto";
import type { Role, Settings } from "@/config/scoring";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo/mode";
import { demoDraftEmail } from "@/lib/drafting/demo";
import { draftEmail, LINK_TOKEN, NAME_TOKEN, personalise } from "@/lib/drafting/draft";
import { cancelScheduledEmail, deliverEmail } from "@/lib/emails/send";
import { isCalendarPlaceholder } from "@/lib/emails/templates";
import { env } from "@/lib/env";
import { extractCvText, fileTypeFromName, MAX_FILE_BYTES } from "@/lib/extract";
import { extractContact, normaliseForHash, redactCv } from "@/lib/redact";
import { getRubric, weightsFrom } from "@/lib/rubric";
import { bandFor, bandReason, hasLowExtractionFlag, summariseScores, weightedTotal, type Band } from "@/lib/scores";
import { demoScoreCv } from "@/lib/scoring/demo";
import { scoreCv } from "@/lib/scoring/score";
import { getSettings } from "@/lib/settings";
import type { Candidate, EmailKind, EmailRow } from "@/lib/types";

// The pipeline:
//   upload -> score both rubrics (weighted by the Rubric page)
//   -> band by score: below the reject line = automatic rejection,
//      above the invite line = automatic invite, in between = Arjun's review queue
//   -> AI drafts (both for review, one for automatic) -> send
// Automatic emails are held for Settings.holdHours so Arjun can Undo.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const sha256 = (data: Uint8Array | string) => crypto.createHash("sha256").update(data).digest("hex");
const nowIso = () => new Date().toISOString();
const demoAiActive = () => isDemoMode() && !process.env.GEMINI_API_KEY;

export async function logEvent(candidateId: string, action: string, detail?: string) {
  await db().from("candidate_events").insert({ candidate_id: candidateId, action, detail: detail ?? null });
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const { data } = await db().from("candidates").select("*").eq("id", id).maybeSingle();
  return (data as Candidate) ?? null;
}

export async function allCandidates(): Promise<Candidate[]> {
  const { data } = await db().from("candidates").select("*").order("created_at", { ascending: true });
  return (data ?? []) as Candidate[];
}

/** Rank within each role by total score (earlier upload wins a tie). */
export function rankCandidates(candidates: Candidate[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const role of ["PM", "SPM"] as Role[]) {
    candidates
      .filter((c) => c.assigned_role === role && c.total_score != null)
      .sort((a, b) => b.total_score! - a.total_score! || a.created_at.localeCompare(b.created_at))
      .forEach((c, i) => rank.set(c.id, i + 1));
  }
  return rank;
}

/** Which drafts a candidate needs: both for review, one for an automatic email. */
export function neededDrafts(c: Pick<Candidate, "band">): EmailKind[] {
  if (c.band === "auto_invite") return ["invite"];
  if (c.band === "auto_reject") return ["rejection"];
  return ["invite", "rejection"];
}

export function missingDrafts(c: Candidate): EmailKind[] {
  if (c.stage !== "drafting" && c.stage !== "review") return [];
  return neededDrafts(c).filter((k) => !(k === "invite" ? c.invite_body : c.rejection_body));
}

export function draftOf(c: Candidate, kind: EmailKind) {
  return kind === "invite"
    ? { subject: c.invite_subject, body: c.invite_body, source: c.invite_source }
    : { subject: c.rejection_subject, body: c.rejection_body, source: c.rejection_source };
}

// ---------------------------------------------------------------------------
// Upload: extract, skip duplicates, separate personal details, store
// ---------------------------------------------------------------------------

export async function ingestCv(opts: {
  fileName: string;
  bytes: Uint8Array;
  taggedRole: Role | null;
}): Promise<Result<{ id: string; warning: string | null }>> {
  const type = fileTypeFromName(opts.fileName);
  if (!type) return { ok: false, status: 400, error: "Only .pdf and .docx files are supported." };
  if (opts.bytes.byteLength > MAX_FILE_BYTES) return { ok: false, status: 400, error: "File is larger than 4 MB." };

  const fileHash = sha256(opts.bytes);
  const sameFile = await db().from("candidates").select("id, file_name").eq("file_hash", fileHash).maybeSingle();
  if (sameFile.data) return duplicate(`the same file was already uploaded as "${sameFile.data.file_name}"`);

  let extraction;
  try {
    extraction = await extractCvText(opts.bytes, type);
  } catch (e) {
    return { ok: false, status: 422, error: `Couldn't read this file (${(e as Error).message}). Is it password-protected or corrupted?` };
  }
  if (!extraction.text) return { ok: false, status: 422, error: "No text could be read from this file." };

  const textHash = sha256(normaliseForHash(extraction.text));
  const sameText = await db().from("candidates").select("id, file_name").eq("text_hash", textHash).maybeSingle();
  if (sameText.data) return duplicate(`a CV with identical text was already uploaded as "${sameText.data.file_name}"`);

  const contact = extractContact(extraction.text, opts.fileName);
  if (contact.email) {
    const sameEmail = await db().from("candidates").select("id, file_name").eq("email", contact.email).maybeSingle();
    if (sameEmail.data) return duplicate(`a CV with the same email address was already uploaded as "${sameEmail.data.file_name}"`);
  }

  const redacted = redactCv(extraction.text, contact, opts.fileName);
  const id = crypto.randomUUID();
  const filePath = `${id}/${opts.fileName.replace(/[^\w.\-]+/g, "_").slice(-120)}`;
  const contentType =
    type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const stored = await db().files.put(filePath, opts.bytes, contentType);
  if (stored) return { ok: false, status: 500, error: `File storage failed: ${stored.message}` };

  const { error } = await db().from("candidates").insert({
    id,
    file_name: opts.fileName,
    file_path: filePath,
    file_type: type,
    file_hash: fileHash,
    text_hash: textHash,
    full_name: contact.fullName,
    first_name: contact.firstName,
    email: contact.email,
    phone: contact.phone,
    redacted_text: redacted,
    extraction_warning: extraction.warning,
    tagged_role: opts.taggedRole,
    stage: "processing",
  });
  if (error) {
    await db().files.remove(filePath);
    if (error.code === "23505") return duplicate("this CV was uploaded at the same moment by another request");
    return { ok: false, status: 500, error: error.message };
  }

  await logEvent(id, "uploaded", `${opts.fileName} (${opts.taggedRole ?? "untagged"})`);
  return { ok: true, id, warning: extraction.warning };
}

function duplicate(reason: string): Result<never> {
  return { ok: false, status: 409, error: `Skipped as a duplicate: ${reason}.` };
}

// ---------------------------------------------------------------------------
// Score (both rubrics) and pick the band
// ---------------------------------------------------------------------------

const CLEARED_DRAFTS = {
  interview_brief: null,
  invite_subject: null, invite_body: null, invite_source: null,
  rejection_subject: null, rejection_body: null, rejection_source: null,
  draft_error: null, drafted_at: null,
};

export async function scoreCandidate(id: string): Promise<Result<{ candidate: Candidate }>> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage === "sent" || c.stage === "invite_pending" || c.stage === "reject_pending")
    return { ok: false, status: 409, error: "An email is already on its way to this candidate." };

  const [rubric, settings] = await Promise.all([getRubric(), getSettings()]);

  let scored;
  try {
    scored = demoAiActive()
      ? await demoScoreCv({ candidateId: c.id, taggedRole: c.tagged_role, redactedText: c.redacted_text })
      : await scoreCv({ candidateId: c.id, taggedRole: c.tagged_role, redactedText: c.redacted_text, rubric });
  } catch (e) {
    const message = (e as Error).message;
    await db().from("candidates").update({ scoring_error: message, updated_at: nowIso() }).eq("id", id);
    await logEvent(id, "scoring_failed", message);
    return { ok: true, candidate: (await getCandidate(id))! };
  }

  const ai = scored.output;
  const s = summariseScores(ai.scores, c.tagged_role, weightsFrom(rubric));
  const total = s.totals[s.assignedRole];
  const flags = new Set(ai.flags.map((f) => f.trim()).filter(Boolean));
  if (c.extraction_warning) flags.add("low_extraction_confidence");
  const band = bandFor(total, settings);
  const dimensionScores = Object.fromEntries(
    Object.entries(ai.scores).map(([k, v]) => [k, { ...v, score: s.scores[k as keyof typeof s.scores] }]),
  );

  const { error } = await db()
    .from("candidates")
    .update({
      stage: "drafting",
      assigned_role: s.assignedRole,
      role_source: s.roleSource,
      role_reasoning: ai.role_reasoning,
      role_mismatch: s.roleMismatch,
      pattern_score: s.pattern,
      score_pm: s.totals.PM,
      score_spm: s.totals.SPM,
      total_score: total,
      strong_pattern: s.strongPattern,
      band,
      route_reason: bandReason(total, band, settings),
      dimension_scores: dimensionScores,
      brief: ai.brief,
      personal_line: ai.personal_line,
      flags: [...flags],
      ai_raw: ai,
      model: scored.model,
      scored_at: nowIso(),
      scoring_error: null,
      decided_by: null,
      email_scheduled_for: null,
      ...CLEARED_DRAFTS,
      updated_at: nowIso(),
    })
    .eq("id", id);
  if (error) return { ok: false, status: 500, error: error.message };
  await logEvent(id, "scored", `PM ${s.totals.PM}/100, SPM ${s.totals.SPM}/100; ${s.assignedRole} ${total} -> ${band.replace("_", " ")}`);
  return { ok: true, candidate: (await getCandidate(id))! };
}

// ---------------------------------------------------------------------------
// Drafts, then routing
// ---------------------------------------------------------------------------

async function writeDraft(c: Candidate, kind: EmailKind) {
  const { draft, source, error } = await (demoAiActive() ? demoDraftEmail : draftEmail)(c, kind);
  const fields =
    kind === "invite"
      ? { invite_subject: draft.subject.trim(), invite_body: draft.body.trim(), invite_source: source, interview_brief: draft.interview_brief.trim() || null }
      : { rejection_subject: draft.subject.trim(), rejection_body: draft.body.trim(), rejection_source: source };
  await db()
    .from("candidates")
    .update({ ...fields, draft_error: error, drafted_at: nowIso(), updated_at: nowIso() })
    .eq("id", c.id);
  await logEvent(c.id, `${kind}_drafted`, source === "ai" ? "Drafted by AI" : error ?? "Standard wording");
}

/** Why an automatic email can't go out, or null if it can. */
function autoBlocker(c: Candidate, settings: Settings): string | null {
  if (!c.email) return "no email address was found in the CV";
  if (c.extraction_warning || hasLowExtractionFlag(c.flags)) return "the CV text may be incomplete, so a person should check it";
  if (c.band === "auto_reject" && c.strong_pattern)
    return `the pattern score is strong (${c.pattern_score}/60), so the rubric's rescue rule sends it to review`;
  if (c.band === "auto_invite" && !env.testMode() && isCalendarPlaceholder(settings.calendarLink))
    return "the interview calendar link isn't set in Settings";
  return null;
}

/** Once a candidate's drafts are written: schedule the automatic email, or put them in review. */
async function route(id: string) {
  const c = await getCandidate(id);
  if (!c || c.stage !== "drafting" || missingDrafts(c).length) return;
  const settings = await getSettings();

  // Only an explicit auto band sends anything; no band (older rows) means review.
  if (c.band !== "auto_invite" && c.band !== "auto_reject") {
    await db().from("candidates").update({ stage: "review", updated_at: nowIso() }).eq("id", id).eq("stage", "drafting");
    return;
  }

  const blocker = autoBlocker(c, settings);
  if (blocker) {
    // Needs Arjun: switch to the review band; the missing second draft gets written next.
    await db()
      .from("candidates")
      .update({ band: "review" satisfies Band, route_reason: `${c.route_reason} Sent to review instead: ${blocker}.`, updated_at: nowIso() })
      .eq("id", id);
    await logEvent(id, "moved_to_review", blocker);
    return;
  }

  const kind: EmailKind = c.band === "auto_invite" ? "invite" : "rejection";
  const scheduledAt = settings.holdHours > 0 ? new Date(Date.now() + settings.holdHours * 3600_000) : undefined;
  const sent = await sendEmail(c, kind, { trigger: "auto", scheduledAt, fromStage: "drafting" });
  if (!sent.ok) {
    await db()
      .from("candidates")
      .update({ band: "review" satisfies Band, route_reason: `${c.route_reason} Sent to review instead: the email couldn't be sent (${sent.error}).`, updated_at: nowIso() })
      .eq("id", id);
  }
}

/** Write the next missing draft (one AI call), then route that candidate. The upload page calls this until remaining is 0. */
export async function refreshNextDraft(): Promise<{ drafted: string | null; remaining: number }> {
  const candidates = await allCandidates();
  // Candidates whose drafts are already complete but still in "drafting" just need routing.
  for (const c of candidates.filter((x) => x.stage === "drafting" && missingDrafts(x).length === 0)) await route(c.id);

  const pending = (await allCandidates())
    .filter((c) => missingDrafts(c).length)
    .sort((a, b) => Number(b.stage === "drafting") - Number(a.stage === "drafting")); // new uploads first
  if (!pending.length) return { drafted: null, remaining: 0 };

  const next = pending[0];
  await writeDraft(next, missingDrafts(next)[0]);
  await route(next.id);

  const remaining = (await allCandidates()).reduce((n, c) => n + missingDrafts(c).length, 0);
  return { drafted: next.id, remaining };
}

export async function regenerateDraft(id: string, kind: EmailKind): Promise<Result> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage !== "review") return { ok: false, status: 409, error: "Drafts can only be rewritten while the candidate is in review." };
  await writeDraft(c, kind);
  return { ok: true };
}

export async function saveDraft(id: string, kind: EmailKind, input: { subject: string; body: string }): Promise<Result> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) return { ok: false, status: 400, error: "Subject and body can't be empty." };
  const fields =
    kind === "invite"
      ? { invite_subject: subject, invite_body: body, invite_source: "edited" }
      : { rejection_subject: subject, rejection_body: body, rejection_source: "edited" };
  const { data } = await db()
    .from("candidates")
    .update({ ...fields, updated_at: nowIso() })
    .eq("id", id)
    .eq("stage", "review")
    .select("id");
  if (!data?.length) return { ok: false, status: 409, error: "Drafts can only be edited while the candidate is in review." };
  await logEvent(id, `${kind}_edited`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function sendEmail(
  c: Candidate,
  kind: EmailKind,
  opts: { trigger: "auto" | "arjun"; scheduledAt?: Date; fromStage: "drafting" | "review" },
): Promise<Result> {
  const d = draftOf(c, kind);
  if (!d.subject || !d.body) return { ok: false, status: 409, error: `There's no ${kind} draft yet.` };
  if (!c.email) return { ok: false, status: 400, error: "No email address. Add one on the candidate page." };

  const settings = await getSettings();
  if (kind === "invite" && !env.testMode() && isCalendarPlaceholder(settings.calendarLink))
    return { ok: false, status: 400, error: "Set the interview calendar link in Settings before sending invites." };
  const subject = personalise(d.subject, c.first_name, settings.calendarLink);
  const text = personalise(d.body, c.first_name, settings.calendarLink);
  if (subject.includes(NAME_TOKEN) || text.includes(NAME_TOKEN)) return { ok: false, status: 400, error: "The draft still contains [NAME]." };
  if (!env.testMode() && text.includes(LINK_TOKEN)) return { ok: false, status: 400, error: "The draft still contains {calendar_link}." };

  const held = Boolean(opts.scheduledAt);
  const nextStage = held ? (kind === "invite" ? "invite_pending" : "reject_pending") : "sent";
  // Claim atomically so a double-click (or two tabs) can't send two emails.
  const { data: claimed } = await db()
    .from("candidates")
    .update({
      stage: nextStage,
      sent_kind: kind,
      decided_by: opts.trigger,
      email_scheduled_for: opts.scheduledAt?.toISOString() ?? null,
      sent_at: held ? null : nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", c.id)
    .eq("stage", opts.fromStage)
    .select("id");
  if (!claimed?.length) return { ok: false, status: 409, error: "This candidate was just updated. Refresh the page." };

  const { data: row, error } = await db()
    .from("emails")
    .insert({
      candidate_id: c.id,
      kind,
      trigger: opts.trigger,
      intended_to: c.email,
      test_mode: env.testMode(),
      subject,
      body_text: text,
      body_html: "",
      status: "queued",
      scheduled_for: opts.scheduledAt?.toISOString() ?? null,
    })
    .select("*")
    .single();

  try {
    if (error || !row) throw new Error(error?.message ?? "could not record the email");
    const result = await deliverEmail({ intendedTo: c.email, subject, text, idempotencyKey: row.id, scheduledAt: opts.scheduledAt });
    await db()
      .from("emails")
      .update({
        status: held ? "scheduled" : "sent",
        simulated: result.status === "simulated",
        sent_at: held ? null : nowIso(),
        resend_id: result.resendId,
        delivered_to: result.deliveredTo,
        from_address: result.fromAddress,
        subject: result.subject,
        body_text: result.text,
        body_html: result.html,
      })
      .eq("id", row.id);
  } catch (e) {
    const message = (e as Error).message;
    if (row) await db().from("emails").update({ status: "failed", error: message }).eq("id", row.id);
    await db()
      .from("candidates")
      .update({ stage: opts.fromStage, sent_kind: null, decided_by: null, email_scheduled_for: null, sent_at: null, updated_at: nowIso() })
      .eq("id", c.id);
    return { ok: false, status: 502, error: `Email failed, nothing was sent: ${message}` };
  }

  await logEvent(
    c.id,
    held ? `auto_${kind}_scheduled` : `${kind}_sent`,
    held ? `Automatic; held until ${opts.scheduledAt!.toISOString()}` : opts.trigger === "auto" ? "Automatic" : "Sent by Arjun",
  );
  return { ok: true };
}

/** Arjun's decision in the review queue: send the invite or the rejection now. */
export async function sendDraft(id: string, kind: EmailKind): Promise<Result> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage === "sent") return { ok: false, status: 409, error: "Already sent." };
  if (c.stage === "invite_pending" || c.stage === "reject_pending")
    return { ok: false, status: 409, error: "An automatic email is already scheduled. Use Undo first." };
  if (c.stage !== "review") return { ok: false, status: 409, error: "This candidate isn't ready yet (drafts still being written)." };
  return sendEmail(c, kind, { trigger: "arjun", fromStage: "review" });
}

/** Cancel a held automatic email and move the candidate to review. */
export async function undo(id: string): Promise<Result> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage !== "invite_pending" && c.stage !== "reject_pending") return { ok: false, status: 409, error: "There's no held email to undo." };
  if (c.email_scheduled_for && new Date(c.email_scheduled_for).getTime() <= Date.now())
    return { ok: false, status: 409, error: "Too late: the email has already gone out." };

  const { data: email } = await db()
    .from("emails")
    .select("*")
    .eq("candidate_id", id)
    .eq("status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cancelError = await cancelScheduledEmail((email as EmailRow | null)?.resend_id ?? null);
  if (cancelError) return { ok: false, status: 409, error: `Couldn't cancel the email: ${cancelError}` };
  if (email) await db().from("emails").update({ status: "cancelled", cancelled_at: nowIso() }).eq("id", email.id);

  // Review needs both drafts; "drafting" lets the refresh loop write the missing one, then it moves to review.
  await db()
    .from("candidates")
    .update({
      stage: "drafting",
      band: "review",
      route_reason: `${c.route_reason ?? ""} Undo by Arjun: email cancelled, moved to review.`.trim(),
      sent_kind: null,
      decided_by: null,
      email_scheduled_for: null,
      updated_at: nowIso(),
    })
    .eq("id", id);
  await logEvent(id, "undo", "Held email cancelled; moved to review");
  return { ok: true };
}

/** Mark held emails whose time has passed as sent. Runs on page loads, so no cron job is needed. */
export async function finalizeDue(): Promise<void> {
  const now = nowIso();
  for (const stage of ["invite_pending", "reject_pending"]) {
    const { data } = await db().from("candidates").select("id, email_scheduled_for").eq("stage", stage).lte("email_scheduled_for", now);
    for (const c of data ?? []) {
      await db().from("candidates").update({ stage: "sent", sent_at: c.email_scheduled_for }).eq("id", c.id).eq("stage", stage);
    }
  }
  const { data: due } = await db().from("emails").select("id, scheduled_for").eq("status", "scheduled").lte("scheduled_for", now);
  for (const e of due ?? []) await db().from("emails").update({ status: "sent", sent_at: e.scheduled_for }).eq("id", e.id);
}

// ---------------------------------------------------------------------------
// Rubric weight changes: recompute totals without calling the AI
// ---------------------------------------------------------------------------

export async function recomputeTotals(): Promise<number> {
  const weights = weightsFrom(await getRubric());
  const list = (await allCandidates()).filter((c) => c.dimension_scores);
  for (const c of list) {
    const raw = Object.fromEntries(Object.entries(c.dimension_scores!).map(([k, v]) => [k, v.score]));
    const s = summariseScores(raw, c.tagged_role, weights);
    const role = c.assigned_role ?? s.assignedRole;
    await db()
      .from("candidates")
      .update({ score_pm: weightedTotal(s.scores, "PM", weights), score_spm: weightedTotal(s.scores, "SPM", weights), total_score: s.totals[role] })
      .eq("id", c.id);
  }
  return list.length;
}

// ---------------------------------------------------------------------------

export async function updateContact(id: string, input: { fullName?: string; email?: string }): Promise<Result> {
  const patch: Record<string, string | null> = { updated_at: nowIso() };
  if (input.fullName !== undefined) {
    const name = input.fullName.trim().replace(/\s+/g, " ");
    patch.full_name = name || null;
    patch.first_name = name ? name.split(" ")[0] : null;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "That email address doesn't look right." };
    patch.email = email || null;
  }
  const { error } = await db().from("candidates").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "Another candidate already has that email address." };
    return { ok: false, status: 500, error: error.message };
  }
  await logEvent(id, "contact_updated");
  return { ok: true };
}

export async function cvFile(c: Candidate) {
  return c.file_path ? db().files.get(c.file_path) : null;
}
