import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { isAdminEmail } from "@/lib/env";

// Refreshes the Supabase session and keeps everything except /login behind
// Arjun's account. Pages and API routes check again on their own.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (isDemoMode()) {
    // Local demo: no login. isDemoMode() is always false on Vercel.
    if (request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/auth/");

  if (!url || !key) {
    if (isPublic) return response;
    return new NextResponse("Supabase is not configured. Fill in .env.local (see .env.example).", { status: 500 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const allowed = isAdminEmail(data.user?.email);

  if (!allowed && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = data.user ? "?error=not_allowed" : "";
    return NextResponse.redirect(login);
  }
  if (allowed && path === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
