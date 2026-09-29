// Scoring configuration. Default rubric: src/config/rubric.ts (editable later
// on the Rubric page; stored in the rubric_criteria table).

export const DEFAULT_SETTINGS = {
  /** total (out of 100) below this -> rejection email sent automatically */
  autoRejectBelow: 30,
  /** total (out of 100) above this -> interview invite sent automatically */
  autoInviteAbove: 80,
  /** automatic emails are held this long so Arjun can Undo (0 = send immediately) */
  holdHours: 4,
  /** link candidates use to pick an interview slot (fills {calendar_link} in invites) */
  calendarLink: "{calendar_link}",
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Tagged CV: flag a mismatch when the other role's B1 is at least this much higher (in B1 points). */
export const ROLE_MISMATCH_GAP = 8;

/** Pattern points (A1–A5, out of 60) at which a rejection gets a "check before rejecting" warning. */
export const STRONG_PATTERN_MIN = 30;

/** Default Gemini model; override with the GEMINI_MODEL env var (e.g. gemini-3.1-pro-preview). */
export const GEMINI_MODEL = "gemini-3.8-flash";

export type Role = "PM" | "SPM";
export const ROLES: Role[] = ["PM", "SPM"];

export const ROLE_TITLES: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

/**
 * The 8 things the AI scores, each on its rubric scale (0..max). A role's
 * total is the weighted sum of its 7 dimensions (B1 differs by role), using
 * the weights on the Rubric page.
 */
export const DIMENSIONS = [
  { key: "A1_fixes_unasked", code: "A1", max: 15, roles: ["PM", "SPM"] },
  { key: "A2_owns_the_call", code: "A2", max: 15, roles: ["PM", "SPM"] },
  { key: "A3_ground_ops", code: "A3", max: 12, roles: ["PM", "SPM"] },
  { key: "A4_steady_under_fire", code: "A4", max: 8, roles: ["PM", "SPM"] },
  { key: "A5_writes_down_why", code: "A5", max: 10, roles: ["PM", "SPM"] },
  { key: "B1_product_ownership_pm", code: "B1", max: 25, roles: ["PM"] },
  { key: "B1_product_ownership_spm", code: "B1", max: 25, roles: ["SPM"] },
  { key: "B2_thrives_without_structure", code: "B2", max: 15, roles: ["PM", "SPM"] },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];
export const PATTERN_KEYS: DimensionKey[] = ["A1_fixes_unasked", "A2_owns_the_call", "A3_ground_ops", "A4_steady_under_fire", "A5_writes_down_why"];
export const PATTERN_MAX = 60;

export function dimensionsForRole(role: Role) {
  return DIMENSIONS.filter((d) => (d.roles as readonly Role[]).includes(role));
}
