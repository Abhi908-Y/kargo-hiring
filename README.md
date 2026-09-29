# Kargo Hiring

A hiring app for Arjun (founder, Kargo). Upload CVs for the PM and Senior PM roles. Each one gets scored against [`rubric/arjun_rubric.md`](rubric/arjun_rubric.md). Clear rejects and clear shortlists get an email automatically, with a 4-hour Undo window. Everything else goes to Arjun's review queue.

**Stack:** Next.js 16 (TypeScript) on Vercel · Supabase (Postgres, private CV storage, login) · Resend (email) · Anthropic API, `claude-sonnet-5` (scoring).

## How it works

1. **Upload** (`/upload`): drag and drop, or pick, `.pdf` and `.docx` files. Each file gets a role: PM, Senior PM, or Untagged. Files are sent one per request, with a progress bar.
2. **Extract and clean up** (`src/lib/extract.ts`, `src/lib/redact.ts`): the app reads the text and skips duplicates (same file, same text, or same email). Before anything goes to the AI, it removes the **name, email, phone and links**, plus date of birth, gender, marital status and street address lines. Contact details are stored separately and are used only for emails. The candidate page shows exactly what the AI saw.
3. **Score** (`src/lib/scoring/`): Claude scores the 8 rubric dimensions. Every score comes with a quoted line from the CV as evidence. For untagged CVs, the AI suggests PM or SPM.
4. **Route** (`src/lib/routing.ts`): the **server, not the AI**, adds up the totals, assigns the role using the rubric's rules, and picks the route:

   | Condition | Result |
   |---|---|
   | CV text unreadable, or scoring failed | Review |
   | total ≥ 90 | Auto-shortlist (email held 4h, Undo) |
   | total < 40 **and** pattern ≥ 30 | Review (rescued) |
   | total < 40 **and** the other role would score ≥ 40 | Review (rescued) |
   | total < 40 otherwise | Auto-reject (email held 4h, Undo) |
   | 40 – 89 | Review |

   Automatic emails also fall back to review if the CV has no email address. Shortlists also fall back to review if test mode is off and the calendar link isn't set.
5. **Emails** (`src/lib/emails/`): automatic emails are scheduled 4 hours ahead with Resend's scheduled send. **Undo** cancels the email with Resend and moves the candidate to review. **Approve** and **Reject** in the review queue send the email immediately. All emails come from Arjun by name.
6. **TEST_MODE** is **on unless set to `false`**. While it's on, every email goes to `TEST_MODE_EMAIL`, and the subject shows who it was really for.

Thresholds, hold time and calendar link can be edited on `/settings`. The defaults live in `src/config/scoring.ts`.

## Pages

Login · Dashboard · Upload · Review queue · All candidates (ranked) · Candidate detail (brief, score breakdown with evidence, what to probe, email preview, what the AI saw) · Sent emails · Settings.

---

## Try it now, no keys needed (demo mode)

`.env.local` already contains `DEMO_MODE=true`. Run:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and upload the fictional CVs in [`samples/`](samples/). In demo mode:

- Data is saved in `.demo-data/` on this computer. There's a **Reset demo data** button in Settings.
- There's no login.
- Emails are recorded on the Emails page but never sent.
- CVs are scored by a **keyword heuristic, not the AI**. It exists so you can try every page, button and routing rule. Its numbers mean nothing. Add `ANTHROPIC_API_KEY` to `.env.local` and demo mode uses real Claude scoring instead.

Demo mode is switched off automatically on Vercel, because it has no login. To use the real setup, remove `DEMO_MODE=true` and fill in the keys below.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables and the private `cvs` storage bucket.
3. **Authentication → Users → Add user → Create new user**: enter Arjun's email and a password, and tick **Auto Confirm User**.
4. **Authentication → Sign In / Providers**: turn off **Allow new users to sign up**.
5. **Project Settings → API**: copy the Project URL, the `anon`/publishable key and the `service_role`/secret key.

### 2. Resend

1. Create an API key at [resend.com](https://resend.com).
2. Before your domain is verified, Resend can only send from `onboarding@resend.dev` **to the email address on your Resend account**. So keep `TEST_MODE` on, leave `EMAIL_FROM_ADDRESS` empty, and set `TEST_MODE_EMAIL` to your Resend account email.
3. To go live: verify the domain in Resend, set `EMAIL_FROM_ADDRESS` (e.g. `arjun@kargo.in`) and `TEST_MODE=false`, set a real calendar link in Settings, then redeploy.

### 3. Local run

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3000
```

### 4. GitHub + Vercel

```bash
git init && git add -A && git commit -m "Kargo hiring app"
git remote add origin https://github.com/<you>/kargo-hiring.git
git push -u origin main
```

On [vercel.com](https://vercel.com): **Add New → Project → import the repo**, add every variable from `.env.example` under **Environment Variables**, and deploy. The scoring route needs up to 5 minutes (`maxDuration = 300`), which works on all plans with Fluid Compute (on by default).

## Calibration check

The rubric says to run the eight retained hires as **PM**. None of them should be auto-rejected.

```bash
npm run calibrate -- ./past-hires            # needs ANTHROPIC_API_KEY in .env.local
npm run calibrate -- ./past-hires --dry      # check extraction + removal of personal details only, no API calls
```

This writes `calibration/report.md` (per-dimension scores, evidence, band), `calibration/results.json`, and the exact text the AI saw in `calibration/redacted/`. It exits with code 1 if any CV is auto-rejected. The `calibration/` and `past-hires/` folders are git-ignored because they contain real CV text.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests for routing, removal of personal details, and email templates |
| `npm run typecheck` | TypeScript check |
| `npm run calibrate -- <folder>` | Calibration run (see above) |

## Security notes

- Row-level security is on for every table and no policies are defined. The browser can't read the database directly. All data access goes through server routes that first check the signed-in user is `ADMIN_EMAIL`.
- CV files sit in a private bucket and are downloaded through short-lived signed URLs.
- The scoring prompt treats CV text as data, so instructions hidden in a CV aimed at the AI are ignored and flagged.
