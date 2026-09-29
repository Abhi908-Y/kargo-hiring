import "server-only";
import { DEFAULT_SETTINGS, type Settings } from "@/config/scoring";
import { db } from "@/lib/supabase/server";

export async function getSettings(): Promise<Settings> {
  const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT_SETTINGS };
  return {
    rejectBelow: data.reject_below,
    shortlistAt: data.shortlist_at,
    rescuePatternMin: data.rescue_pattern_min,
    holdHours: Number(data.hold_hours),
    calendarLink: data.calendar_link,
  };
}

export function validateSettings(input: Partial<Record<keyof Settings, unknown>>): Settings | string {
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const s: Settings = {
    rejectBelow: Math.round(n(input.rejectBelow)),
    shortlistAt: Math.round(n(input.shortlistAt)),
    rescuePatternMin: Math.round(n(input.rescuePatternMin)),
    holdHours: n(input.holdHours),
    calendarLink: String(input.calendarLink ?? "").trim(),
  };
  if ([s.rejectBelow, s.shortlistAt, s.rescuePatternMin, s.holdHours].some((v) => !Number.isFinite(v)))
    return "All thresholds must be numbers.";
  if (s.rejectBelow < 0 || s.rejectBelow >= s.shortlistAt) return "Auto-reject bar must be below the shortlist bar.";
  if (s.shortlistAt > 100) return "Shortlist bar can't be above 100.";
  if (s.rescuePatternMin < 0 || s.rescuePatternMin > 60) return "Rescue level must be between 0 and 60.";
  if (s.holdHours <= 0 || s.holdHours > 72) return "Email hold must be between a few minutes and 72 hours.";
  if (!s.calendarLink) s.calendarLink = DEFAULT_SETTINGS.calendarLink;
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({
      id: 1,
      reject_below: s.rejectBelow,
      shortlist_at: s.shortlistAt,
      rescue_pattern_min: s.rescuePatternMin,
      hold_hours: s.holdHours,
      calendar_link: s.calendarLink,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
