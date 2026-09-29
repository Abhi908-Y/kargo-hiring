// Scoring configuration. The rubric itself lives in rubric/arjun_rubric.md
// (sent to the AI) and src/config/rubric.ts (the rubric_criteria table).

export const DEFAULT_SETTINGS = {
  /** How many candidates per role get an interview brief and an invite draft. */
  topN: 5,
  /** Link candidates use to pick an interview slot (fills {calendar_link} in invites). */
  calendarLink: "{calendar_link}",
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Tagged CV: flag a mismatch when the other role's B1 is at least this much higher. */
export const ROLE_MISMATCH_GAP = 8;

/** Pattern score (out of 60) at which a rejection draft gets a "check before rejecting" warning. */
export const STRONG_PATTERN_MIN = 30;

/** Default Gemini model; override with the GEMINI_MODEL env var (e.g. gemini-3.1-pro-preview). */
export const GEMINI_MODEL = "gemini-3.8-flash";

export type Role = "PM" | "SPM";
export const ROLES: Role[] = ["PM", "SPM"];

export const ROLE_TITLES: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

export const PATTERN_DIMENSIONS = [
  { key: "A1_fixes_unasked", code: "A1", label: "Fixes what nobody asked them to fix", max: 15 },
  { key: "A2_owns_the_call", code: "A2", label: "Owns the call with no layer above", max: 15 },
  { key: "A3_ground_ops", code: "A3", label: "Has been on the ground in operations", max: 12 },
  { key: "A4_steady_under_fire", code: "A4", label: "Stays steady when things break", max: 8 },
  { key: "A5_writes_down_why", code: "A5", label: "Writes down why", max: 10 },
] as const;

export const ROLE_FIT_DIMENSIONS = [
  { key: "B1_product_ownership_pm", code: "B1", label: "Product ownership (PM bar)", max: 25 },
  { key: "B1_product_ownership_spm", code: "B1", label: "Product ownership (Senior PM bar)", max: 25 },
  { key: "B2_thrives_without_structure", code: "B2", label: "Thrives without structure", max: 15 },
] as const;

export const ALL_DIMENSIONS = [...PATTERN_DIMENSIONS, ...ROLE_FIT_DIMENSIONS];
export type DimensionKey = (typeof ALL_DIMENSIONS)[number]["key"];

/** The 7 dimensions that make up a role's score out of 100. */
export function dimensionsForRole(role: Role) {
  return [
    ...PATTERN_DIMENSIONS,
    ROLE_FIT_DIMENSIONS[role === "PM" ? 0 : 1],
    ROLE_FIT_DIMENSIONS[2],
  ];
}

export const PATTERN_MAX = 60;
export const ROLE_FIT_MAX = 40;
