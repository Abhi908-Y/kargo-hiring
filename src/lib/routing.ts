// Deterministic scoring maths and routing. The AI returns dimension scores only;
// everything here (totals, role assignment, band) is decided by the server.

import {
  ALL_DIMENSIONS,
  ROLE_MISMATCH_GAP,
  type DimensionKey,
  type Role,
  type Settings,
} from "@/config/scoring";
import type { ScoringOutput } from "@/lib/scoring/schema";

export type Band = "auto_reject" | "review" | "auto_shortlist";

export interface RouteInput {
  scores: ScoringOutput["scores"];
  taggedRole: Role | null;
  aiFlags: string[];
  /** set when our own extraction heuristics think the text is unreliable */
  extractionWarning: string | null;
  settings: Settings;
}

export interface RouteResult {
  scores: Record<DimensionKey, number>;
  pattern: number;
  roleFit: number;
  total: number;
  /** total the candidate would get under the other role */
  totalOtherRole: number;
  assignedRole: Role;
  otherRole: Role;
  roleSource: "tagged" | "inferred";
  roleMismatch: boolean;
  band: Band;
  /** plain-English reasons for the band, shown to Arjun */
  reasons: string[];
  rescued: boolean;
}

const clamp = (n: number, max: number) =>
  Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));

export function hasLowExtractionFlag(flags: string[]): boolean {
  return flags.some((f) => f.toLowerCase().includes("low_extraction_confidence"));
}

export function routeCandidate(input: RouteInput): RouteResult {
  const { settings } = input;

  const s = Object.fromEntries(
    ALL_DIMENSIONS.map((d) => [d.key, clamp(input.scores[d.key]?.score ?? 0, d.max)]),
  ) as Record<DimensionKey, number>;

  const pattern =
    s.A1_fixes_unasked + s.A2_owns_the_call + s.A3_ground_ops + s.A4_steady_under_fire + s.A5_writes_down_why;
  const b1: Record<Role, number> = { PM: s.B1_product_ownership_pm, SPM: s.B1_product_ownership_spm };

  // Role assignment (rubric "Role assignment" section).
  let assignedRole: Role;
  let roleMismatch: boolean;
  let roleSource: "tagged" | "inferred";
  if (input.taggedRole) {
    assignedRole = input.taggedRole;
    roleSource = "tagged";
    const other: Role = assignedRole === "PM" ? "SPM" : "PM";
    roleMismatch = b1[other] - b1[assignedRole] >= ROLE_MISMATCH_GAP;
  } else {
    roleSource = "inferred";
    if (b1.SPM > b1.PM) {
      assignedRole = "SPM";
      roleMismatch = false;
    } else if (b1.PM > b1.SPM) {
      assignedRole = "PM";
      roleMismatch = false;
    } else {
      // Tie: PM is the lower bar, which protects against false negatives.
      assignedRole = "PM";
      roleMismatch = true;
    }
  }
  const otherRole: Role = assignedRole === "PM" ? "SPM" : "PM";

  const roleFit = b1[assignedRole] + s.B2_thrives_without_structure;
  const total = pattern + roleFit;
  const totalOtherRole = pattern + b1[otherRole] + s.B2_thrives_without_structure;

  const reasons: string[] = [];
  let band: Band;
  let rescued = false;

  const lowExtraction = Boolean(input.extractionWarning) || hasLowExtractionFlag(input.aiFlags);

  if (lowExtraction) {
    band = "review";
    reasons.push(
      `CV text may be unreliable (${input.extractionWarning ?? "flagged by the scorer"}), so a person should check the original.`,
    );
  } else if (total >= settings.shortlistAt) {
    band = "auto_shortlist";
    reasons.push(`Total ${total} is at or above the shortlist bar of ${settings.shortlistAt}.`);
  } else if (total < settings.rejectBelow) {
    if (pattern >= settings.rescuePatternMin) {
      band = "review";
      rescued = true;
      reasons.push(
        `Rescued: total ${total} is below ${settings.rejectBelow}, but the pattern score ${pattern}/60 is at or above ${settings.rescuePatternMin}.`,
      );
    } else if (roleMismatch && totalOtherRole >= settings.rejectBelow) {
      // When in doubt, review: they may clear the bar for the other role.
      band = "review";
      rescued = true;
      reasons.push(
        `Rescued: total ${total} is below ${settings.rejectBelow} as ${assignedRole}, but they would score ${totalOtherRole} as ${otherRole}.`,
      );
    } else {
      band = "auto_reject";
      reasons.push(
        `Total ${total} is below ${settings.rejectBelow} and the pattern score ${pattern}/60 is below the rescue level of ${settings.rescuePatternMin}.`,
      );
    }
  } else {
    band = "review";
    reasons.push(`Total ${total} is between ${settings.rejectBelow} and ${settings.shortlistAt - 1}.`);
  }

  return {
    scores: s,
    pattern,
    roleFit,
    total,
    totalOtherRole,
    assignedRole,
    otherRole,
    roleSource,
    roleMismatch,
    band,
    reasons,
    rescued,
  };
}
