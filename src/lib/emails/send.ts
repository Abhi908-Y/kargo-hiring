import { Resend } from "resend";
import { env } from "@/lib/env";
import { textToHtml } from "./templates";

export interface DeliveryResult {
  status: "sent" | "simulated";
  resendId: string | null;
  deliveredTo: string;
  fromAddress: string;
  subject: string;
  text: string;
  html: string;
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
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<DeliveryResult> {
  const { to, testMode } = resolveRecipient(opts.intendedTo);
  const fromAddress = `${env.emailFromName()} <${env.emailFrom()}>`;
  const subject = testMode ? `[TEST for ${opts.intendedTo}] ${opts.subject}` : opts.subject;
  const banner = `TEST MODE: in live mode this email would go to ${opts.intendedTo}.`;
  const text = testMode ? `${banner}\n\n${opts.text}` : opts.text;
  const html = testMode
    ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-family:sans-serif;font-size:13px">${banner}</p>${textToHtml(opts.text)}`
    : textToHtml(opts.text);

  const key = env.resendApiKey();
  if (!key) return { status: "simulated", resendId: null, deliveredTo: to, fromAddress, subject, text, html, testMode };

  const replyTo = env.emailReplyTo();
  const { data, error } = await getResend(key).emails.send(
    { from: fromAddress, to, subject, text, html, ...(replyTo ? { replyTo } : {}) },
    { idempotencyKey: opts.idempotencyKey },
  );
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);
  return { status: "sent", resendId: data.id, deliveredTo: to, fromAddress, subject, text, html, testMode };
}
