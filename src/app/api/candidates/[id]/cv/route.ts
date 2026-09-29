import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { cvDownloadUrl, getCandidate } from "@/lib/pipeline";

export const runtime = "nodejs";

// Redirects to a short-lived signed URL for the original CV file.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const candidate = await getCandidate(id);
  const url = candidate ? await cvDownloadUrl(candidate) : null;
  if (!url) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.redirect(new URL(url, request.url)); // demo mode returns a relative URL
}
