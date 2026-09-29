import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { sendDraft } from "@/lib/pipeline";

export const runtime = "nodejs";

// Step 4: Arjun's Confirm & send. Nothing is emailed without this.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await sendDraft(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
