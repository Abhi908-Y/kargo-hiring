-- Kargo hiring app: database schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings (single row). Defaults match src/config/scoring.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                  int primary key default 1 check (id = 1),
  reject_below        int     not null default 40,
  shortlist_at        int     not null default 90,
  rescue_pattern_min  int     not null default 30,
  hold_hours          numeric not null default 4,
  calendar_link       text    not null default '{calendar_link}',
  updated_at          timestamptz not null default now(),
  constraint thresholds_ordered check (reject_below >= 0 and reject_below < shortlist_at and shortlist_at <= 100),
  constraint rescue_range check (rescue_pattern_min between 0 and 60),
  constraint hold_range check (hold_hours > 0 and hold_hours <= 72)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Candidates
-- stage:
--   processing         uploaded, not scored yet
--   review             waiting for Arjun (includes scoring failures)
--   reject_pending     auto-reject, email held (Undo available)
--   shortlist_pending  auto-shortlist, email held (Undo available)
--   rejected / shortlisted   final, email sent
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- file + dedupe
  file_name             text not null,
  file_path             text,
  file_type             text not null check (file_type in ('pdf', 'docx')),
  file_hash             text not null unique,
  text_hash             text not null unique,

  -- contact details: stored for emails, NEVER sent to the AI
  full_name             text,
  first_name            text,
  email                 text,
  phone                 text,

  -- what the AI saw
  redacted_text         text not null,
  extraction_warning    text,

  tagged_role           text check (tagged_role in ('PM', 'SPM')),

  stage                 text not null default 'processing'
                        check (stage in ('processing', 'review', 'reject_pending', 'shortlist_pending', 'rejected', 'shortlisted')),

  -- scoring (computed by the server from the AI's dimension scores)
  band                  text check (band in ('auto_reject', 'review', 'auto_shortlist')),
  route_reasons         text[] not null default '{}',
  rescued               boolean not null default false,
  assigned_role         text check (assigned_role in ('PM', 'SPM')),
  role_source           text check (role_source in ('tagged', 'inferred')),
  role_reasoning        text,
  role_mismatch         boolean not null default false,
  pattern_score         int,
  role_fit_score        int,
  total_score           int,
  total_other_role      int,
  dimension_scores      jsonb,   -- {key: {score, status, evidence}}
  brief                 jsonb,   -- {who_they_are, why_ranked_here[], what_to_probe[]}
  personal_line         text,
  flags                 text[] not null default '{}',
  ai_raw                jsonb,
  model                 text,
  scored_at             timestamptz,
  scoring_error         text,

  -- decision
  decided_by            text check (decided_by in ('auto', 'arjun')),
  decided_at            timestamptz,
  email_scheduled_for   timestamptz
);

create unique index if not exists candidates_email_unique on public.candidates (lower(email)) where email is not null;
create index if not exists candidates_stage_idx on public.candidates (stage);
create index if not exists candidates_total_idx on public.candidates (total_score desc nulls last);

-- ---------------------------------------------------------------------------
-- Emails
-- ---------------------------------------------------------------------------
create table if not exists public.emails (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  kind            text not null check (kind in ('rejection', 'shortlist')),
  trigger         text not null check (trigger in ('auto', 'arjun')),
  intended_to     text not null,
  delivered_to    text,
  test_mode       boolean not null,
  simulated       boolean not null default false,  -- true when RESEND_API_KEY is not set
  from_address    text,
  subject         text not null,
  body_text       text not null,
  body_html       text not null,
  status          text not null check (status in ('queued', 'scheduled', 'sent', 'simulated', 'cancelled', 'failed')),
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  cancelled_at    timestamptz,
  resend_id       text,
  error           text
);
create index if not exists emails_candidate_idx on public.emails (candidate_id);
create index if not exists emails_created_idx on public.emails (created_at desc);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists public.candidate_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  action        text not null,
  detail        text
);
create index if not exists candidate_events_candidate_idx on public.candidate_events (candidate_id, created_at);

-- ---------------------------------------------------------------------------
-- Security: RLS on, no policies. The browser can't read or write any table;
-- all access goes through the server with the service-role key after the
-- server has checked that the signed-in user is ADMIN_EMAIL.
-- ---------------------------------------------------------------------------
alter table public.settings         enable row level security;
alter table public.candidates       enable row level security;
alter table public.emails           enable row level security;
alter table public.candidate_events enable row level security;

-- Private bucket for original CV files.
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;
