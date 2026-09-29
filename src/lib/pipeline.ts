import "server-only";
import crypto from "node:crypto";
import type { Role } from "@/config/scoring";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo/mode";
import { demoDraftEmail } from "@/lib/drafting/demo";
import { draftEmail, LINK_TOKEN, NAME_TOKEN, personalise } from "@/lib/drafting/draft";
import { deliverEmail } from "@/lib/emails/send";
import { isCalendarPlaceholder } from "@/lib/emails/templates";
import { env } from "@/lib/env";
import { extractCvText, fileTypeFromName, MAX_FILE_BYTES } from "@/lib/extract";
import { desiredDraftKind, rankCandidates, type DraftKind, type Ranking } from "@/lib/ranking";
import { extractContact, normaliseForHash, redactCv } from "@/lib/redact";
import { summariseScores } from "@/lib/scores";
import { demoScoreCv } from "@/lib/scoring/demo";
import { scoreCv } from "@/lib/scoring/score";
import { getSettings } from "@/lib/settings";
import type { Candidate } from "@/lib/types";

// The pipeline: upload -> (1) score both rubrics -> (2) interview brief for the
// top N per role -> (3) email draft for everyone -> (4) Arjun confirms and sends.

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

export async function currentRanking(candidates?: Candidate[]): Promise<{ ranking: Ranking; candidates: Candidate[] }> {
  const [list, settings] = await Promise.all([candidates ?? allCandidates(), getSettings()]);
  return { ranking: rankCandidates(list.filter((c) => c.stage !== "processing"), settings.topN), candidates: list };
}

/** Scored, unsent candidates whose draft is missing or no longer matches their rank. Edited drafts are left alone. */
export function staleDrafts(candidates: Candidate[], ranking: Ranking): Candidate[] {
  return candidates
    .filter((c) => c.stage === "scored" && c.draft_source !== "edited" && c.draft_kind !== desiredDraftKind(c.id, ranking))
    .sort((a, b) => Number(ranking.top.has(b.id)) - Number(ranking.top.has(a.id))); // invites first
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
// Step 1: score against both rubrics
// ---------------------------------------------------------------------------

export async function scoreCandidate(id: string): Promise<Result<{ candidate: Candidate }>> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage === "sent") return { ok: false, status: 409, error: "An email was already sent to this candidate." };

  let scored;
  try {
    const scorer = demoAiActive() ? demoScoreCv : scoreCv;
    scored = await scorer({ candidateId: c.id, taggedRole: c.tagged_role, redactedText: c.redacted_text });
  } catch (e) {
    const message = (e as Error).message;
    await db().from("candidates").update({ scoring_error: message, updated_at: nowIso() }).eq("id", id);
    await logEvent(id, "scoring_failed", message);
    return { ok: true, candidate: (await getCandidate(id))! };
  }

  const ai = scored.output;
  const s = summariseScores(ai.scores, c.tagged_role);
  const flags = new Set(ai.flags.map((f) => f.trim()).filter(Boolean));
  if (c.extraction_warning) flags.add("low_extraction_confidence");
  const dimensionScores = Object.fromEntries(
    Object.entries(ai.scores).map(([k, v]) => [k, { ...v, score: s.scores[k as keyof typeof s.scores] }]),
  );

  const { error } = await db()
    .from("candidates")
    .update({
      stage: "scored",
      assigned_role: s.assignedRole,
      role_source: s.roleSource,
      role_reasoning: ai.role_reasoning,
      role_mismatch: s.roleMismatch,
      pattern_score: s.pattern,
      score_pm: s.totals.PM,
      score_spm: s.totals.SPM,
      total_score: s.totals[s.assignedRole],
      strong_pattern: s.strongPattern,
      dimension_scores: dimensionScores,
      brief: ai.brief,
      personal_line: ai.personal_line,
      flags: [...flags],
      ai_raw: ai,
      model: scored.model,
      scored_at: nowIso(),
      scoring_error: null,
      // A fresh score means a fresh draft.
      interview_brief: null,
      draft_kind: null,
      draft_subject: null,
      draft_body: null,
      draft_source: null,
      draft_error: null,
      drafted_at: null,
      updated_at: nowIso(),
    })
    .eq("id", id);
  if (error) return { ok: false, status: 500, error: error.message };
  await logEvent(id, "scored", `PM ${s.totals.PM}/100, SPM ${s.totals.SPM}/100; ranked as ${s.assignedRole}`);
  return { ok: true, candidate: (await getCandidate(id))! };
}

// ---------------------------------------------------------------------------
// Steps 2 + 3: interview brief (top N) and email draft (everyone)
// ---------------------------------------------------------------------------

async function writeDraft(c: Candidate, kind: DraftKind) {
  const drafter = demoAiActive() ? demoDraftEmail : draftEmail;
  const { draft, source, error } = await drafter(c, kind);
  await db()
    .from("candidates")
    .update({
      draft_kind: kind,
      draft_subject: draft.subject.trim(),
      draft_body: draft.body.trim(),
      draft_source: source,
      draft_error: error,
      interview_brief: kind === "invite" ? draft.interview_brief.trim() || null : null,
      drafted_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", c.id)
    .eq("stage", "scored");
  await logEvent(c.id, `${kind}_drafted`, source === "ai" ? "Drafted by AI" : error ?? "Standard wording");
}

/** Draft the next stale candidate. The upload page calls this repeatedly until remaining is 0. */
export async function refreshNextDraft(): Promise<{ drafted: string | null; remaining: number }> {
  const { ranking, candidates } = await currentRanking();
  const stale = staleDrafts(candidates, ranking);
  if (!stale.length) return { drafted: null, remaining: 0 };
  const next = stale[0];
  await writeDraft(next, desiredDraftKind(next.id, ranking));
  return { drafted: next.id, remaining: stale.length - 1 };
}

export async function regenerateDraft(id: string): Promise<Result> {
  const { ranking, candidates } = await currentRanking();
  const c = candidates.find((x) => x.id === id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage !== "scored") return { ok: false, status: 409, error: c.stage === "sent" ? "Already sent." : "Not scored yet." };
  await writeDraft(c, desiredDraftKind(id, ranking));
  return { ok: true };
}

export async function saveDraft(id: string, input: { subject: string; body: string; kind?: DraftKind }): Promise<Result> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) return { ok: false, status: 400, error: "Subject and body can't be empty." };
  const { data } = await db()
    .from("candidates")
    .update({
      draft_subject: subject,
      draft_body: body,
      draft_source: "edited",
      ...(input.kind ? { draft_kind: input.kind } : {}),
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("stage", "scored")
    .select("id");
  if (!data?.length) return { ok: false, status: 409, error: "This draft can't be edited (already sent or not scored)." };
  await logEvent(id, "draft_edited");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Step 4: Arjun clicks Confirm & send
// ---------------------------------------------------------------------------

export async function sendDraft(id: string): Promise<Result> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage === "sent") return { ok: false, status: 409, error: "Already sent." };
  if (c.stage !== "scored" || !c.draft_body || !c.draft_subject || !c.draft_kind)
    return { ok: false, status: 409, error: "There's no draft to send yet." };
  if (!c.email) return { ok: false, status: 400, error: "No email address. Add one on the candidate page." };

  const settings = await getSettings();
  if (c.draft_kind === "invite" && !env.testMode() && isCalendarPlaceholder(settings.calendarLink))
    return { ok: false, status: 400, error: "Set the interview calendar link in Settings before sending invites." };

  const subject = personalise(c.draft_subject, c.first_name, settings.calendarLink);
  const text = personalise(c.draft_body, c.first_name, settings.calendarLink);
  if (subject.includes(NAME_TOKEN) || text.includes(NAME_TOKEN))
    return { ok: false, status: 400, error: "The draft still contains [NAME]." };
  if (!env.testMode() && text.includes(LINK_TOKEN))
    return { ok: false, status: 400, error: "The draft still contains {calendar_link}." };

  // Claim atomically so a double-click can't send two emails.
  const { data: claimed } = await db()
    .from("candidates")
    .update({ stage: "sent", sent_at: nowIso(), updated_at: nowIso() })
    .eq("id", id)
    .eq("stage", "scored")
    .select("id");
  if (!claimed?.length) return { ok: false, status: 409, error: "This candidate was just updated. Refresh the page." };

  const { data: row, error } = await db()
    .from("emails")
    .insert({
      candidate_id: id,
      kind: c.draft_kind,
      intended_to: c.email,
      test_mode: env.testMode(),
      subject,
      body_text: text,
      body_html: "",
      status: "queued",
    })
    .select("*")
    .single();

  try {
    if (error || !row) throw new Error(error?.message ?? "could not record the email");
    const result = await deliverEmail({ intendedTo: c.email, subject, text, idempotencyKey: row.id });
    await db()
      .from("emails")
      .update({
        status: "sent",
        simulated: result.status === "simulated",
        sent_at: nowIso(),
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
    await db().from("candidates").update({ stage: "scored", sent_at: null, updated_at: nowIso() }).eq("id", id);
    return { ok: false, status: 502, error: `Email failed, nothing was sent: ${message}` };
  }

  await logEvent(id, `${c.draft_kind}_sent`, "Confirmed by Arjun");
  return { ok: true };
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
