// Deterministic scoring maths. The AI returns dimension scores only; totals
// for both roles and the role assignment are computed here, on the server.

import {
  ALL_DIMENSIONS,
  ROLE_MISMATCH_GAP,
  STRONG_PATTERN_MIN,
  type DimensionKey,
  type Role,
} from "@/config/scoring";
import type { ScoringOutput } from "@/lib/scoring/schema";

export interface ScoreSummary {
  scores: Record<DimensionKey, number>;
  pattern: number;
  /** total out of 100 against each role's rubric */
  totals: Record<Role, number>;
  assignedRole: Role;
  roleSource: "tagged" | "inferred";
  roleMismatch: boolean;
  /** pattern score high enough that a rejection deserves a second look */
  strongPattern: boolean;
}

const clamp = (n: number, max: number) =>
  Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));

export function summariseScores(aiScores: ScoringOutput["scores"], taggedRole: Role | null): ScoreSummary {
  const s = Object.fromEntries(
    ALL_DIMENSIONS.map((d) => [d.key, clamp(aiScores[d.key]?.score ?? 0, d.max)]),
  ) as Record<DimensionKey, number>;

  const pattern =
    s.A1_fixes_unasked + s.A2_owns_the_call + s.A3_ground_ops + s.A4_steady_under_fire + s.A5_writes_down_why;
  const b1: Record<Role, number> = { PM: s.B1_product_ownership_pm, SPM: s.B1_product_ownership_spm };
  const totals: Record<Role, number> = {
    PM: pattern + b1.PM + s.B2_thrives_without_structure,
    SPM: pattern + b1.SPM + s.B2_thrives_without_structure,
  };

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

export function hasLowExtractionFlag(flags: string[]): boolean {
  return flags.some((f) => f.toLowerCase().includes("low_extraction_confidence"));
}
