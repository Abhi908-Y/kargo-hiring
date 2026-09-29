import "server-only";
import { DEFAULT_SETTINGS, type Settings } from "@/config/scoring";
import { db } from "@/lib/db";

export async function getSettings(): Promise<Settings> {
  const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT_SETTINGS };
  return { topN: Number(data.top_n), calendarLink: data.calendar_link };
}

export function validateSettings(input: Partial<Record<keyof Settings, unknown>>): Settings | string {
  const topN = Math.round(Number(input.topN));
  if (!Number.isFinite(topN) || topN < 1 || topN > 100) return "Top candidates per role must be between 1 and 100.";
  const calendarLink = String(input.calendarLink ?? "").trim() || DEFAULT_SETTINGS.calendarLink;
  return { topN, calendarLink };
}

export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({ id: 1, top_n: s.topN, calendar_link: s.calendarLink, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
