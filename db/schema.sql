-- Kargo hiring app: Neon Postgres schema.
-- Run with:  npm run db:setup   (uses DATABASE_URL from .env.local)
-- Safe to re-run: creates what's missing and upgrades older versions in place.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Rubric: one row per criterion per role. Seeded from src/config/rubric.ts,
-- then edited on the Rubric page.
-- ---------------------------------------------------------------------------
create table if not exists rubric_criteria (
  id             serial primary key,
  role           text not null check (role in ('PM', 'SPM')),
  code           text not null,
  dimension_key  text not null,
  name           text not null,
  description    text not null,
  max_points     int  not null default 10,
  weight_pct     int  not null check (weight_pct between 0 and 100),
  sort_order     int  not null,
  unique (role, dimension_key)
);
alter table rubric_criteria add column if not exists max_points int not null default 10;
alter table rubric_criteria add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id                 int primary key default 1 check (id = 1),
  auto_reject_below  int     not null default 30,
  auto_invite_above  int     not null default 80,
  hold_hours         numeric not null default 4,
  calendar_link      text    not null default '{calendar_link}',
  updated_at         timestamptz not null default now()
);
alter table settings add column if not exists auto_reject_below int not null default 30;
alter table settings add column if not exists auto_invite_above int not null default 80;
alter table settings add column if not exists hold_hours numeric not null default 4;
alter table settings drop column if exists top_n;
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Candidates
-- stage: processing    -> uploaded, not scored (or scoring failed)
--        drafting      -> scored, email drafts being written
--        auto_selected -> score above the invite line: invite draft ready, waiting for bulk send
--        review        -> middle band: waiting for Arjun's decision
--        auto_rejected -> score below the reject line: rejection draft ready, waiting for bulk send
--        sent          -> email gone (sent_kind says which)
-- Nothing is ever emailed without Arjun clicking Send (one, or all in a column).
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

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
  stage               text not null default 'processing',

  assigned_role       text check (assigned_role in ('PM', 'SPM')),
  role_source         text check (role_source in ('tagged', 'inferred')),
  role_reasoning      text,
  role_mismatch       boolean not null default false,
  pattern_score       int,
  score_pm            int,
  score_spm           int,
  total_score         int,
  strong_pattern      boolean not null default false,
  dimension_scores    jsonb,
  brief               jsonb,
  personal_line       text,
  flags               text[] not null default '{}',
  ai_raw              jsonb,
  model               text,
  scored_at           timestamptz,
  scoring_error       text
);

alter table candidates add column if not exists band text;
alter table candidates add column if not exists route_reason text;
alter table candidates add column if not exists interview_brief text;
alter table candidates add column if not exists invite_subject text;
alter table candidates add column if not exists invite_body text;
alter table candidates add column if not exists invite_source text;
alter table candidates add column if not exists rejection_subject text;
alter table candidates add column if not exists rejection_body text;
alter table candidates add column if not exists rejection_source text;
alter table candidates add column if not exists draft_error text;
alter table candidates add column if not exists drafted_at timestamptz;
alter table candidates add column if not exists email_scheduled_for timestamptz;
alter table candidates add column if not exists decided_by text;
alter table candidates add column if not exists sent_kind text;
alter table candidates add column if not exists sent_at timestamptz;
-- band_locked: Arjun moved them to review by hand, so re-sorting leaves them there
alter table candidates add column if not exists band_locked boolean not null default false;
-- from the previous version (single draft + top-N)
alter table candidates drop column if exists draft_kind;
alter table candidates drop column if exists draft_subject;
alter table candidates drop column if exists draft_body;
alter table candidates drop column if exists draft_source;
-- Drop the old stage rule first, move old rows, then add the new rule.
alter table candidates drop constraint if exists candidates_stage_check;
update candidates set stage = 'drafting' where stage = 'scored';
-- rows scored before bands existed go to review; nothing is ever sent for them automatically
update candidates set band = 'review' where band is null and stage <> 'processing';
alter table candidates add constraint candidates_stage_check
  check (stage in ('processing', 'drafting', 'review', 'auto_selected', 'auto_rejected', 'invite_pending', 'reject_pending', 'sent'));
alter table candidates drop constraint if exists candidates_band_check;
alter table candidates add constraint candidates_band_check check (band in ('auto_reject', 'review', 'auto_invite'));

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
-- Emails
-- ---------------------------------------------------------------------------
create table if not exists emails (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  kind           text not null check (kind in ('invite', 'rejection')),
  intended_to    text not null,
  delivered_to   text,
  test_mode      boolean not null,
  simulated      boolean not null default false,
  from_address   text,
  subject        text not null,
  body_text      text not null,
  body_html      text not null,
  status         text not null,
  sent_at        timestamptz,
  resend_id      text,
  error          text
);
alter table emails add column if not exists trigger text not null default 'arjun';
alter table emails add column if not exists scheduled_for timestamptz;
alter table emails add column if not exists cancelled_at timestamptz;
alter table emails drop constraint if exists emails_status_check;
alter table emails drop constraint if exists emails_kind_check;
alter table emails add constraint emails_kind_check check (kind in ('invite', 'rejection'));
alter table emails add constraint emails_status_check check (status in ('queued', 'scheduled', 'sent', 'cancelled', 'failed'));
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
