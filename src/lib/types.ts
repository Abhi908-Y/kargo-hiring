import type { DimensionKey, Role } from "@/config/scoring";
import type { Band } from "@/lib/routing";
import type { DimensionScore } from "@/lib/scoring/schema";

export type Stage =
  | "processing"
  | "review"
  | "reject_pending"
  | "shortlist_pending"
  | "rejected"
  | "shortlisted";

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
  band: Band | null;
  route_reasons: string[];
  rescued: boolean;
  assigned_role: Role | null;
  role_source: "tagged" | "inferred" | null;
  role_reasoning: string | null;
  role_mismatch: boolean;
  pattern_score: number | null;
  role_fit_score: number | null;
  total_score: number | null;
  total_other_role: number | null;
  dimension_scores: Record<DimensionKey, DimensionScore> | null;
  brief: Brief | null;
  personal_line: string | null;
  flags: string[];
  model: string | null;
  scored_at: string | null;
  scoring_error: string | null;
  decided_by: "auto" | "arjun" | null;
  decided_at: string | null;
  email_scheduled_for: string | null;
}

export interface EmailRow {
  id: string;
  created_at: string;
  candidate_id: string;
  kind: "rejection" | "shortlist";
  trigger: "auto" | "arjun";
  intended_to: string;
  delivered_to: string | null;
  test_mode: boolean;
  simulated: boolean;
  from_address: string | null;
  subject: string;
  body_text: string;
  body_html: string;
  status: "queued" | "scheduled" | "sent" | "simulated" | "cancelled" | "failed";
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
