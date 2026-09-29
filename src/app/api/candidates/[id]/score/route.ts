import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { scoreAndRoute } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await scoreAndRoute(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const c = result.candidate;
  return NextResponse.json({
    id: c.id,
    stage: c.stage,
    band: c.band,
    total: c.total_score,
    pattern: c.pattern_score,
    role: c.assigned_role,
    scoringError: c.scoring_error,
  });
}
