-- Kargo hiring app: Neon Postgres schema.
-- Run with:  npm run db:setup   (uses DATABASE_URL from .env.local)
-- or paste into the Neon console SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Rubric: one row per criterion per role (seeded from src/config/rubric.ts)
-- ---------------------------------------------------------------------------
create table if not exists rubric_criteria (
  id             serial primary key,
  role           text not null check (role in ('PM', 'SPM')),
  code           text not null,
  dimension_key  text not null,
  name           text not null,
  description    text not null,
  weight_pct     int  not null check (weight_pct between 0 and 100),
  sort_order     int  not null,
  unique (role, dimension_key)
);

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id             int primary key default 1 check (id = 1),
  top_n          int  not null default 5 check (top_n between 1 and 100),
  calendar_link  text not null default '{calendar_link}',
  updated_at     timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Candidates
-- stage: processing (not scored yet, or scoring failed) -> scored -> sent
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- file + duplicate detection
  file_name           text not null,
  file_path           text,
  file_type           text not null check (file_type in ('pdf', 'docx')),
  file_hash           text not null unique,
  text_hash           text not null unique,

  -- personal details: stored privately, NEVER sent to any AI step
  full_name           text,
  first_name          text,
  email               text,
  phone               text,

  -- CV content with personal details removed (the only text the AI sees)
  redacted_text       text not null,
  extraction_warning  text,

  tagged_role         text check (tagged_role in ('PM', 'SPM')),
  stage               text not null default 'processing' check (stage in ('processing', 'scored', 'sent')),

  -- scores: every candidate is scored against BOTH rubrics
  assigned_role       text check (assigned_role in ('PM', 'SPM')),
  role_source         text check (role_source in ('tagged', 'inferred')),
  role_reasoning      text,
  role_mismatch       boolean not null default false,
  pattern_score       int,
  score_pm            int,
  score_spm           int,
  total_score         int,      -- score for the assigned role (used for ranking)
  strong_pattern      boolean not null default false,
  dimension_scores    jsonb,    -- {dimension_key: {score, status, evidence}}
  brief               jsonb,    -- {who_they_are, why_ranked_here[], what_to_probe[]}
  personal_line       text,
  flags               text[] not null default '{}',
  ai_raw              jsonb,
  model               text,
  scored_at           timestamptz,
  scoring_error       text,

  -- top-N interview brief + email draft (uses [NAME] and {calendar_link} placeholders)
  interview_brief     text,
  draft_kind          text check (draft_kind in ('invite', 'rejection')),
  draft_subject       text,
  draft_body          text,
  draft_source        text check (draft_source in ('ai', 'template', 'edited')),
  draft_error         text,
  drafted_at          timestamptz,
  sent_at             timestamptz
);

create unique index if not exists candidates_email_unique on candidates (lower(email)) where email is not null;
create index if not exists candidates_rank_idx on candidates (assigned_role, total_score desc nulls last);

-- ---------------------------------------------------------------------------
-- Private CV file storage
-- ---------------------------------------------------------------------------
create table if not exists cv_files (
  path          text primary key,
  content_type  text not null,
  data_base64   text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sent emails
-- ---------------------------------------------------------------------------
create table if not exists emails (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  kind           text not null check (kind in ('invite', 'rejection')),
  intended_to    text not null,
  delivered_to   text,
  test_mode      boolean not null,
  simulated      boolean not null default false,  -- true when RESEND_API_KEY is not set
  from_address   text,
  subject        text not null,
  body_text      text not null,
  body_html      text not null,
  status         text not null check (status in ('queued', 'sent', 'failed')),
  sent_at        timestamptz,
  resend_id      text,
  error          text
);
create index if not exists emails_created_idx on emails (created_at desc);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists candidate_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  candidate_id  uuid not null references candidates(id) on delete cascade,
  action        text not null,
  detail        text
);
create index if not exists candidate_events_candidate_idx on candidate_events (candidate_id, created_at);
