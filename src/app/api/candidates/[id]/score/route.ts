import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { scoreCandidate } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// Step 1: score one CV against both the PM and SPM rubrics.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await scoreCandidate(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const c = result.candidate;
  return NextResponse.json({
    id: c.id,
    stage: c.stage,
    role: c.assigned_role,
    scorePm: c.score_pm,
    scoreSpm: c.score_spm,
    total: c.total_score,
    band: c.band,
    scoringError: c.scoring_error,
  });
}
