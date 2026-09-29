import { describe, expect, it } from "vitest";
import { DEFAULT_RUBRIC } from "../src/config/rubric";
import { DEFAULT_SETTINGS } from "../src/config/scoring";
import { bandFor, summariseScores, weightedTotal, type Weights } from "../src/lib/scores";
import type { ScoringOutput } from "../src/lib/scoring/schema";

function scores(s: Partial<Record<keyof ScoringOutput["scores"], number>>): ScoringOutput["scores"] {
  const keys = [
    "A1_fixes_unasked", "A2_owns_the_call", "A3_ground_ops", "A4_steady_under_fire", "A5_writes_down_why",
    "B1_product_ownership_pm", "B1_product_ownership_spm", "B2_thrives_without_structure",
  ] as const;
  return Object.fromEntries(keys.map((k) => [k, { score: s[k] ?? 0, status: "evidenced", evidence: "x" }])) as ScoringOutput["scores"];
}

const DEFAULT_WEIGHTS: Weights = { PM: {}, SPM: {} };
for (const r of DEFAULT_RUBRIC) DEFAULT_WEIGHTS[r.role][r.dimension_key] = r.weight_pct;

const sum = (s: Parameters<typeof scores>[0], role: "PM" | "SPM" | null = "PM", w = DEFAULT_WEIGHTS) => summariseScores(scores(s), role, w);

describe("rubric defaults", () => {
  it("has 7 criteria per role with weights adding up to 100", () => {
    for (const role of ["PM", "SPM"] as const) {
      const rows = DEFAULT_RUBRIC.filter((r) => r.role === role);
      expect(rows).toHaveLength(7);
      expect(rows.reduce((t, r) => t + r.weight_pct, 0)).toBe(100);
    }
  });
});

describe("weighted scores for both roles", () => {
  it("with default weights, the total equals the rubric points", () => {
    const r = sum({ A1_fixes_unasked: 15, A3_ground_ops: 12, B1_product_ownership_pm: 16, B1_product_ownership_spm: 8, B2_thrives_without_structure: 10 });
    expect(r.pattern).toBe(27);
    expect(r.totals.PM).toBe(53);
    expect(r.totals.SPM).toBe(45);
  });

  it("changing weights changes the total without rescoring", () => {
    const s = sum({ A1_fixes_unasked: 15 }).scores; // full marks on A1 only
    const w: Weights = { PM: { ...DEFAULT_WEIGHTS.PM, A1_fixes_unasked: 40, B1_product_ownership_pm: 0 }, SPM: DEFAULT_WEIGHTS.SPM };
    expect(weightedTotal(s, "PM", DEFAULT_WEIGHTS)).toBe(15);
    expect(weightedTotal(s, "PM", w)).toBe(40);
  });

  it("clamps out-of-range and fractional scores from the AI", () => {
    const r = sum({ A1_fixes_unasked: 99, A4_steady_under_fire: -3, A5_writes_down_why: 6.6 });
    expect(r.scores.A1_fixes_unasked).toBe(15);
    expect(r.scores.A4_steady_under_fire).toBe(0);
    expect(r.scores.A5_writes_down_why).toBe(7);
  });

  it("flags a strong pattern at 30+ out of 60", () => {
    expect(sum({ A1_fixes_unasked: 15, A2_owns_the_call: 15 }).strongPattern).toBe(true);
    expect(sum({ A1_fixes_unasked: 15, A2_owns_the_call: 10 }).strongPattern).toBe(false);
  });

  it("keeps a tagged role; mismatch when the other B1 is 8+ higher", () => {
    const r = sum({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }, "PM");
    expect(r.assignedRole).toBe("PM");
    expect(r.roleMismatch).toBe(true);
    expect(sum({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 15 }, "PM").roleMismatch).toBe(false);
  });

  it("untagged picks the higher B1; ties go to PM with a mismatch flag", () => {
    expect(sum({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }, null).assignedRole).toBe("SPM");
    const tie = sum({ B1_product_ownership_pm: 16, B1_product_ownership_spm: 16 }, null);
    expect(tie.assignedRole).toBe("PM");
    expect(tie.roleMismatch).toBe(true);
  });
});

describe("bands", () => {
  const s = DEFAULT_SETTINGS; // reject below 30, invite above 80
  it("below 30 is auto-reject, above 80 is auto-invite, the rest is review", () => {
    expect(bandFor(29, s)).toBe("auto_reject");
    expect(bandFor(30, s)).toBe("review");
    expect(bandFor(80, s)).toBe("review");
    expect(bandFor(81, s)).toBe("auto_invite");
  });
  it("follows the thresholds in Settings", () => {
    expect(bandFor(45, { autoRejectBelow: 50, autoInviteAbove: 90 })).toBe("auto_reject");
    expect(bandFor(85, { autoRejectBelow: 50, autoInviteAbove: 90 })).toBe("review");
  });
});
