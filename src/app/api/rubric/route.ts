import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { recomputeTotals } from "@/lib/pipeline";
import { resetRubric, saveRubric, type RubricEdit } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 120;

// Save the Rubric page. Weight changes re-total every candidate straight away (no AI calls);
// name/description changes are used from the next scoring call.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { reset?: boolean; criteria?: RubricEdit[] };
  const error = body.reset ? await resetRubric() : await saveRubric(body.criteria ?? []);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const recalculated = await recomputeTotals();
  return NextResponse.json({ ok: true, recalculated });
}
