// Ranking: candidates are ranked within the role they applied for (or the role
// the scorer picked, if untagged). The top N per role get an interview brief
// and an invite draft; everyone else gets a rejection draft.

import type { Role } from "@/config/scoring";

export interface Rankable {
  id: string;
  assigned_role: Role | null;
  total_score: number | null;
  created_at: string;
  stage: string;
}

export type DraftKind = "invite" | "rejection";

export interface Ranking {
  /** 1-based rank within the candidate's role */
  rank: Map<string, number>;
  /** ids of the top N per role */
  top: Set<string>;
}

export function rankCandidates(candidates: Rankable[], topN: number): Ranking {
  const rank = new Map<string, number>();
  const top = new Set<string>();
  for (const role of ["PM", "SPM"] as Role[]) {
    const list = candidates
      .filter((c) => c.assigned_role === role && c.total_score != null)
      // Highest score first; earlier upload wins a tie so ranks don't flicker.
      .sort((a, b) => b.total_score! - a.total_score! || a.created_at.localeCompare(b.created_at));
    list.forEach((c, i) => {
      rank.set(c.id, i + 1);
      if (i < topN) top.add(c.id);
    });
  }
  return { rank, top };
}

export function desiredDraftKind(id: string, ranking: Ranking): DraftKind {
  return ranking.top.has(id) ? "invite" : "rejection";
}
