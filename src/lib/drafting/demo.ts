// Demo-mode stand-in for the Gemini drafter (DEMO_MODE=true, no GEMINI_API_KEY):
// standard wording plus a brief stitched from the demo scorer's output.

import type { Candidate, EmailKind as DraftKind } from "@/lib/types";
import { templateDraft, type DraftResult } from "./draft";

export async function demoDraftEmail(c: Candidate, kind: DraftKind): Promise<DraftResult> {
  const draft = templateDraft(c, kind);
  if (kind === "invite") {
    const strongest = c.brief?.why_ranked_here?.[0]?.replace(/^\w+\d?: /, "") ?? "their work history";
    const probe = c.brief?.what_to_probe?.[0] ?? "Ask about their strongest project.";
    draft.interview_brief = `[Demo, not AI] Scores ${c.total_score}/100 for ${c.assigned_role}, strongest evidence: ${strongest.slice(0, 140)}. The biggest gap to test is whichever rubric areas show "Not in CV" below. Start with: ${probe}`;
  }
  await new Promise((r) => setTimeout(r, 400));
  return { draft, source: "template", error: null };
}
