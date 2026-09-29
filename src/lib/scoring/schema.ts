import { z } from "zod";

// Mirrors the output schema in rubric/arjun_rubric.md. No band or total here:
// the server computes those (rubric hard rule 6).

const Dimension = z.object({
  score: z.number().int(),
  status: z.enum(["evidenced", "not_evidenced"]),
  evidence: z.string(),
});

export const ScoringOutput = z.object({
  candidate_id: z.string(),
  scores: z.object({
    A1_fixes_unasked: Dimension,
    A2_owns_the_call: Dimension,
    A3_ground_ops: Dimension,
    A4_steady_under_fire: Dimension,
    A5_writes_down_why: Dimension,
    B1_product_ownership_pm: Dimension,
    B1_product_ownership_spm: Dimension,
    B2_thrives_without_structure: Dimension,
  }),
  assigned_role: z.enum(["PM", "SPM"]),
  role_source: z.enum(["tagged", "inferred"]),
  role_reasoning: z.string(),
  role_mismatch_flag: z.boolean(),
  brief: z.object({
    who_they_are: z.string(),
    why_ranked_here: z.array(z.string()),
    what_to_probe: z.array(z.string()),
  }),
  personal_line: z.string(),
  flags: z.array(z.string()),
});

export type ScoringOutput = z.infer<typeof ScoringOutput>;
export type DimensionScore = z.infer<typeof Dimension>;
