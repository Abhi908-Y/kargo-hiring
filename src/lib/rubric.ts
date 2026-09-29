import "server-only";
import { DEFAULT_RUBRIC } from "@/config/rubric";
import { DIMENSIONS, type DimensionKey, type Role } from "@/config/scoring";
import { db } from "@/lib/db";
import type { Weights } from "@/lib/scores";
import type { RubricCriterionRow } from "@/lib/types";

// The rubric Arjun edits on the Rubric page. Scoring prompts and weighted
// totals both read from here, so edits apply from the next call.

export async function getRubric(): Promise<RubricCriterionRow[]> {
  const { data } = await db().from("rubric_criteria").select("*").order("role").order("sort_order");
  const rows = (data ?? []) as RubricCriterionRow[];
  // Fill anything missing (e.g. db:setup not run yet) from the defaults.
  const have = new Set(rows.map((r) => `${r.role}:${r.dimension_key}`));
  const missing = DEFAULT_RUBRIC.filter((d) => !have.has(`${d.role}:${d.dimension_key}`)).map((d, i) => ({ id: -1 - i, ...d }));
  return [...rows, ...missing].sort((a, b) => a.role.localeCompare(b.role) || a.sort_order - b.sort_order);
}

export function weightsFrom(rubric: RubricCriterionRow[]): Weights {
  const w: Weights = { PM: {}, SPM: {} };
  for (const r of rubric) w[r.role][r.dimension_key as DimensionKey] = r.weight_pct;
  return w;
}

export interface RubricEdit {
  dimension_key: DimensionKey;
  name: string;
  description: string;
  /** weight per role; only roles this dimension applies to */
  weights: Partial<Record<Role, number>>;
}

/** Validate and save edits from the Rubric page. Returns an error message or null. */
export async function saveRubric(edits: RubricEdit[]): Promise<string | null> {
  const byKey = new Map(edits.map((e) => [e.dimension_key, e]));
  for (const role of ["PM", "SPM"] as Role[]) {
    let sum = 0;
    for (const d of DIMENSIONS) {
      if (!(d.roles as readonly Role[]).includes(role)) continue;
      const w = byKey.get(d.key)?.weights[role];
      if (w == null || !Number.isInteger(w) || w < 0 || w > 100) return `Every ${role} weight must be a whole number from 0 to 100.`;
      sum += w;
    }
    if (sum !== 100) return `${role} weights add up to ${sum}%. They must add up to exactly 100%.`;
  }
  for (const e of edits) {
    if (!DIMENSIONS.some((d) => d.key === e.dimension_key)) return `Unknown criterion ${e.dimension_key}.`;
    if (!e.name.trim() || !e.description.trim()) return "Every criterion needs a name and a description.";
  }

  const now = new Date().toISOString();
  for (const e of edits) {
    const dim = DIMENSIONS.find((d) => d.key === e.dimension_key)!;
    for (const role of dim.roles) {
      // Shared criteria (A1–A5, B2) keep one description for both roles because the AI scores them once.
      const { error } = await db()
        .from("rubric_criteria")
        .update({ name: e.name.trim(), description: e.description.trim(), weight_pct: e.weights[role], updated_at: now })
        .eq("role", role)
        .eq("dimension_key", e.dimension_key);
      if (error) return error.message;
    }
  }
  return null;
}

export async function resetRubric(): Promise<string | null> {
  for (const d of DEFAULT_RUBRIC) {
    const { error } = await db()
      .from("rubric_criteria")
      .update({ name: d.name, description: d.description, weight_pct: d.weight_pct, max_points: d.max_points, updated_at: new Date().toISOString() })
      .eq("role", d.role)
      .eq("dimension_key", d.dimension_key);
    if (error) return error.message;
  }
  return null;
}
