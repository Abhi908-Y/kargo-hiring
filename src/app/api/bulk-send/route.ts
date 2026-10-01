import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { bulkSend } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Send to all" on the Auto-selected (invites) or Auto-rejected (rejections) column.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { column } = (await request.json().catch(() => ({}))) as { column?: string };
  if (column !== "auto_selected" && column !== "auto_rejected")
    return NextResponse.json({ error: "column must be auto_selected or auto_rejected" }, { status: 400 });
  return NextResponse.json(await bulkSend(column));
}
