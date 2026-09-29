import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { regenerateDraft, saveDraft } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

// Save Arjun's edits to a draft, or ask the AI to write it again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; subject?: string; body?: string; kind?: string };
  const result =
    body.action === "regenerate"
      ? await regenerateDraft(id)
      : await saveDraft(id, {
          subject: body.subject ?? "",
          body: body.body ?? "",
          kind: body.kind === "invite" || body.kind === "rejection" ? body.kind : undefined,
        });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
