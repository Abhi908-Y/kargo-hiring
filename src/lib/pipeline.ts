import "server-only";
import crypto from "node:crypto";
import { type Role, type Settings } from "@/config/scoring";
import { buildEmail, isCalendarPlaceholder, type EmailKind } from "@/lib/emails/templates";
import { cancelScheduledEmail, deliverEmail } from "@/lib/emails/send";
import { env } from "@/lib/env";
import { extractCvText, fileTypeFromName, MAX_FILE_BYTES } from "@/lib/extract";
import { extractContact, normaliseForHash, redactCv } from "@/lib/redact";
import { routeCandidate } from "@/lib/routing";
import { isDemoMode } from "@/lib/demo/mode";
import { demoScoreCv } from "@/lib/scoring/demo";
import { scoreCv } from "@/lib/scoring/score";
import { getSettings } from "@/lib/settings";
import { CV_BUCKET, db } from "@/lib/supabase/server";
import type { Candidate, EmailRow, Stage } from "@/lib/types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const sha256 = (data: Uint8Array | string) => crypto.createHash("sha256").update(data).digest("hex");
const nowIso = () => new Date().toISOString();

export async function logEvent(candidateId: string, action: string, detail?: string) {
  await db().from("candidate_events").insert({ candidate_id: candidateId, action, detail: detail ?? null });
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const { data } = await db().from("candidates").select("*").eq("id", id).maybeSingle();
  return (data as Candidate) ?? null;
}

// ---------------------------------------------------------------------------
// 1. Upload: extract, dedupe, redact, store
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
  const safeName = opts.fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
  const filePath = `${id}/${safeName}`;
  const upload = await db()
    .storage.from(CV_BUCKET)
    .upload(filePath, opts.bytes, {
      contentType:
        type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
  if (upload.error) return { ok: false, status: 500, error: `File storage failed: ${upload.error.message}` };

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
    await db().storage.from(CV_BUCKET).remove([filePath]);
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
// 2. Score + route (+ schedule auto emails)
// ---------------------------------------------------------------------------

export async function scoreAndRoute(id: string): Promise<Result<{ candidate: Candidate }>> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage !== "processing" && c.stage !== "review")
    return { ok: false, status: 409, error: "This candidate already has a decision in progress." };

  const settings = await getSettings();

  let scored;
  try {
    const scorer = isDemoMode() && !process.env.ANTHROPIC_API_KEY ? demoScoreCv : scoreCv;
    scored = await scorer({ candidateId: c.id, taggedRole: c.tagged_role, redactedText: c.redacted_text });
  } catch (e) {
    const message = (e as Error).message;
    await db()
      .from("candidates")
      .update({
        stage: "review",
        band: "review",
        scoring_error: message,
        route_reasons: ["Scoring failed, so this CV needs a manual look. Use \"Retry scoring\" or decide from the CV."],
        updated_at: nowIso(),
      })
      .eq("id", id);
    await logEvent(id, "scoring_failed", message);
    return { ok: true, candidate: (await getCandidate(id))! };
  }

  const ai = scored.output;
  const route = routeCandidate({
    scores: ai.scores,
    taggedRole: c.tagged_role,
    aiFlags: ai.flags,
    extractionWarning: c.extraction_warning,
    settings,
  });

  const flags = new Set(ai.flags.map((f) => f.trim()).filter(Boolean));
  if (c.extraction_warning) flags.add("low_extraction_confidence");

  const dimensionScores = Object.fromEntries(
    Object.entries(ai.scores).map(([k, v]) => [k, { ...v, score: route.scores[k as keyof typeof route.scores] }]),
  );

  const { error } = await db()
    .from("candidates")
    .update({
      stage: "review",
      band: route.band,
      route_reasons: route.reasons,
      rescued: route.rescued,
      assigned_role: route.assignedRole,
      role_source: route.roleSource,
      role_reasoning: ai.role_reasoning,
      role_mismatch: route.roleMismatch,
      pattern_score: route.pattern,
      role_fit_score: route.roleFit,
      total_score: route.total,
      total_other_role: route.totalOtherRole,
      dimension_scores: dimensionScores,
      brief: ai.brief,
      personal_line: ai.personal_line,
      flags: [...flags],
      ai_raw: ai,
      model: scored.model,
      scored_at: nowIso(),
      scoring_error: null,
      updated_at: nowIso(),
    })
    .eq("id", id);
  if (error) return { ok: false, status: 500, error: error.message };
  await logEvent(id, "scored", `Total ${route.total} (pattern ${route.pattern}, role fit ${route.roleFit}) as ${route.assignedRole}: ${route.band}`);

  if (route.band !== "review") {
    const kind: EmailKind = route.band === "auto_reject" ? "rejection" : "shortlist";
    const blocker = autoSendBlocker(await getCandidate(id), kind, settings);
    if (blocker) {
      await appendReason(id, `Moved to review instead of auto-${kind === "rejection" ? "reject" : "shortlist"}: ${blocker}`);
    } else {
      const scheduledAt = new Date(Date.now() + settings.holdHours * 3600_000);
      try {
        await createAndDeliverEmail({ candidate: (await getCandidate(id))!, kind, trigger: "auto", scheduledAt, settings });
        const stage: Stage = kind === "rejection" ? "reject_pending" : "shortlist_pending";
        await db()
          .from("candidates")
          .update({ stage, decided_by: "auto", decided_at: nowIso(), email_scheduled_for: scheduledAt.toISOString(), updated_at: nowIso() })
          .eq("id", id)
          .eq("stage", "review");
        await logEvent(id, `auto_${kind}_scheduled`, `Email held until ${scheduledAt.toISOString()}`);
      } catch (e) {
        await appendReason(id, `Moved to review: the ${kind} email couldn't be scheduled (${(e as Error).message}).`);
      }
    }
  }

  return { ok: true, candidate: (await getCandidate(id))! };
}

function autoSendBlocker(c: Candidate | null, kind: EmailKind, settings: Settings): string | null {
  if (!c) return "candidate disappeared";
  if (!c.email) return "no email address was found in the CV. Add one on this page.";
  if (kind === "shortlist" && !env.testMode() && isCalendarPlaceholder(settings.calendarLink))
    return "the calendar link isn't set yet (Settings).";
  return null;
}

async function appendReason(id: string, reason: string) {
  const c = await getCandidate(id);
  await db()
    .from("candidates")
    .update({ route_reasons: [...(c?.route_reasons ?? []), reason], updated_at: nowIso() })
    .eq("id", id);
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export function previewEmail(c: Candidate, kind: EmailKind, settings: Settings) {
  return buildEmail({
    kind,
    firstName: c.first_name,
    role: c.assigned_role ?? c.tagged_role ?? "PM",
    calendarLink: settings.calendarLink,
    personalLine: c.personal_line,
  });
}

async function createAndDeliverEmail(opts: {
  candidate: Candidate;
  kind: EmailKind;
  trigger: "auto" | "arjun";
  scheduledAt?: Date;
  settings: Settings;
}): Promise<EmailRow> {
  const c = opts.candidate;
  if (!c.email) throw new Error("no email address");
  const content = previewEmail(c, opts.kind, opts.settings);

  const { data: row, error } = await db()
    .from("emails")
    .insert({
      candidate_id: c.id,
      kind: opts.kind,
      trigger: opts.trigger,
      intended_to: c.email,
      test_mode: env.testMode(),
      subject: content.subject,
      body_text: content.text,
      body_html: content.html,
      status: "queued",
      scheduled_for: opts.scheduledAt?.toISOString() ?? null,
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(error?.message ?? "could not record email");

  try {
    const result = await deliverEmail({
      intendedTo: c.email,
      content,
      scheduledAt: opts.scheduledAt,
      idempotencyKey: row.id,
    });
    const simulated = result.status === "simulated";
    const { data: updated } = await db()
      .from("emails")
      .update({
        status: opts.scheduledAt ? "scheduled" : "sent",
        simulated,
        sent_at: opts.scheduledAt ? null : nowIso(),
        resend_id: result.resendId,
        delivered_to: result.deliveredTo,
        from_address: result.fromAddress,
        subject: result.subject,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return updated as EmailRow;
  } catch (e) {
    await db().from("emails").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 3. Arjun's decisions
// ---------------------------------------------------------------------------

export async function decide(id: string, action: "approve" | "reject"): Promise<Result<{ candidate: Candidate }>> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage === "reject_pending" || c.stage === "shortlist_pending")
    return { ok: false, status: 409, error: "An email is already scheduled. Use Undo first." };
  if (c.stage !== "review") return { ok: false, status: 409, error: "This candidate already has a final decision." };
  if (!c.email) return { ok: false, status: 400, error: "Add the candidate's email address first." };

  const settings = await getSettings();
  const kind: EmailKind = action === "approve" ? "shortlist" : "rejection";
  if (kind === "shortlist" && !env.testMode() && isCalendarPlaceholder(settings.calendarLink))
    return { ok: false, status: 400, error: "Set the calendar link in Settings before shortlisting." };

  const target: Stage = action === "approve" ? "shortlisted" : "rejected";
  // Claim the candidate atomically so a double-click can't send two emails.
  const { data: claimed } = await db()
    .from("candidates")
    .update({ stage: target, decided_by: "arjun", decided_at: nowIso(), email_scheduled_for: null, updated_at: nowIso() })
    .eq("id", id)
    .eq("stage", "review")
    .select("id");
  if (!claimed?.length) return { ok: false, status: 409, error: "This candidate was just updated. Refresh the page." };

  try {
    await createAndDeliverEmail({ candidate: c, kind, trigger: "arjun", settings });
  } catch (e) {
    await db()
      .from("candidates")
      .update({ stage: "review", decided_by: null, decided_at: null, updated_at: nowIso() })
      .eq("id", id);
    return { ok: false, status: 502, error: `Email failed, nothing was sent: ${(e as Error).message}` };
  }

  await logEvent(id, action === "approve" ? "approved" : "rejected", "Decision by Arjun; email sent immediately");
  return { ok: true, candidate: (await getCandidate(id))! };
}

export async function undo(id: string): Promise<Result<{ candidate: Candidate }>> {
  const c = await getCandidate(id);
  if (!c) return { ok: false, status: 404, error: "Candidate not found." };
  if (c.stage !== "reject_pending" && c.stage !== "shortlist_pending")
    return { ok: false, status: 409, error: "There's no scheduled email to undo." };
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
  await db()
    .from("candidates")
    .update({
      stage: "review",
      decided_by: null,
      decided_at: null,
      email_scheduled_for: null,
      route_reasons: [...c.route_reasons, "Undo by Arjun: email cancelled and moved to review."],
      updated_at: nowIso(),
    })
    .eq("id", id);
  await logEvent(id, "undo", "Scheduled email cancelled; moved to review");
  return { ok: true, candidate: (await getCandidate(id))! };
}

/** Mark held emails whose time has passed as sent. Called on page loads (no cron needed). */
export async function finalizeDue(): Promise<void> {
  const now = nowIso();
  await Promise.all([
    db().from("candidates").update({ stage: "rejected" }).eq("stage", "reject_pending").lte("email_scheduled_for", now),
    db().from("candidates").update({ stage: "shortlisted" }).eq("stage", "shortlist_pending").lte("email_scheduled_for", now),
  ]);
  const { data: due } = await db().from("emails").select("id, scheduled_for").eq("status", "scheduled").lte("scheduled_for", now);
  await Promise.all(
    (due ?? []).map((e) => db().from("emails").update({ status: "sent", sent_at: e.scheduled_for }).eq("id", e.id)),
  );
}

export async function updateContact(
  id: string,
  input: { fullName?: string; email?: string },
): Promise<Result<{ candidate: Candidate }>> {
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
  return { ok: true, candidate: (await getCandidate(id))! };
}

export async function cvDownloadUrl(c: Candidate): Promise<string | null> {
  if (!c.file_path) return null;
  const { data } = await db().storage.from(CV_BUCKET).createSignedUrl(c.file_path, 300, { download: c.file_name });
  return data?.signedUrl ?? null;
}
