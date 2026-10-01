// Pull out contact details (kept for emails, never sent to the AI) and remove
// them from the CV text before scoring. Removes: name, email, phone, links,
// plus date of birth / gender / marital-status style lines and street details.

export interface Contact {
  fullName: string | null;
  firstName: string | null;
  email: string | null;
  phone: string | null;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi;
const PROFILE_RE =
  /\b(?:[a-z]{2,3}\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|instagram\.com|facebook\.com|about\.me|calendly\.com|notion\.site|substack\.com|wa\.me|t\.me|youtube\.com|kaggle\.com|stackoverflow\.com|angel\.co|wellfound\.com|linktr\.ee)(?:\/[^\s<>()[\]{}"']*)?/gi;
// A bare domain followed by a path, e.g. "priya.dev/work" (bare company names like "Amazon.com" are kept).
const DOMAIN_PATH_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|io|dev|me|co|net|org|app|ai|xyz|site|tech|page|link)\/[^\s<>()[\]{}"']*/gi;
// Candidate phone strings; filtered by digit count below.
const PHONE_CANDIDATE_RE = /(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\s?\d{2,5}\s?\)[\s.-]?)?\d[\d\s.-]{7,16}\d/g;
const SENSITIVE_LINE_RE =
  /^[^\S\n]*[-•*]?[^\S\n]*(?:date of birth|d\.?\s?o\.?\s?b\.?|birth ?date|age|gender|sex|marital status|nationality|religion|caste|father'?s name|mother'?s name|spouse|passport(?: no\.?| number)?|aadhaa?r|pan(?: no\.?| number)?)[^\S\n]*[:\-–][^\n]*$/gim;
const ADDRESS_LINE_RE = /^[^\S\n]*(?:address|residential address|permanent address|current address)[^\S\n]*[:\-–][^\n]*$/gim;

const HEADER_STOPWORDS = new Set(
  [
    "resume", "curriculum", "vitae", "cv", "profile", "summary", "contact", "details", "personal",
    "product", "manager", "senior", "engineer", "experience", "education", "skills", "objective",
    "professional", "career", "about", "me", "page", "of", "and", "the", "work", "history", "lead",
    "founder", "analyst", "consultant", "operations", "sales", "marketing", "mumbai", "india",
    "bangalore", "bengaluru", "delhi", "pune", "hyderabad", "chennai", "email", "phone", "mobile",
    "linkedin", "portfolio", "references",
    // institutions and companies are never a person's name
    "school", "matriculation", "matric", "college", "university", "institute", "institution", "academy",
    "vidyalaya", "vidyalayam", "polytechnic", "public", "higher", "secondary", "convent", "campus",
    "technologies", "technology", "solutions", "services", "systems", "software", "labs", "pvt", "ltd",
    "limited", "inc", "llp", "corp", "corporation", "company", "group", "bank", "consulting", "global",
    "international", "foundation", "trust", "hospital", "board", "department", "engineering", "management",
    "business", "studies", "science", "sciences", "arts", "commerce", "for", "in", "at",
  ],
);
const FILENAME_JUNK = new Set([
  "cv", "resume", "final", "updated", "new", "latest", "pm", "spm", "copy", "draft", "v1", "v2", "v3",
  "product", "manager", "senior", "application", "kargo", "profile", "doc", "docx", "pdf",
  "past", "hire", "hires", "candidate", "applicant", "sample", "test", "example", "retained",
  "engineering", "ops", "cs", "customer", "success", "marketing", "sales", "role",
]);

const NAME_WORD_RE = /^[A-Z][a-zA-Z'’.-]*$|^[A-Z]{2,}$/;

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

function looksLikePhone(candidate: string): boolean {
  const digits = digitsOnly(candidate);
  if (digits.length < 10 || digits.length > 13) return false;
  // Year ranges such as "2019 - 2023 2024" are not phones.
  const groups = candidate.trim().split(/[\s.-]+/).filter(Boolean);
  if (groups.length > 1 && groups.every((g) => /^(19|20)\d{2}$/.test(g))) return false;
  return true;
}

function findPhones(text: string): string[] {
  return (text.match(PHONE_CANDIDATE_RE) ?? []).map((m) => m.trim()).filter(looksLikePhone);
}

function tokensFromFileName(fileName: string): string[] {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_.\-()[\]]+/)
    .filter(
      (t) =>
        /^[A-Za-z]{2,}$/.test(t) &&
        !FILENAME_JUNK.has(t.toLowerCase()) &&
        !HEADER_STOPWORDS.has(t.toLowerCase()),
    );
}

function isNameLine(line: string): boolean {
  if (line.length > 45 || /[@\d|/:]/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => NAME_WORD_RE.test(w))) return false;
  if (words.some((w) => HEADER_STOPWORDS.has(w.toLowerCase().replace(/[.'’]/g, "")))) return false;
  return true;
}

function titleWord(w: string): string {
  const rest = w.slice(1);
  const plain = rest === rest.toUpperCase() || rest === rest.toLowerCase();
  return w.charAt(0).toUpperCase() + (plain ? rest.toLowerCase() : rest);
}

function toTitleCase(name: string): string {
  return name.split(/\s+/).map(titleWord).join(" ");
}

export function detectName(text: string, fileName: string): string | null {
  const labelled = text.match(/^[^\S\n]*(?:full\s+)?name[^\S\n]*[:\-–][^\S\n]*([^\n]{2,45})$/im);
  if (labelled && isNameLine(labelled[1].trim())) return toTitleCase(labelled[1].trim());

  const headerLines = text
    .split("\n")
    .map((l) => l.replace(/^[\s•*\-–]+|[\s•*\-–,|]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const fileTokens = tokensFromFileName(fileName).map((t) => t.toLowerCase());

  const candidates = headerLines.filter(isNameLine);
  const matchingFile = candidates.find((l) =>
    l.split(/\s+/).some((w) => fileTokens.includes(w.toLowerCase())),
  );
  if (matchingFile) return toTitleCase(matchingFile);
  // No header line matches the file name: a name in the file name (e.g. "16_shiva_kumar.pdf")
  // is more reliable than guessing from whatever line happens to be at the top.
  const fileName2 = tokensFromFileName(fileName);
  if (fileName2.length >= 2 && fileName2.length <= 3) return toTitleCase(fileName2.join(" "));
  if (candidates.length) return toTitleCase(candidates[0]);

  // Single-word header line that matches the file name, e.g. "PRIYA" + "Priya_Sharma_CV.pdf".
  const single = headerLines.find((l) => /^[A-Za-z'’-]{2,}$/.test(l) && fileTokens.includes(l.toLowerCase()));
  if (single && fileTokens.length >= 2) {
    const tokens = tokensFromFileName(fileName);
    return toTitleCase(tokens.slice(0, 3).join(" "));
  }

  const fromFile = tokensFromFileName(fileName);
  if (fromFile.length >= 2 && fromFile.length <= 3) return toTitleCase(fromFile.join(" "));
  return null;
}

export function extractContact(text: string, fileName: string): Contact {
  const email = text.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  const phone = findPhones(text)[0] ?? null;
  const fullName = detectName(text, fileName);
  const firstName = fullName ? fullName.split(/\s+/)[0] : null;
  return { fullName, firstName, email, phone };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactCv(text: string, contact: Contact, fileName: string): string {
  let out = text;

  out = out.replace(SENSITIVE_LINE_RE, "[PERSONAL DETAIL REMOVED]");
  out = out.replace(ADDRESS_LINE_RE, (line) => {
    // Keep only the city/region (last one or two comma parts) so location flags still work.
    const value = line.split(/[:\-–]/).slice(1).join(" ");
    const parts = value.split(",").map((p) => p.replace(/\b\d{5,6}\b/g, "").trim()).filter(Boolean);
    const tail = parts.slice(-2).filter((p) => !/\d/.test(p)).join(", ");
    return tail ? `Location: ${tail}` : "[ADDRESS REMOVED]";
  });

  out = out.replace(EMAIL_RE, "[EMAIL]");
  out = out.replace(URL_RE, "[LINK]");
  out = out.replace(PROFILE_RE, "[LINK]");
  out = out.replace(DOMAIN_PATH_RE, "[LINK]");
  for (const phone of findPhones(out)) out = out.split(phone).join("[PHONE]");

  // Name: full name first, then each part (case-sensitive for Title Case and
  // UPPER CASE forms so ordinary words like "will" are not touched).
  const nameParts = new Set<string>();
  if (contact.fullName) {
    for (const form of new Set([contact.fullName, toTitleCase(contact.fullName), contact.fullName.toUpperCase()])) {
      const pattern = form.split(/\s+/).map(escapeRe).join("\\s+");
      out = out.replace(new RegExp(`(?<![A-Za-z])${pattern}(?![A-Za-z])`, "g"), "[NAME]");
    }
    contact.fullName.split(/\s+/).forEach((p) => p.length >= 2 && nameParts.add(p.replace(/\.$/, "")));
  }
  tokensFromFileName(fileName).forEach((t) => nameParts.add(t));
  for (const part of nameParts) {
    const title = titleWord(part);
    for (const form of new Set([part, title, part.toUpperCase()])) {
      out = out.replace(new RegExp(`(?<![A-Za-z])${escapeRe(form)}(?![A-Za-z])`, "g"), "[NAME]");
    }
  }
  out = out.replace(/\[NAME\](?:\s*\[NAME\])+/g, "[NAME]");

  return out;
}

/** Stable hash input for duplicate detection: case/whitespace-insensitive. */
export function normaliseForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
