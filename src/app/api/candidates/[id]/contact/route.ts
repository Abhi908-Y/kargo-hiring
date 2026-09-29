import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { updateContact } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { fullName?: string; email?: string };
  const result = await updateContact(id, { fullName: body.fullName, email: body.email });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
