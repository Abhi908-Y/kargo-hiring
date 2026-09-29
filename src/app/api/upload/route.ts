import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { ingestCv } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// One CV per request: extract text, skip duplicates, remove personal details, store.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  const role = String(form.get("role") ?? "untagged");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (!["PM", "SPM", "untagged"].includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

  const result = await ingestCv({
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    taggedRole: role === "untagged" ? null : (role as "PM" | "SPM"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id, warning: result.warning });
}
