import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { DEMO_USER, isDemoMode } from "@/lib/demo/mode";
import { isAdminEmail } from "@/lib/env";
import { createSessionClient } from "@/lib/supabase/server";

async function currentAdminEmail(): Promise<string | null> {
  if (isDemoMode()) return DEMO_USER; // local-only, see lib/demo/mode.ts
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? null;
  return isAdminEmail(email) ? email : null;
}

/** For pages and layouts: redirect to /login unless Arjun is signed in. */
export async function requireAdmin(): Promise<string> {
  const email = await currentAdminEmail();
  if (!email) redirect("/login");
  return email;
}

/** For route handlers: returns a 401 response if not signed in as Arjun. */
export async function requireAdminApi(): Promise<{ email: string } | { response: NextResponse }> {
  const email = await currentAdminEmail();
  if (!email) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { email };
}
