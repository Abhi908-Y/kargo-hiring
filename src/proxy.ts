import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { isAdminEmail } from "@/lib/env";
import { authConfigured, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Keeps everything except /login behind Arjun's account.
// Pages and API routes check the session again on their own.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/api/auth/");

  if (isDemoMode()) {
    // Local demo: no login. isDemoMode() is always false on Vercel.
    if (path === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!authConfigured() || !process.env.DATABASE_URL) {
    if (isPublic) return NextResponse.next();
    return new NextResponse(
      "Not configured yet. Add DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET (see .env.example): on Vercel under Project → Settings → Environment Variables (then redeploy), or locally in .env.local.",
      { status: 500 },
    );
  }

  const email = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const allowed = isAdminEmail(email);

  if (!allowed && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (allowed && path === "/login") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
