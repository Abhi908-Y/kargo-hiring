/**
 * Calibration check (rubric "Calibration check" section).
 *
 * Runs CVs through the same extract -> redact -> score -> route pipeline the app
 * uses, without touching the database or sending email.
 *
 *   npm run calibrate -- ./past-hires               # score as PM (the rubric's check)
 *   npm run calibrate -- ./past-hires --role SPM
 *   npm run calibrate -- ./past-hires --dry         # extract + redact only, no API calls
 *
 * Writes calibration/report.md, calibration/results.json and the exact redacted
 * text the AI saw to calibration/redacted/. Exits with code 1 if any CV is auto-rejected.
 */
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type Role } from "../src/config/scoring";
import { extractCvText, fileTypeFromName } from "../src/lib/extract";
import { extractContact, redactCv } from "../src/lib/redact";
import { routeCandidate, type RouteResult } from "../src/lib/routing";
import type { ScoringOutput } from "../src/lib/scoring/schema";
import { scoreCv } from "../src/lib/scoring/score";

loadEnv({ path: ".env.local" });
loadEnv();

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const roleArg = args.includes("--role") ? args[args.indexOf("--role") + 1] : "PM";
const dry = args.includes("--dry");
const taggedRole: Role | null = roleArg === "untagged" ? null : (roleArg as Role);

if (!folder || !fs.existsSync(folder)) {
  console.error("Usage: npm run calibrate -- <folder-with-cvs> [--role PM|SPM|untagged] [--dry]");
  process.exit(2);
}
if (!dry && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set (add it to .env.local), or pass --dry.");
  process.exit(2);
}

const outDir = path.join("calibration");
fs.mkdirSync(path.join(outDir, "redacted"), { recursive: true });

interface Row {
  file: string;
  contact: ReturnType<typeof extractContact>;
  warning: string | null;
  leaks: string[];
  route?: RouteResult;
  ai?: ScoringOutput;
  error?: string;
}

/** Check the redacted text for anything that still looks like contact data. */
function findLeaks(redacted: string, contact: Row["contact"]): string[] {
  const leaks: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(redacted)) leaks.push("email");
  if (/https?:\/\/|www\.|linkedin\.com|github\.com/i.test(redacted)) leaks.push("link");
  if (/(?:\+?\d[\s.-]?){10,13}/.test(redacted.replace(/\b(19|20)\d{2}\b/g, ""))) leaks.push("phone?");
  for (const part of contact.fullName?.split(/\s+/) ?? []) {
    if (part.length > 2 && new RegExp(`\\b${part}\\b`, "i").test(redacted)) leaks.push(`name part "${part}"`);
  }
  return leaks;
}

async function main() {
  const files = fs
    .readdirSync(folder!)
    .filter((f) => fileTypeFromName(f))
    .sort();
  if (!files.length) {
    console.error(`No .pdf or .docx files in ${folder}`);
    process.exit(2);
  }
  console.log(`Calibrating ${files.length} CVs as ${taggedRole ?? "untagged"}${dry ? " (dry run)" : ""}\n`);

  const rows: Row[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(folder!, file)));
    const extraction = await extractCvText(bytes, fileTypeFromName(file)!);
    const contact = extractContact(extraction.text, file);
    const redacted = redactCv(extraction.text, contact, file);
    fs.writeFileSync(path.join(outDir, "redacted", `${file}.txt`), redacted);
    const row: Row = { file, contact, warning: extraction.warning, leaks: findLeaks(redacted, contact) };
    rows.push(row);

    if (dry) {
      console.log(`• ${file}: name=${contact.fullName ?? "?"} email=${contact.email ? "found" : "none"} phone=${contact.phone ? "found" : "none"}${row.leaks.length ? `  POSSIBLE LEAK: ${row.leaks.join(", ")}` : ""}`);
      continue;
    }

    process.stdout.write(`• ${file} … `);
    try {
      const { output } = await scoreCv({ candidateId: file, taggedRole, redactedText: redacted });
      row.ai = output;
      row.route = routeCandidate({
        scores: output.scores,
        taggedRole,
        aiFlags: output.flags,
        extractionWarning: extraction.warning,
        settings: DEFAULT_SETTINGS,
      });
      console.log(`${row.route.total}/100 (pattern ${row.route.pattern}) → ${row.route.band}${row.route.rescued ? " (rescued)" : ""}`);
    } catch (e) {
      row.error = (e as Error).message;
      console.log(`ERROR: ${row.error}`);
    }
  }

  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(rows, null, 2));
  if (dry) return;

  const dims = ["A1_fixes_unasked", "A2_owns_the_call", "A3_ground_ops", "A4_steady_under_fire", "A5_writes_down_why", "B1_product_ownership_pm", "B1_product_ownership_spm", "B2_thrives_without_structure"] as const;
  const lines = [
    `# Calibration report`,
    ``,
    `Role: ${taggedRole ?? "untagged"} · Thresholds: reject < ${DEFAULT_SETTINGS.rejectBelow}, shortlist ≥ ${DEFAULT_SETTINGS.shortlistAt}, rescue pattern ≥ ${DEFAULT_SETTINGS.rescuePatternMin}`,
    ``,
    `| CV | A1 | A2 | A3 | A4 | A5 | Pattern | B1 PM | B1 SPM | B2 | Total | Band |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) =>
      r.route
        ? `| ${r.file} | ${dims.map((d) => r.route!.scores[d]).slice(0, 5).join(" | ")} | **${r.route.pattern}** | ${r.route.scores.B1_product_ownership_pm} | ${r.route.scores.B1_product_ownership_spm} | ${r.route.scores.B2_thrives_without_structure} | **${r.route.total}** | ${r.route.band}${r.route.rescued ? " (rescued)" : ""} |`
        : `| ${r.file} | error: ${r.error} |||||||||||`,
    ),
    ``,
    `## Details`,
    ...rows.flatMap((r) => [
      ``,
      `### ${r.file}`,
      r.leaks.length ? `**Redaction check:** possible leak (${r.leaks.join(", ")}). See calibration/redacted/${r.file}.txt` : `Redaction check: clean.`,
      r.warning ? `Extraction warning: ${r.warning}` : ``,
      ...(r.route ? r.route.reasons.map((x) => `- ${x}`) : [`- ${r.error}`]),
      ...(r.ai ? [``, r.ai.brief.who_they_are, ``, ...dims.map((d) => `- **${d}** ${r.ai!.scores[d].score} (${r.ai!.scores[d].status}): ${r.ai!.scores[d].evidence}`)] : []),
    ]),
  ];
  fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));

  const rejected = rows.filter((r) => r.route?.band === "auto_reject");
  const failed = rows.filter((r) => r.error);
  console.log(`\nReport: calibration/report.md`);
  console.log(`Auto-rejected: ${rejected.length} of ${rows.length}${failed.length ? ` · errors: ${failed.length}` : ""}`);
  if (rejected.length) {
    console.log(`CALIBRATION FAILED: ${rejected.map((r) => r.file).join(", ")}`);
    process.exitCode = 1;
  } else if (!failed.length) {
    console.log("CALIBRATION PASSED: no past hire was auto-rejected.");
  }
}

main();
