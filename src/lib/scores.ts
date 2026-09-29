// Deterministic scoring maths. The AI scores each dimension on its rubric
// scale; the server turns those into a weighted total out of 100 for each role
// using the weights on the Rubric page, assigns the role and picks the band.

import {
  DIMENSIONS,
  PATTERN_KEYS,
  ROLE_MISMATCH_GAP,
  STRONG_PATTERN_MIN,
  type DimensionKey,
  type Role,
  type Settings,
} from "@/config/scoring";

export type Band = "auto_reject" | "review" | "auto_invite";

/** Weight (percent of the role's total) per dimension, per role. */
export type Weights = Record<Role, Partial<Record<DimensionKey, number>>>;

export interface ScoreSummary {
  /** clamped raw scores on each dimension's scale */
  scores: Record<DimensionKey, number>;
  /** A1–A5 raw points out of 60 */
  pattern: number;
  /** weighted total out of 100 against each role's rubric */
  totals: Record<Role, number>;
  assignedRole: Role;
  roleSource: "tagged" | "inferred";
  roleMismatch: boolean;
  strongPattern: boolean;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));

export function clampScores(raw: Partial<Record<DimensionKey, { score: number } | number>>): Record<DimensionKey, number> {
  return Object.fromEntries(
    DIMENSIONS.map((d) => {
      const v = raw[d.key];
      return [d.key, clamp(typeof v === "number" ? v : (v?.score ?? 0), d.max)];
    }),
  ) as Record<DimensionKey, number>;
}

/** Weighted total out of 100: sum of weight × (score / scale). */
export function weightedTotal(scores: Record<DimensionKey, number>, role: Role, weights: Weights): number {
  let total = 0;
  let weightSum = 0;
  for (const d of DIMENSIONS) {
    if (!(d.roles as readonly Role[]).includes(role)) continue;
    const w = weights[role][d.key] ?? 0;
    weightSum += w;
    total += (w * scores[d.key]) / d.max;
  }
  // Weights are kept at 100 per role; normalise anyway so a bad edit can't inflate scores.
  return weightSum > 0 ? Math.round((total * 100) / weightSum) : 0;
}

export function summariseScores(
  raw: Partial<Record<DimensionKey, { score: number } | number>>,
  taggedRole: Role | null,
  weights: Weights,
): ScoreSummary {
  const s = clampScores(raw);
  const pattern = PATTERN_KEYS.reduce((sum, k) => sum + s[k], 0);
  const totals: Record<Role, number> = { PM: weightedTotal(s, "PM", weights), SPM: weightedTotal(s, "SPM", weights) };
  const b1: Record<Role, number> = { PM: s.B1_product_ownership_pm, SPM: s.B1_product_ownership_spm };

  // Role assignment (rubric "Role assignment" section).
  let assignedRole: Role;
  let roleMismatch: boolean;
  if (taggedRole) {
    assignedRole = taggedRole;
    const other: Role = taggedRole === "PM" ? "SPM" : "PM";
    roleMismatch = b1[other] - b1[taggedRole] >= ROLE_MISMATCH_GAP;
  } else if (b1.SPM > b1.PM) {
    assignedRole = "SPM";
    roleMismatch = false;
  } else {
    // Higher PM score, or a tie: PM is the lower bar, which protects against false negatives.
    assignedRole = "PM";
    roleMismatch = b1.PM === b1.SPM;
  }

  return {
    scores: s,
    pattern,
    totals,
    assignedRole,
    roleSource: taggedRole ? "tagged" : "inferred",
    roleMismatch,
    strongPattern: pattern >= STRONG_PATTERN_MIN,
  };
}

/** Which band a total falls in. Below the reject line -> auto reject; above the invite line -> auto invite. */
export function bandFor(total: number, settings: Pick<Settings, "autoRejectBelow" | "autoInviteAbove">): Band {
  if (total < settings.autoRejectBelow) return "auto_reject";
  if (total > settings.autoInviteAbove) return "auto_invite";
  return "review";
}

export function bandReason(total: number, band: Band, settings: Pick<Settings, "autoRejectBelow" | "autoInviteAbove">): string {
  if (band === "auto_reject") return `Score ${total} is below the auto-reject line of ${settings.autoRejectBelow}.`;
  if (band === "auto_invite") return `Score ${total} is above the auto-invite line of ${settings.autoInviteAbove}.`;
  return `Score ${total} is between ${settings.autoRejectBelow} and ${settings.autoInviteAbove}, so you decide.`;
}

export function hasLowExtractionFlag(flags: string[]): boolean {
  return flags.some((f) => f.toLowerCase().includes("low_extraction_confidence"));
}
