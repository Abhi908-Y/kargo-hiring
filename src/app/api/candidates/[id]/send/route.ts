import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { sendDraft } from "@/lib/pipeline";

export const runtime = "nodejs";

// Review queue: Arjun sends the invite or the rejection. It goes out immediately.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { kind } = (await request.json().catch(() => ({}))) as { kind?: string };
  if (kind !== "invite" && kind !== "rejection") return NextResponse.json({ error: "kind must be invite or rejection" }, { status: 400 });
  const result = await sendDraft(id, kind);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
