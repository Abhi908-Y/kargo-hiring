# Kargo Hiring

A hiring dashboard for Arjun, the founder of Kargo. He uploads CVs for the Product Manager and Senior Product Manager roles. Each one is scored against his rubric for **both** roles. The top candidates per role get a 3-sentence interview brief and an invite draft; everyone else gets a warm rejection draft. Arjun reads the ranked list and clicks **Confirm & send**. **Nothing goes out without him.**

**Live:** https://kargo-hiring-murex.vercel.app (every push to `main` deploys automatically)

**Stack:** Next.js 16 (TypeScript) on Vercel · Neon Postgres (data and CV files) · Google Gemini (scoring, briefs, drafts; `gemini-3.8-flash` by default) · Resend (email) · GitHub.

## How it works

1. **Upload** (`/upload`): drag and drop, or pick, `.pdf` and `.docx` files. Choose the role each person applied for: PM, Senior PM, or Untagged (the AI picks). Files go one per request, with a progress bar.
2. **Separate personal details** (`src/lib/redact.ts`): the name, email, phone and links, plus date-of-birth, gender and address lines, are pulled out **with code, not AI**. They're stored privately in the `candidates` table (`full_name`, `email`, `phone`) and **never sent to any AI step**. The AI only sees `redacted_text`, and the candidate page shows exactly what it saw. Duplicates (same file, same text or same email) are skipped.
3. **Score** (`src/lib/scoring/`): Gemini scores every CV against the rubric's 7 criteria per role and quotes the CV line behind each score. The server adds up **PM and SPM totals** (`score_pm`, `score_spm`) and assigns the role using the rubric's rules.
4. **Rank** (`src/lib/ranking.ts`): candidates are ranked within their role. The **top N per role** (default 5, set in Settings) are "above the line".
5. **Brief and draft** (`src/lib/drafting/`): Gemini writes a 3-sentence interview brief for each top-N candidate. It also writes a personalised email draft for **everyone**: an invite above the line, a warm rejection below it. Drafts use `[NAME]` and `{calendar_link}` placeholders, which are filled in from the stored personal details and Settings only when previewing and sending. Unsafe drafts (missing placeholder, leaked redaction marker, missing rejection sentence) fall back to standard wording. Drafts refresh automatically when the top N changes, except ones Arjun has edited.
6. **Send** (dashboard or candidate page): Arjun reads the brief and draft, edits if he wants, and clicks **Confirm & send**. Resend delivers it, the email is logged on **Sent emails**, and the card is marked sent. Double sends are blocked.

A rejection draft for someone with a strong rubric pattern (30 or more out of 60) is marked **"Strong pattern: check before rejecting"**, carried over from the rubric's rescue rule.

**TEST_MODE** is on unless it's set to `false`. While it's on, every email goes to `TEST_MODE_EMAIL`, and the subject shows the real recipient. Set `TEST_MODE=false` when the candidates' own addresses are safe test addresses.

## Database (Neon)

| Table | What's in it |
|---|---|
| `rubric_criteria` | One row per criterion per role (7 × 2), with name, description and weight %. Seeded from `src/config/rubric.ts`, which is transcribed from `rubric/arjun_rubric.md`. |
| `candidates` | Personal details (private), redacted CV text, per-criterion scores with evidence (`dimension_scores`), PM and SPM totals, brief, interview brief, email draft, sent status |
| `emails` | Every email sent |
| `cv_files` | Original CV files (private, served only to the signed-in admin) |
| `settings` | Top N per role, calendar link |
| `candidate_events` | Activity log |

Schema: [`db/schema.sql`](db/schema.sql). `npm run db:setup` creates it and fills `rubric_criteria`.

## Try it now, no keys needed (demo mode)

`.env.local` already contains `DEMO_MODE=true`:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and upload the fictional CVs in [`samples/`](samples/). In demo mode, data is saved in `.demo-data/`, there's no login, emails are recorded but never sent, and scoring and drafts use a **keyword heuristic, not the AI**. Add `GEMINI_API_KEY` and demo mode uses real Gemini instead. Demo mode is always off on Vercel.

## Setup

### 1. Neon
1. Create a project at [neon.tech](https://neon.tech), then click **Connect** and copy the **pooled** connection string into `DATABASE_URL` in `.env.local`.
2. Run `npm run db:setup`. It should print `rubric_criteria PM: 7 criteria, weights total 100%`, and the same for SPM.

### 2. Keys in `.env.local` (see [`.env.example`](.env.example))
`DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (32+ random characters), `GEMINI_API_KEY`, and later `RESEND_API_KEY`, `EMAIL_REPLY_TO` and `TEST_MODE_EMAIL`. Delete `DEMO_MODE=true`. Never commit `.env.local`; it's in `.gitignore`.

### 3. Vercel
Go to **kargo-hiring → Settings → Environment Variables**, add the same variables except `DEMO_MODE`, then **Redeploy**. You can also add Neon from the Vercel Marketplace, which sets `DATABASE_URL` for you.

### 4. Resend
Create an API key at [resend.com](https://resend.com) and add it as `RESEND_API_KEY`. Until a domain is verified, Resend only sends from `onboarding@resend.dev` **to your own Resend account email**. To go live: verify the domain, set `EMAIL_FROM_ADDRESS`, put a real calendar link in Settings, set `TEST_MODE=false`, and redeploy.

## Rubric check on past hires

The rubric says none of the eight retained hires should score in its reject band: a total below 40 with a pattern below 30.

```bash
npm run calibrate -- ./past-hires          # needs GEMINI_API_KEY in .env.local
npm run calibrate -- ./past-hires --dry    # extraction + personal-detail removal only
```

It writes `calibration/report.md` and the exact text the AI saw to `calibration/redacted/`. Both are git-ignored.

## Data privacy notes

- **Gemini free tier vs paid:** on the free tier of Google AI Studio / the Gemini API, Google may use the content you send to improve its products, and humans may review it. With billing enabled (paid tier), Google says prompts and responses are not used to improve its products. Use a billed key for real candidate data.
- **Why the extraction step matters for DPDP (India's Digital Personal Data Protection Act, 2023):** personal identifiers are separated **before** any AI call, so the AI processor never receives them. That is data minimisation and purpose limitation. The identifiers live only in our database, which only Arjun can access, and are used only to address the email. A real deployment would also need a lawful basis or consent notice, a retention and deletion policy, and a way for candidates to ask for their data to be erased.
- Every table is reached only through server routes that check Arjun's signed login cookie. CV files are served only to him. The scoring and drafting prompts treat CV text as data, so instructions hidden in a CV are ignored.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests: personal-detail removal, both-role scores, ranking, draft safety checks, Neon SQL generation |
| `npm run db:setup` | Create Neon tables and seed `rubric_criteria` |
| `npm run calibrate -- <folder>` | Past-hire check (see above) |
