// The rubric as rows for the rubric_criteria table: one row per criterion per
// role, transcribed from rubric/arjun_rubric.md. Weights are the rubric's
// points, which already add up to 100 for each role.

import type { Role } from "./scoring";

export interface RubricCriterion {
  role: Role;
  code: string;
  dimension_key: string;
  name: string;
  description: string;
  weight_pct: number;
  sort_order: number;
}

const SHARED = [
  {
    code: "A1", dimension_key: "A1_fixes_unasked", name: "Fixes what nobody asked them to fix", weight_pct: 15,
    description:
      "Noticed a broken process, built a scrappy fix on their own initiative, and others adopted it. 0: only assigned tasks. 5: improved something within their own scope. 10: built something unasked, no evidence of adoption. 15: built something unasked AND others adopted it (team, other teams, standard practice). Seen in all 8 hires, e.g. Rohan's Excel tracker, Sunita's weekend workflow redesign, Lavanya's triage process, Preetham's exception dashboard.",
  },
  {
    code: "A2", dimension_key: "A2_owns_the_call", name: "Owns the call with no layer above", weight_pct: 15,
    description:
      "Makes decisions and carries the outcome without a senior person approving each call. 0: always executing someone else's decisions. 5: owned pieces, a senior layer made the key calls. 10: owned an area end to end with some oversight. 15: explicitly the sole owner or decision-maker; reported to the CEO/founder or had no layer above (\"no product layer\", \"sole PM\", \"limited oversight\"). Seen in 7 of 8 hires.",
  },
  {
    code: "A3", dimension_key: "A3_ground_ops", name: "Has been on the ground in operations", weight_pct: 12,
    description:
      "Worked inside operations, not just on calls with operations teams. 0: no operations exposure. 4: built for or sold to operations users at arm's length. 8: hands-on operations in a non-logistics domain (field ops, manufacturing, fulfilment). 12: hands-on inside freight, logistics or supply chain operations (documentation desk, carrier coordination, port, 3PL). Seen in Rohan, Sunita, Aditya, Meghna, Lavanya.",
  },
  {
    code: "A4", dimension_key: "A4_steady_under_fire", name: "Stays steady when things break", weight_pct: 8,
    description:
      "Handled a live failure or crisis calmly and owned the fix. 0: no evidence. 4: part of an incident response. 8: personally owned the resolution of a specific, high-stakes failure. Seen in Meghna's overnight customs hold, Sunita's surprise vendor format change, Rohan's migration under time pressure, Preetham's 48-hour patch.",
  },
  {
    code: "A5", dimension_key: "A5_writes_down_why", name: "Writes down why", weight_pct: 10,
    description:
      "Documents reasoning, learns openly from failure, kills things that don't work. 0: no evidence. 4: writes documentation or specs as part of the job. 7: created a process, template or SOP that others adopted. 10: documented a failure or kill decision and the reasoning, and it changed how the team works. Seen in Aditya's lost-deal post-mortem, Lavanya killing two features on usage data, Sunita's SOPs, Vikram's PRD template.",
  },
];

const B1: Record<Role, { description: string }> = {
  PM: {
    description:
      "PM bar (2–4 years; shipped and killed things in short cycles; first-time building). 0: no product-type work. 8: product-adjacent (wrote specs, turned user needs into requirements, worked closely with engineering on what to build). 16: worked as a PM and shipped features, but inside a large structured PM team or with no evidence of killing or learning. 25: 2+ years owning a product area; shipped AND killed things based on evidence; measured outcomes.",
  },
  SPM: {
    description:
      "Senior PM bar (5–8 years; owned an area with no senior PM above; platform, integration or data layer; build vs configure vs don't-touch calls). 0: under 3 years of product ownership and no platform experience. 8: 3–5 years as a PM, no platform or integration work. 16: 5+ years OR deep platform/integration ownership (including a senior engineer who made platform decisions), not both. 25: 5–8 years owning a product area with no senior PM above; integration or platform layer; clear architectural product calls.",
  },
};

const B2 = {
  code: "B2", dimension_key: "B2_thrives_without_structure", name: "Thrives without structure", weight_pct: 15,
  description:
    "Early-stage or undefined environments where they built the rules rather than followed them. 0: only large, mature organisations. 5: growth-stage company, joined an existing function. 10: early-stage company, or the first person in a role or function. 15: built a function, process or product from zero in an undefined environment.",
};

export const RUBRIC_CRITERIA: RubricCriterion[] = (["PM", "SPM"] as Role[]).flatMap((role) =>
  [
    ...SHARED,
    {
      code: "B1",
      dimension_key: role === "PM" ? "B1_product_ownership_pm" : "B1_product_ownership_spm",
      name: `Product ownership at ${role === "PM" ? "PM" : "Senior PM"} level`,
      weight_pct: 25,
      description: B1[role].description,
    },
    B2,
  ].map((c, i) => ({ ...c, role, sort_order: i + 1 })),
);
