// Central place for environment configuration.

import { isDemoMode } from "@/lib/demo/mode";

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  adminEmail: () => required("ADMIN_EMAIL").toLowerCase(),

  resendApiKey: () => process.env.RESEND_API_KEY?.trim() || null,
  emailFrom: () => process.env.EMAIL_FROM_ADDRESS?.trim() || "onboarding@resend.dev",
  emailFromName: () => process.env.EMAIL_FROM_NAME?.trim() || "Arjun Mehta",
  emailReplyTo: () => process.env.EMAIL_REPLY_TO?.trim() || null,

  /** TEST_MODE is ON unless explicitly set to "false". Safe by default. */
  testMode: () => (process.env.TEST_MODE ?? "").trim().toLowerCase() !== "false",
  testModeEmail: () => process.env.TEST_MODE_EMAIL?.trim() || (isDemoMode() ? "test-inbox@demo.local" : null),
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(admin && email && email.toLowerCase() === admin);
}

/** Config problems worth showing on the dashboard. */
export function configWarnings(): string[] {
  const w: string[] = [];
  if (isDemoMode()) {
    w.push("Demo mode: data is saved on this computer (.demo-data/), there is no login, and emails are only recorded, never sent.");
    if (!process.env.GEMINI_API_KEY)
      w.push("No GEMINI_API_KEY yet, so CVs are scored by a simple keyword heuristic, NOT the rubric AI. Treat the numbers as placeholders.");
    return w;
  }
  if (!process.env.GEMINI_API_KEY) w.push("GEMINI_API_KEY is not set, so CVs can't be scored.");
  if (!env.resendApiKey()) w.push("RESEND_API_KEY is not set. Emails are simulated (logged here, not delivered).");
  if (env.testMode() && !env.testModeEmail()) w.push("TEST_MODE is on but TEST_MODE_EMAIL is empty, so emails will fail.");
  if (!env.testMode() && !process.env.EMAIL_FROM_ADDRESS) w.push("TEST_MODE is off but EMAIL_FROM_ADDRESS is not set to your verified domain.");
  return w;
}
