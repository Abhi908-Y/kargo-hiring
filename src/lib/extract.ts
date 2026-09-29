// Text extraction for .pdf and .docx CVs, plus a quality check so garbled or
// scanned CVs go to review instead of being scored as if they were empty.

import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export type CvFileType = "pdf" | "docx";

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel request bodies are capped at 4.5 MB

export function fileTypeFromName(name: string): CvFileType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

export interface Extraction {
  text: string;
  pages: number | null;
  /** non-null when the text looks unreliable (scanned, garbled, near-empty) */
  warning: string | null;
}

export async function extractCvText(data: Uint8Array, type: CvFileType): Promise<Extraction> {
  let text: string;
  let pages: number | null = null;

  if (type === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const result = await extractPdfText(pdf, { mergePages: true });
    text = result.text;
    pages = result.totalPages;
  } else {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    text = result.value;
  }

  text = normaliseWhitespace(text);
  return { text, pages, warning: assessQuality(text, pages) };
}

export function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[  -​]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assessQuality(text: string, pages: number | null): string | null {
  const chars = text.replace(/\s/g, "").length;
  if (chars < 300) return "very little text could be read, so it may be a scanned or image-only CV";
  if (pages && chars / pages < 150) return "very little text per page, so it may be partly scanned";

  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters / chars < 0.55) return "the text looks garbled (few readable letters)";

  const words = text.split(/\s+/).filter(Boolean);
  const longJunk = words.filter((w) => w.length > 30 && !/^https?:/i.test(w)).length;
  if (longJunk / words.length > 0.05) return "the text looks garbled (words run together)";

  return null;
}
