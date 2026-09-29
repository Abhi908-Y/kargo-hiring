import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { decide } from "@/lib/pipeline";

export const runtime = "nodejs";

// Arjun's Approve / Reject: the email goes out immediately.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "approve" && action !== "reject")
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });

  const result = await decide(id, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ stage: result.candidate.stage });
}
