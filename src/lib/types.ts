import type { DimensionKey, Role } from "@/config/scoring";
import type { Band } from "@/lib/scores";
import type { DimensionScore } from "@/lib/scoring/schema";

export type Stage = "processing" | "drafting" | "review" | "auto_selected" | "auto_rejected" | "invite_pending" | "reject_pending" | "sent";
export type EmailKind = "invite" | "rejection";

export interface Brief {
  who_they_are: string;
  why_ranked_here: string[];
  what_to_probe: string[];
}

export interface Candidate {
  id: string;
  created_at: string;
  updated_at: string;
  file_name: string;
  file_path: string | null;
  file_type: "pdf" | "docx";
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  redacted_text: string;
  extraction_warning: string | null;
  tagged_role: Role | null;
  stage: Stage;
  assigned_role: Role | null;
  role_source: "tagged" | "inferred" | null;
  role_reasoning: string | null;
  role_mismatch: boolean;
  pattern_score: number | null;
  score_pm: number | null;
  score_spm: number | null;
  total_score: number | null;
  strong_pattern: boolean;
  dimension_scores: Record<DimensionKey, DimensionScore> | null;
  brief: Brief | null;
  personal_line: string | null;
  flags: string[];
  model: string | null;
  scored_at: string | null;
  scoring_error: string | null;
  band: Band | null;
  route_reason: string | null;
  interview_brief: string | null;
  invite_subject: string | null;
  invite_body: string | null;
  invite_source: DraftSource | null;
  rejection_subject: string | null;
  rejection_body: string | null;
  rejection_source: DraftSource | null;
  draft_error: string | null;
  drafted_at: string | null;
  email_scheduled_for: string | null;
  decided_by: "auto" | "arjun" | null;
  sent_kind: EmailKind | null;
  band_locked: boolean;
  /** another candidate already uses this email address */
  same_email_as: string | null;
  sent_at: string | null;
}

export type DraftSource = "ai" | "template" | "edited";

export interface EmailRow {
  id: string;
  created_at: string;
  candidate_id: string;
  kind: EmailKind;
  trigger: "auto" | "arjun";
  intended_to: string;
  delivered_to: string | null;
  test_mode: boolean;
  simulated: boolean;
  from_address: string | null;
  subject: string;
  body_text: string;
  body_html: string;
  status: "queued" | "scheduled" | "sent" | "cancelled" | "failed";
  scheduled_for: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  resend_id: string | null;
  error: string | null;
}

export interface CandidateEvent {
  id: number;
  created_at: string;
  candidate_id: string;
  action: string;
  detail: string | null;
}

export interface CandidateNote {
  id: number;
  created_at: string;
  candidate_id: string;
  body: string;
}

export interface RubricCriterionRow {
  id: number;
  role: Role;
  code: string;
  dimension_key: string;
  name: string;
  description: string;
  max_points: number;
  weight_pct: number;
  sort_order: number;
}
