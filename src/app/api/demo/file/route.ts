import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { readDemoFile } from "@/lib/demo/store";

export const runtime = "nodejs";

// Demo mode only: serves a stored CV file (stands in for a Supabase signed URL).
export async function GET(request: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const file = readDemoFile(url.searchParams.get("path") ?? "");
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const name = (url.searchParams.get("name") ?? "cv").replace(/[^\w.\-]+/g, "_");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
