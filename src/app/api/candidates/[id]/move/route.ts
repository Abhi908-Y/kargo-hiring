import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { moveToReview, refreshNextDraft } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

// Move an auto-selected or auto-rejected candidate to Review (and keep them there).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await moveToReview(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // Review needs both drafts: write the one that's missing now.
  await refreshNextDraft();
  return NextResponse.json({ ok: true });
}
