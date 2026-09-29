import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { undo } from "@/lib/pipeline";

export const runtime = "nodejs";

// Cancel a held auto-reject / auto-shortlist email and move the candidate to review.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await undo(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ stage: result.candidate.stage });
}
