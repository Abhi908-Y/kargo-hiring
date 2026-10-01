import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS } from "@/config/scoring";
import { requireAdminApi } from "@/lib/auth";
import { resortCandidates } from "@/lib/pipeline";
import { saveSettings, validateSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = body.reset ? DEFAULT_SETTINGS : body;
  const settings = validateSettings(input);
  if (typeof settings === "string") return NextResponse.json({ error: settings }, { status: 400 });

  await saveSettings(settings);
  // New thresholds re-sort everyone not yet emailed into the right column.
  const resorted = await resortCandidates();
  return NextResponse.json({ settings, resorted });
}
