import crypto from "node:crypto";

// Arjun-only login without a third-party auth service: the email and password
// live in environment variables, and a signed, httpOnly cookie keeps him signed in.
// Used by both the proxy and server code, so no "server-only" import here.

export const SESSION_COOKIE = "kargo_session";
export const SESSION_DAYS = 7;

function secret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function sign(payload: string, key: string) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(email: string): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  const payload = b64url(JSON.stringify({ e: email.toLowerCase(), exp: Date.now() + SESSION_DAYS * 86400_000 }));
  return `${payload}.${sign(payload, key)}`;
}

/** Returns the signed-in email, or null if the cookie is missing, tampered with or expired. */
export function verifySessionToken(token: string | undefined | null): string | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { e, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof e !== "string" || typeof exp !== "number" || exp < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}

const digest = (s: string) => crypto.createHash("sha256").update(s).digest();

/** Constant-time check of the login form against ADMIN_EMAIL / ADMIN_PASSWORD. */
export function checkCredentials(email: string, password: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!adminEmail || adminPassword.length < 8) return false;
  const emailOk = crypto.timingSafeEqual(digest(email.trim().toLowerCase()), digest(adminEmail));
  const passwordOk = crypto.timingSafeEqual(digest(password), digest(adminPassword));
  return emailOk && passwordOk;
}

export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_EMAIL?.trim() && (process.env.ADMIN_PASSWORD ?? "").length >= 8 && secret());
}
