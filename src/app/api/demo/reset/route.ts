import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { resetDemoData } from "@/lib/demo/store";

export const runtime = "nodejs";

// Demo mode only: wipes .demo-data/ so you can start again.
export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  resetDemoData();
  return NextResponse.json({ ok: true });
}
