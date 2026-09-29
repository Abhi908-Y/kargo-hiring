import { ROLE_TITLES, type Role } from "@/config/scoring";

export type EmailKind = "rejection" | "shortlist";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const SIGNATURE = ["Arjun Mehta", "Founder, Kargo"];

/** A calendar link that is still the placeholder must never reach a real candidate. */
export function isCalendarPlaceholder(link: string | null | undefined): boolean {
  const l = (link ?? "").trim();
  return !l || l === "{calendar_link}" || !/^https?:\/\//i.test(l);
}

export function cleanPersonalLine(line: string | null | undefined): string | null {
  const l = (line ?? "").trim().replace(/\s+/g, " ");
  if (!l) return null;
  if (/[[\]{}]/.test(l)) return null; // placeholders or redaction markers leaked in
  if (l.split(" ").length > 25) return null;
  return /[.!?]$/.test(l) ? l : `${l}.`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toHtml(paragraphs: string[], link?: string): string {
  const body = paragraphs
    .map((p) => {
      let html = escapeHtml(p).replace(/\n/g, "<br>");
      if (link) {
        const safe = escapeHtml(link);
        html = html.replace(safe, `<a href="${safe}" style="color:#0f766e">${safe}</a>`);
      }
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;max-width:560px">${body}</div>`;
}

export function buildEmail(opts: {
  kind: EmailKind;
  firstName: string | null;
  role: Role;
  calendarLink: string;
  personalLine: string | null;
}): EmailContent {
  const greeting = `Hi ${opts.firstName?.trim() || "there"},`;
  const roleTitle = ROLE_TITLES[opts.role];
  const signature = SIGNATURE.join("\n");

  if (opts.kind === "rejection") {
    const paragraphs = [
      greeting,
      `Thank you for applying for the ${roleTitle} role at Kargo, and for the time you put into your application. Unfortunately we're not able to take it forward at this stage.`,
      "I wish you the very best with your search.",
      signature,
    ];
    return {
      subject: `Your application to Kargo`,
      text: paragraphs.join("\n\n"),
      html: toHtml(paragraphs),
    };
  }

  const personal = cleanPersonalLine(opts.personalLine);
  const paragraphs = [
    greeting,
    `Congratulations! You've been shortlisted for the ${roleTitle} role at Kargo, and I'd like to meet you myself for an interview.${personal ? ` ${personal}` : ""}`,
    `Please pick a slot that works for you here: ${opts.calendarLink}`,
    "Looking forward to speaking with you.",
    signature,
  ];
  return {
    subject: `You're shortlisted: interview with Arjun at Kargo`,
    text: paragraphs.join("\n\n"),
    html: toHtml(paragraphs, opts.calendarLink),
  };
}
