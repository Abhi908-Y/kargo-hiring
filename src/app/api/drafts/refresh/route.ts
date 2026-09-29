import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { refreshNextDraft } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

// Steps 2 + 3: write the next missing or out-of-date draft (brief + email).
// Called repeatedly by the upload page until remaining is 0.
export async function POST() {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await refreshNextDraft());
}
