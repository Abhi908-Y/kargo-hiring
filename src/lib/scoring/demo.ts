// Demo-mode stand-in for the Claude scorer: a keyword heuristic that returns the
// same JSON shape so every page and rule can be tried before an API key exists.
// It is NOT the real scorer and its numbers mean little. Used only when
// DEMO_MODE=true and ANTHROPIC_API_KEY is not set.

import type { Role } from "@/config/scoring";
import type { ScoringOutput } from "./schema";
import type { ScoreResult } from "./score";

type Level = { score: number; re: RegExp; also?: RegExp };

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

function sentences(text: string) {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.replace(/^[\s•*\-–]+/, "").trim())
    .filter((s) => s.length > 12 && !/^\[[A-Z ]+\]$/.test(s));
}

/** Highest level whose pattern matches a CV sentence; that sentence is the evidence. */
function grade(lines: string[], levels: Level[], whole: string) {
  for (const level of [...levels].sort((a, b) => b.score - a.score)) {
    const hit = lines.find((l) => level.re.test(l) && (!level.also || level.also.test(l) || level.also.test(whole)));
    if (hit) return { score: level.score, status: "evidenced" as const, evidence: hit.length > 220 ? `${hit.slice(0, 217)}…` : hit };
  }
  return { score: 0, status: "not_evidenced" as const, evidence: "Not mentioned in CV" };
}

function yearsOfExperience(text: string) {
  const current = new Date().getFullYear();
  let total = 0;
  for (const m of text.matchAll(/\b((?:19|20)\d{2})\s*[-–to]+\s*((?:19|20)\d{2}|present|current|now|date)\b/gi)) {
    const start = Number(m[1]);
    const end = /\d/.test(m[2]) ? Number(m[2]) : current;
    if (end >= start && end - start < 40) total += end - start;
  }
  return total;
}

const ADOPTED = /adopt|used by|rolled out|became (the )?(standard|default|team practice)|across (the )?(team|teams|company)|\d+\s+(colleagues|people|users|agents|teams)/i;
const OPS_LOGISTICS = /freight|logistic|supply chain|3pl|port\b|customs|shipment|carrier|warehouse|fleet|documentation desk|trucking|last.mile|dispatch|cargo/i;

export async function demoScoreCv(opts: { candidateId: string; taggedRole: Role | null; redactedText: string }): Promise<ScoreResult> {
  const text = opts.redactedText;
  const lines = sentences(text);
  const years = yearsOfExperience(text);

  const scores: ScoringOutput["scores"] = {
    A1_fixes_unasked: grade(lines, [
      { score: 15, re: /on my own|own initiative|unasked|nobody asked|without being asked|weekend|noticed|self.initiated|side project/i, also: ADOPTED },
      { score: 10, re: /on my own|own initiative|unasked|nobody asked|without being asked|weekend|noticed|self.initiated|side project/i },
      { score: 5, re: /improved|streamlined|automated|reduced/i },
    ], text),
    A2_owns_the_call: grade(lines, [
      { score: 15, re: /\bsole\b|reporting (directly )?to (the )?(ceo|founder|cto)|no (product|pm|senior|cmo|account manager)[\w ]*layer|limited oversight|final (call|decision)/i },
      { score: 10, re: /owned|end.to.end|accountable for|led the/i },
      { score: 5, re: /responsible for|contributed|supported/i },
    ], text),
    A3_ground_ops: grade(lines, [
      { score: 12, re: OPS_LOGISTICS, also: /ran|operations|desk|floor|coordinat|on the ground|handled|managed/i },
      { score: 8, re: /manufactur|fulfil|field ops|plant|shop floor|operations (associate|executive|manager)/i },
      { score: 4, re: /operations (team|users)|ops (team|users)|sold to|built for/i },
    ], text),
    A4_steady_under_fire: grade(lines, [
      { score: 8, re: /overnight|outage|incident|crisis|\bhold\b|48.hour|restored|under pressure|broke|went down|escalation/i, also: /i owned|owned the|fixed|resolved|restored|patched/i },
      { score: 4, re: /incident|outage|on.call|escalation/i },
    ], text),
    A5_writes_down_why: grade(lines, [
      { score: 10, re: /killed|post.mortem|retro|wrote up why|decision log|sunset|shut down/i },
      { score: 7, re: /\bsops?\b|template|playbook|runbook|process doc/i, also: ADOPTED },
      { score: 4, re: /\bspecs?\b|\bprds?\b|documentation|documented|wrote/i },
    ], text),
    B1_product_ownership_pm: grade(lines, [
      { score: 25, re: /killed|sunset|shut down|deprecated/i, also: /product (manager|owner)|\bpm\b|shipped/i },
      { score: 16, re: /product (manager|owner)|shipped|launched/i },
      { score: 8, re: /\bspecs?\b|requirements|\bprds?\b|user needs|roadmap|what to build/i },
    ], text),
    B1_product_ownership_spm: grade(lines, [
      { score: years >= 5 ? 25 : 16, re: /platform|integration|\bapis?\b|data layer|architect|build vs|infrastructure/i, also: years >= 5 ? /product|owned|sole/i : undefined },
      { score: years >= 5 ? 16 : years >= 3 ? 8 : 0, re: /product (manager|owner)|owned|led/i },
    ], text),
    B2_thrives_without_structure: grade(lines, [
      { score: 15, re: /founding|first (pm|hire|product|engineer|person)|from (zero|scratch)|0 to 1|zero to one|built the (function|team|process)/i },
      { score: 10, re: /early.stage|startup|\bseed\b|series a|first\b/i },
      { score: 5, re: /series [b-d]|growth.stage|scale.?up/i },
    ], text),
  };

  const b1pm = scores.B1_product_ownership_pm.score;
  const b1spm = scores.B1_product_ownership_spm.score;
  const assigned: Role = opts.taggedRole ?? (b1spm > b1pm ? "SPM" : "PM");

  const flags: string[] = [];
  const city = text.match(/\b(Pune|Bangalore|Bengaluru|Delhi|Gurgaon|Gurugram|Noida|Hyderabad|Chennai|Kolkata|Ahmedabad|Jaipur|Dubai|Singapore|London)\b/);
  if (city && !/mumbai/i.test(text.slice(0, 400)) && !/relocat/i.test(text)) flags.push("location");
  const bigNumber = lines.find((l) => /\b\d{2,3}\s?%|\b\d+(,\d+)+\b|\b\d+x\b/i.test(l));
  if (bigNumber) flags.push(`claims_to_verify: ${bigNumber.slice(0, 120)}`);

  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const code = (k: string) => k.split("_")[0];
  const gaps = Object.entries(scores).filter(([, v]) => v.status === "not_evidenced").map(([k]) => k);
  const PROBES: Record<string, string> = {
    A1_fixes_unasked: "Tell me about something broken you fixed that nobody asked you to fix. Who used it afterwards?",
    A2_owns_the_call: "What's a call you made with no one senior approving it, and how did it turn out?",
    A3_ground_ops: "When have you worked inside an operations team rather than alongside one?",
    A4_steady_under_fire: "Walk me through a live failure you personally owned the fix for.",
    A5_writes_down_why: "What's something you killed or got wrong, and what did you write down about why?",
    B1_product_ownership_pm: "Which feature did you ship and later kill, and what evidence made the call?",
    B1_product_ownership_spm: "Describe a build vs configure vs don't-touch decision you made on a platform or integration.",
    B2_thrives_without_structure: "When have you built a process or function from zero?",
  };
  const probes = [...gaps, ...ranked.slice().reverse().map(([k]) => k)].filter((k, i, a) => a.indexOf(k) === i).slice(0, 3).map((k) => PROBES[k]);
  if (flags.includes("location")) probes[2] = "The role is in Mumbai. Would you relocate, and on what timeline?";

  const top = ranked.find(([, v]) => v.status === "evidenced");
  const output: ScoringOutput = {
    candidate_id: opts.candidateId,
    scores,
    assigned_role: assigned,
    role_source: opts.taggedRole ? "tagged" : "inferred",
    role_reasoning: `Demo heuristic: B1 PM ${b1pm} vs B1 SPM ${b1spm}, about ${years} years of dated experience.`,
    role_mismatch_flag: false,
    brief: {
      who_they_are: `[Demo scorer, not AI] About ${years || "an unknown number of"} years of experience across the roles listed. ${lines.find((l) => /\(\s*(19|20)\d{2}/.test(l)) ?? lines[0] ?? ""}`.trim(),
      why_ranked_here: ranked.slice(0, 3).map(([k, v]) => `${code(k)}: ${v.status === "evidenced" ? v.evidence : "not evidenced in the CV"}`),
      what_to_probe: probes,
    },
    personal_line: top ? `Your work where you ${top[1].evidence.replace(/^(i |we )/i, "").split(/[.;]/)[0].toLowerCase().split(" ").slice(0, 14).join(" ")} stood out to me.` : "",
    flags,
  };

  // Mimic a little latency so the upload progress bar is visible.
  await new Promise((r) => setTimeout(r, 1200));
  return { output, model: "demo-keyword-heuristic", usage: { input: 0, output: 0, cacheRead: 0 } };
}
