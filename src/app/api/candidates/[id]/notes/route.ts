import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { addNote, deleteNote } from "@/lib/notes";

export const runtime = "nodejs";

// Add a note to a candidate, or delete one: { body } or { action: "delete", noteId }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { body?: string; action?: string; noteId?: number };
  const error =
    body.action === "delete" ? await deleteNote(id, Number(body.noteId)) : await addNote(id, String(body.body ?? ""));
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
