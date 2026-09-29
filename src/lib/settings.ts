import "server-only";
import { DEFAULT_SETTINGS, type Settings } from "@/config/scoring";
import { db } from "@/lib/db";

export async function getSettings(): Promise<Settings> {
  const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT_SETTINGS };
  return {
    autoRejectBelow: Number(data.auto_reject_below ?? DEFAULT_SETTINGS.autoRejectBelow),
    autoInviteAbove: Number(data.auto_invite_above ?? DEFAULT_SETTINGS.autoInviteAbove),
    holdHours: Number(data.hold_hours ?? DEFAULT_SETTINGS.holdHours),
    calendarLink: data.calendar_link ?? DEFAULT_SETTINGS.calendarLink,
  };
}

export function validateSettings(input: Partial<Record<keyof Settings, unknown>>): Settings | string {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const s: Settings = {
    autoRejectBelow: Math.round(num(input.autoRejectBelow)),
    autoInviteAbove: Math.round(num(input.autoInviteAbove)),
    holdHours: num(input.holdHours),
    calendarLink: String(input.calendarLink ?? "").trim() || DEFAULT_SETTINGS.calendarLink,
  };
  if (![s.autoRejectBelow, s.autoInviteAbove, s.holdHours].every(Number.isFinite)) return "Thresholds and hold time must be numbers.";
  if (s.autoRejectBelow < 0 || s.autoRejectBelow > 100) return "The auto-reject line must be between 0 and 100.";
  if (s.autoInviteAbove < 0 || s.autoInviteAbove > 100) return "The auto-invite line must be between 0 and 100.";
  if (s.autoRejectBelow > s.autoInviteAbove) return "The auto-reject line must be at or below the auto-invite line.";
  if (s.holdHours < 0 || s.holdHours > 72) return "The hold must be between 0 (send immediately) and 72 hours.";
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({
      id: 1,
      auto_reject_below: s.autoRejectBelow,
      auto_invite_above: s.autoInviteAbove,
      hold_hours: s.holdHours,
      calendar_link: s.calendarLink,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
