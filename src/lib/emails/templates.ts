// Email formatting helpers. Drafts themselves are written in lib/drafting/draft.ts.

/** A calendar link that is still the placeholder must never reach a candidate. */
export function isCalendarPlaceholder(link: string | null | undefined): boolean {
  const l = (link ?? "").trim();
  return !l || l === "{calendar_link}" || !/^https?:\/\//i.test(l);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain-text email body -> simple HTML with clickable links. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      const html = escapeHtml(p)
        .replace(/\n/g, "<br>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0f766e">$1</a>');
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;max-width:560px">${paragraphs}</div>`;
}
