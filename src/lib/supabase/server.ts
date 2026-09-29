import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/demo/mode";
import { demoClient } from "@/lib/demo/store";
import { env } from "@/lib/env";

/** Session-aware client, used only to read who is signed in. */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/** Service-role client for all data access. Only call after requireAdmin(). */
export function db(): SupabaseClient {
  if (isDemoMode()) return demoClient();
  if (!admin) {
    admin = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export const CV_BUCKET = "cvs";
