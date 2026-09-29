// Scoring and routing defaults. These mirror rubric/arjun_rubric.md.
// Thresholds can be tuned from the Settings page (stored in the database);
// the values here are the defaults used when nothing has been saved yet.

export const DEFAULT_SETTINGS = {
  /** total < rejectBelow -> auto-reject (unless rescued) */
  rejectBelow: 40,
  /** total >= shortlistAt -> auto-shortlist */
  shortlistAt: 90,
  /** pattern >= rescuePatternMin -> never auto-reject */
  rescuePatternMin: 30,
  /** how long auto-reject / auto-shortlist emails are held before sending */
  holdHours: 4,
  /** link candidates use to pick an interview slot */
  calendarLink: "{calendar_link}",
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Tagged CV: flag a mismatch when the other role's B1 is at least this much higher. */
export const ROLE_MISMATCH_GAP = 8;

export const MODEL = "claude-sonnet-5";

export type Role = "PM" | "SPM";

export const ROLE_TITLES: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

export const PATTERN_DIMENSIONS = [
  { key: "A1_fixes_unasked", code: "A1", label: "Fixes what nobody asked them to fix", max: 15, anchors: [0, 5, 10, 15] },
  { key: "A2_owns_the_call", code: "A2", label: "Owns the call with no layer above", max: 15, anchors: [0, 5, 10, 15] },
  { key: "A3_ground_ops", code: "A3", label: "Has been on the ground in operations", max: 12, anchors: [0, 4, 8, 12] },
  { key: "A4_steady_under_fire", code: "A4", label: "Stays steady when things break", max: 8, anchors: [0, 4, 8] },
  { key: "A5_writes_down_why", code: "A5", label: "Writes down why", max: 10, anchors: [0, 4, 7, 10] },
] as const;

export const ROLE_FIT_DIMENSIONS = [
  { key: "B1_product_ownership_pm", code: "B1 (PM bar)", label: "Product ownership at PM level", max: 25, anchors: [0, 8, 16, 25] },
  { key: "B1_product_ownership_spm", code: "B1 (SPM bar)", label: "Product ownership at Senior PM level", max: 25, anchors: [0, 8, 16, 25] },
  { key: "B2_thrives_without_structure", code: "B2", label: "Thrives without structure", max: 15, anchors: [0, 5, 10, 15] },
] as const;

export const ALL_DIMENSIONS = [...PATTERN_DIMENSIONS, ...ROLE_FIT_DIMENSIONS];
export type DimensionKey = (typeof ALL_DIMENSIONS)[number]["key"];

export const PATTERN_MAX = 60;
export const ROLE_FIT_MAX = 40;
