import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/scoring";
import { routeCandidate } from "../src/lib/routing";
import type { ScoringOutput } from "../src/lib/scoring/schema";

function scores(s: Partial<Record<keyof ScoringOutput["scores"], number>>): ScoringOutput["scores"] {
  const keys = [
    "A1_fixes_unasked", "A2_owns_the_call", "A3_ground_ops", "A4_steady_under_fire", "A5_writes_down_why",
    "B1_product_ownership_pm", "B1_product_ownership_spm", "B2_thrives_without_structure",
  ] as const;
  return Object.fromEntries(keys.map((k) => [k, { score: s[k] ?? 0, status: "evidenced", evidence: "x" }])) as ScoringOutput["scores"];
}

const route = (s: Parameters<typeof scores>[0], taggedRole: "PM" | "SPM" | null = "PM", extra: { flags?: string[]; warning?: string } = {}) =>
  routeCandidate({ scores: scores(s), taggedRole, aiFlags: extra.flags ?? [], extractionWarning: extra.warning ?? null, settings: DEFAULT_SETTINGS });

describe("routing", () => {
  it("auto-rejects below 40 with a weak pattern", () => {
    const r = route({ A1_fixes_unasked: 5, A2_owns_the_call: 5, B1_product_ownership_pm: 8, B2_thrives_without_structure: 5 });
    expect(r.total).toBe(23);
    expect(r.band).toBe("auto_reject");
  });

  it("rescues a strong pattern even when the total is below 40", () => {
    const r = route({ A1_fixes_unasked: 10, A2_owns_the_call: 10, A3_ground_ops: 12 });
    expect(r.pattern).toBe(32);
    expect(r.total).toBe(32);
    expect(r.band).toBe("review");
    expect(r.rescued).toBe(true);
  });

  it("pattern exactly 30 is rescued", () => {
    expect(route({ A1_fixes_unasked: 15, A2_owns_the_call: 15 }).band).toBe("review");
  });

  it("40 goes to review, 89 goes to review, 90 auto-shortlists", () => {
    expect(route({ A1_fixes_unasked: 15, A2_owns_the_call: 10, B1_product_ownership_pm: 8, B2_thrives_without_structure: 5, A3_ground_ops: 2 }).band).toBe("review");
    const high = { A1_fixes_unasked: 15, A2_owns_the_call: 15, A3_ground_ops: 12, A4_steady_under_fire: 8, A5_writes_down_why: 10, B2_thrives_without_structure: 15 };
    expect(route({ ...high, B1_product_ownership_pm: 14 }).total).toBe(89);
    expect(route({ ...high, B1_product_ownership_pm: 14 }).band).toBe("review");
    expect(route({ ...high, B1_product_ownership_pm: 16 }).band).toBe("auto_shortlist");
  });

  it("low extraction confidence always goes to review", () => {
    expect(route({}, "PM", { flags: ["low_extraction_confidence"] }).band).toBe("review");
    expect(route({}, "PM", { warning: "scanned" }).band).toBe("review");
  });

  it("clamps out-of-range scores from the AI", () => {
    const r = route({ A1_fixes_unasked: 99, A4_steady_under_fire: -3 });
    expect(r.scores.A1_fixes_unasked).toBe(15);
    expect(r.scores.A4_steady_under_fire).toBe(0);
  });

  it("tagged role is kept; mismatch when the other B1 is 8+ higher", () => {
    const r = route({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }, "PM");
    expect(r.assignedRole).toBe("PM");
    expect(r.roleMismatch).toBe(true);
    expect(route({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 15 }, "PM").roleMismatch).toBe(false);
  });

  it("untagged picks the higher B1; ties go to PM with a mismatch flag", () => {
    expect(route({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }, null).assignedRole).toBe("SPM");
    const tie = route({ B1_product_ownership_pm: 16, B1_product_ownership_spm: 16 }, null);
    expect(tie.assignedRole).toBe("PM");
    expect(tie.roleMismatch).toBe(true);
  });

  it("does not auto-reject when the other role would clear the bar", () => {
    const r = route({ A1_fixes_unasked: 10, A2_owns_the_call: 10, B1_product_ownership_pm: 0, B1_product_ownership_spm: 16, B2_thrives_without_structure: 5 }, "PM");
    expect(r.total).toBe(25);
    expect(r.totalOtherRole).toBe(41);
    expect(r.band).toBe("review");
  });
});
