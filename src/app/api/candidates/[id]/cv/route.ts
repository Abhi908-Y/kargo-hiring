import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { cvFile, getCandidate } from "@/lib/pipeline";

export const runtime = "nodejs";

// Download the original CV file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const candidate = await getCandidate(id);
  const file = candidate ? await cvFile(candidate) : null;
  if (!candidate || !file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const name = candidate.file_name.replace(/[^\w.\-]+/g, "_");
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${name}"` },
  });
}
