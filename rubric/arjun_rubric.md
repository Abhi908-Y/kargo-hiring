# Arjun's Hiring Rubric — Kargo PM & Senior PM

One rubric for both roles. Score out of 100.

- **Part A: Arjun's Pattern (60 pts).** What Kargo's eight retained hires have in common. It is the same for both roles.
- **Part B: Role Fit (40 pts).** The bar for B1 changes with the role (PM or Senior PM). B2 is the same for both.

## Where the pattern comes from

These eight people are still at Kargo: Rohan (engineer), Sunita (ops), Vikram (PM), Aditya (sales), Preetham (engineer), Meghna (CS), Lavanya (PM), and Rahul (marketing). They have different functions, different colleges, and different career lengths. Their titles and pedigree do **not** predict success at Kargo. What predicts it is how they work, which is the five behaviours in Part A.

Limitation: this pattern comes only from people who stayed. We have no profiles of people who left, so we can't yet say what distinguishes a failed hire. Revisit the rubric once that data exists.

---

## Hard rules for the scorer

1. **No evidence, no points.** Every point must be backed by a specific line in the CV. Quote or closely paraphrase that line in the `evidence` field.
2. **Missing is not the same as negative.** If the CV simply doesn't mention something, score it low and mark it `not_evidenced`. Never assume the candidate lacks it, and suggest a probe question to check.
3. **Judge the work, not the title.** An engineer who turned field requirements into specs "without a product layer" has done product work. Credit behaviour whatever the job title says.
4. **Never score on:** college or university name, company brand or prestige, number of certifications, CV design or format, buzzwords, employment gaps, name, gender, age, or anything else about who the person is rather than what they did.
5. **Adoption beats activity.** "Built X" is good. "Built X and 30 colleagues used it within a month" is much better. Look for other people using what the candidate made.
6. **Do not compute the band.** Return dimension scores only. The backend adds up the totals and decides auto-reject, review, or shortlist.

---

## Part A: Arjun's Pattern (60 pts)

### A1. Fixes what nobody asked them to fix (15 pts)
They noticed a broken process, built a scrappy fix on their own initiative, and others adopted it.
*Seen in: all 8 hires. Examples include Rohan's Excel tracker and weekend BL prototype, Sunita's weekend workflow redesign, Lavanya's triage process, and Preetham's exception dashboard.*

| Score | Anchor |
|---|---|
| 0 | No evidence of self-initiated work; only assigned tasks |
| 5 | Improved something within their own assigned scope |
| 10 | Built something on their own initiative, but no evidence of adoption |
| 15 | Built something unasked **and** others adopted it (team, other teams, standard practice) |

### A2. Owns the call with no layer above (15 pts)
They make decisions and carry the outcome without a senior person approving each call.
*Seen in: 7 of 8. The CVs use phrases like "no product layer," "no account manager layer," "no CMO above," "sole PM," and "limited oversight."*

| Score | Anchor |
|---|---|
| 0 | Always supporting or executing someone else's decisions |
| 5 | Owned pieces, but a senior layer made the key calls |
| 10 | Owned an area end to end with some oversight |
| 15 | Explicitly the sole owner or decision-maker; reported to the CEO/founder or had no layer above |

### A3. Has been on the ground in operations (12 pts)
They have worked inside operations in logistics, freight, supply chain, or another operations-heavy domain, not just on calls with operations teams.
*Seen in: 5 of 8 (Rohan, Sunita, Aditya, Meghna, Lavanya).*

| Score | Anchor |
|---|---|
| 0 | No operations exposure |
| 4 | Built for or sold to operations users, but at arm's length |
| 8 | Hands-on operations work in a non-logistics domain (field ops, manufacturing, fulfilment) |
| 12 | Hands-on work inside freight, logistics, or supply chain operations (documentation desk, carrier coordination, port, 3PL) |

### A4. Stays steady when things break (8 pts)
They handled a live failure or crisis calmly and owned the fix.
*Seen in: Meghna's overnight customs hold, Sunita's surprise vendor format change, Rohan's migration under time pressure, Preetham's 48-hour patch.*

| Score | Anchor |
|---|---|
| 0 | No evidence |
| 4 | Part of an incident response |
| 8 | Personally owned the resolution of a specific, high-stakes failure |

### A5. Writes down why (10 pts)
They document their reasoning, learn openly from failure, and kill things that don't work.
*Seen in: Aditya's lost-deal post-mortem that became team practice, Lavanya killing two features on usage data, Sunita's SOPs, Vikram's PRD template.*

| Score | Anchor |
|---|---|
| 0 | No evidence |
| 4 | Writes documentation or specs as part of the job |
| 7 | Created a process, template, or SOP that others adopted |
| 10 | Documented a failure or kill decision and the reasoning, and it changed how the team works |

---

## Part B: Role Fit (40 pts)

### B1. Product ownership at the role's level (25 pts)
**Score this dimension twice, once against the PM bar and once against the Senior PM bar.** Return both scores.

**PM bar (JD: 2–4 years; shipped and killed things in short cycles; first-time building):**

| Score | Anchor |
|---|---|
| 0 | No product-type work at all |
| 8 | Product-adjacent work: wrote specs, turned user needs into requirements, worked closely with engineering on what to build |
| 16 | Worked as a PM and shipped features, but inside a large, structured PM team, or with no evidence of killing or learning |
| 25 | 2+ years owning a product area; shipped **and** killed things based on evidence; measured outcomes |

**Senior PM bar (JD: 5–8 years; owned an area with no senior PM above; platform, integration, or data layer; build vs configure vs don't-touch calls):**

| Score | Anchor |
|---|---|
| 0 | Under 3 years of product ownership, and no platform experience |
| 8 | 3–5 years as a PM, but no platform or integration work |
| 16 | 5+ years **or** deep platform/integration ownership (including a senior engineer who made platform decisions), but not both |
| 25 | 5–8 years owning a product area with no senior PM above; integration or platform layer; clear architectural product calls |

### B2. Thrives without structure (15 pts)
Early-stage or undefined environments where they built the rules rather than followed them.

| Score | Anchor |
|---|---|
| 0 | Only large, mature organisations with established processes |
| 5 | A growth-stage company, but joined an existing function |
| 10 | An early-stage company, **or** the first person in a role or function |
| 15 | Built a function, process, or product from zero in an undefined environment |

---

## Role assignment

- **Tagged CV:** keep the tagged role. If the other role's B1 score is at least 8 points higher, set `role_mismatch_flag: true` and explain why.
- **Untagged CV:** assign whichever role has the higher B1 score. On a tie, assign PM (the lower bar, which protects against false negatives) and set `role_mismatch_flag: true`.
- Always explain the role call in one sentence in `role_reasoning`.

## Flags (no score impact)

- `location`: the CV shows a location other than Mumbai and doesn't mention relocation. Add a relocation probe question. **Never** lower the score for this.
- `low_extraction_confidence`: the CV text looks garbled, incomplete, or scanned.
- `claims_to_verify`: large or unusual numbers worth checking in the interview.

---

## Output schema (JSON only, no preamble)

```json
{
  "candidate_id": "string",
  "scores": {
    "A1_fixes_unasked": {"score": 0, "status": "evidenced | not_evidenced", "evidence": "string"},
    "A2_owns_the_call": {"score": 0, "status": "...", "evidence": "..."},
    "A3_ground_ops": {"score": 0, "status": "...", "evidence": "..."},
    "A4_steady_under_fire": {"score": 0, "status": "...", "evidence": "..."},
    "A5_writes_down_why": {"score": 0, "status": "...", "evidence": "..."},
    "B1_product_ownership_pm": {"score": 0, "status": "...", "evidence": "..."},
    "B1_product_ownership_spm": {"score": 0, "status": "...", "evidence": "..."},
    "B2_thrives_without_structure": {"score": 0, "status": "...", "evidence": "..."}
  },
  "assigned_role": "PM | SPM",
  "role_source": "tagged | inferred",
  "role_reasoning": "one sentence",
  "role_mismatch_flag": false,
  "brief": {
    "who_they_are": "2 sentences, no personal details",
    "why_ranked_here": ["3 evidence-backed points tied to dimensions"],
    "what_to_probe": ["3 interview questions targeting gaps or unverified claims"]
  },
  "personal_line": "max 25 words, one specific thing from the CV that stood out, for the shortlist email",
  "flags": ["location", "low_extraction_confidence", "claims_to_verify: ..."]
}
```

---

## Routing (applied by the backend, not the LLM)

```
pattern       = A1 + A2 + A3 + A4 + A5              (max 60)
role_fit      = B1[assigned_role] + B2              (max 40)
total         = pattern + role_fit                  (max 100)

RESCUE RULE:   if pattern >= 30, never auto-reject → minimum band is REVIEW
EXTRACTION:    if low_extraction_confidence → REVIEW

total < 40   (and no rescue)  → AUTO-REJECT     (email held 4h, undo available)
40 – 89                       → REVIEW          (Arjun approves or rejects)
total >= 90                   → AUTO-SHORTLIST  (email held 4h, undo available)
```

All thresholds live in a config file so they can be tuned after calibration.

## Calibration check

Run the eight retained hires through the scorer against the PM role. **None of them should land in auto-reject.** They are the proof that this pattern works at Kargo, even where the JD fit isn't perfect. If any of them does get auto-rejected, the weights or anchors are wrong and need adjusting.
