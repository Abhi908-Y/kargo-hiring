import { Resend } from "resend";
import { env } from "@/lib/env";
import type { EmailContent } from "./templates";

export interface DeliveryResult {
  status: "sent" | "scheduled" | "simulated";
  resendId: string | null;
  deliveredTo: string;
  fromAddress: string;
  subject: string;
  testMode: boolean;
}

let resend: Resend | null = null;
function getResend(key: string) {
  if (!resend) resend = new Resend(key);
  return resend;
}

/** Where an email will really go, given TEST_MODE. */
export function resolveRecipient(intendedTo: string): { to: string; testMode: boolean } {
  if (!env.testMode()) return { to: intendedTo, testMode: false };
  const testTo = env.testModeEmail();
  if (!testTo) throw new Error("TEST_MODE is on but TEST_MODE_EMAIL is not set.");
  return { to: testTo, testMode: true };
}

export async function deliverEmail(opts: {
  intendedTo: string;
  content: EmailContent;
  scheduledAt?: Date;
  idempotencyKey: string;
}): Promise<DeliveryResult> {
  const { to, testMode } = resolveRecipient(opts.intendedTo);
  const fromAddress = `${env.emailFromName()} <${env.emailFrom()}>`;
  const subject = testMode ? `[TEST for ${opts.intendedTo}] ${opts.content.subject}` : opts.content.subject;
  const testBanner = `TEST MODE: in live mode this email would go to ${opts.intendedTo}.`;
  const text = testMode ? `${testBanner}\n\n${opts.content.text}` : opts.content.text;
  const html = testMode
    ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-family:sans-serif;font-size:13px">${testBanner}</p>${opts.content.html}`
    : opts.content.html;

  const key = env.resendApiKey();
  if (!key) {
    return { status: "simulated", resendId: null, deliveredTo: to, fromAddress, subject, testMode };
  }

  const replyTo = env.emailReplyTo();
  const { data, error } = await getResend(key).emails.send(
    {
      from: fromAddress,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt.toISOString() } : {}),
    },
    { idempotencyKey: opts.idempotencyKey },
  );
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);

  return {
    status: opts.scheduledAt ? "scheduled" : "sent",
    resendId: data.id,
    deliveredTo: to,
    fromAddress,
    subject,
    testMode,
  };
}

/** Cancel a scheduled email. Returns an error message, or null on success. */
export async function cancelScheduledEmail(resendId: string | null): Promise<string | null> {
  if (!resendId) return null; // simulated email: nothing to cancel remotely
  const key = env.resendApiKey();
  if (!key) return null;
  const { error } = await getResend(key).emails.cancel(resendId);
  return error ? error.message : null;
}
