import { describe, expect, it } from "vitest";
import { desiredDraftKind, rankCandidates } from "../src/lib/ranking";
import { summariseScores } from "../src/lib/scores";
import type { ScoringOutput } from "../src/lib/scoring/schema";

function scores(s: Partial<Record<keyof ScoringOutput["scores"], number>>): ScoringOutput["scores"] {
  const keys = [
    "A1_fixes_unasked", "A2_owns_the_call", "A3_ground_ops", "A4_steady_under_fire", "A5_writes_down_why",
    "B1_product_ownership_pm", "B1_product_ownership_spm", "B2_thrives_without_structure",
  ] as const;
  return Object.fromEntries(keys.map((k) => [k, { score: s[k] ?? 0, status: "evidenced", evidence: "x" }])) as ScoringOutput["scores"];
}

describe("scores for both roles", () => {
  it("computes PM and SPM totals from the shared pattern plus each role's B1", () => {
    const r = summariseScores(scores({ A1_fixes_unasked: 15, A3_ground_ops: 12, B1_product_ownership_pm: 16, B1_product_ownership_spm: 8, B2_thrives_without_structure: 10 }), "PM");
    expect(r.pattern).toBe(27);
    expect(r.totals.PM).toBe(53);
    expect(r.totals.SPM).toBe(45);
  });

  it("clamps out-of-range and fractional scores from the AI", () => {
    const r = summariseScores(scores({ A1_fixes_unasked: 99, A4_steady_under_fire: -3, A5_writes_down_why: 6.6 }), "PM");
    expect(r.scores.A1_fixes_unasked).toBe(15);
    expect(r.scores.A4_steady_under_fire).toBe(0);
    expect(r.scores.A5_writes_down_why).toBe(7);
  });

  it("flags a strong pattern at 30+ out of 60", () => {
    expect(summariseScores(scores({ A1_fixes_unasked: 15, A2_owns_the_call: 15 }), "PM").strongPattern).toBe(true);
    expect(summariseScores(scores({ A1_fixes_unasked: 15, A2_owns_the_call: 10 }), "PM").strongPattern).toBe(false);
  });

  it("keeps a tagged role; mismatch when the other B1 is 8+ higher", () => {
    const r = summariseScores(scores({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }), "PM");
    expect(r.assignedRole).toBe("PM");
    expect(r.roleMismatch).toBe(true);
    expect(summariseScores(scores({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 15 }), "PM").roleMismatch).toBe(false);
  });

  it("untagged picks the higher B1; ties go to PM with a mismatch flag", () => {
    expect(summariseScores(scores({ B1_product_ownership_pm: 8, B1_product_ownership_spm: 16 }), null).assignedRole).toBe("SPM");
    const tie = summariseScores(scores({ B1_product_ownership_pm: 16, B1_product_ownership_spm: 16 }), null);
    expect(tie.assignedRole).toBe("PM");
    expect(tie.roleMismatch).toBe(true);
  });
});

describe("ranking", () => {
  const c = (id: string, role: "PM" | "SPM", total: number, created = "2026-09-29T10:00:00Z") => ({
    id, assigned_role: role, total_score: total, created_at: created, stage: "scored",
  });

  it("ranks within each role and marks the top N", () => {
    const list = [c("a", "PM", 60), c("b", "PM", 80), c("c", "PM", 70), c("d", "SPM", 50), c("e", "SPM", 90)];
    const r = rankCandidates(list, 2);
    expect(r.rank.get("b")).toBe(1);
    expect(r.rank.get("c")).toBe(2);
    expect(r.rank.get("a")).toBe(3);
    expect(r.rank.get("e")).toBe(1);
    expect([...r.top].sort()).toEqual(["b", "c", "d", "e"]);
    expect(desiredDraftKind("a", r)).toBe("rejection");
    expect(desiredDraftKind("b", r)).toBe("invite");
  });

  it("breaks ties by earlier upload", () => {
    const r = rankCandidates([c("late", "PM", 70, "2026-09-29T12:00:00Z"), c("early", "PM", 70, "2026-09-29T09:00:00Z")], 1);
    expect(r.top.has("early")).toBe(true);
    expect(r.top.has("late")).toBe(false);
  });
});
