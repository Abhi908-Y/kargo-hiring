/**
 * Creates/upgrades the tables in Neon and adds any missing rubric_criteria rows
 * from src/config/rubric.ts. Existing rubric rows (Arjun's edits) are kept.
 *   npm run db:setup
 * Reads DATABASE_URL from .env.local. Safe to re-run.
 */
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_RUBRIC } from "../src/config/rubric";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Add your Neon connection string to .env.local.");
    process.exit(2);
  }
  const sql = neon(url);

  const schema = fs.readFileSync(path.join("db", "schema.sql"), "utf8");
  const statements = schema
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await sql.query(s);
  console.log(`Schema applied (${statements.length} statements).`);

  for (const c of DEFAULT_RUBRIC) {
    // New rows get the defaults; existing rows keep Arjun's name/description/weight.
    await sql.query(
      `INSERT INTO rubric_criteria (role, code, dimension_key, name, description, max_points, weight_pct, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (role, dimension_key) DO UPDATE SET code = EXCLUDED.code, max_points = EXCLUDED.max_points, sort_order = EXCLUDED.sort_order`,
      [c.role, c.code, c.dimension_key, c.name, c.description, c.max_points, c.weight_pct, c.sort_order],
    );
  }
  const rows = (await sql.query(
    `SELECT role, count(*)::int AS criteria, sum(weight_pct)::int AS total_weight FROM rubric_criteria GROUP BY role ORDER BY role`,
  )) as { role: string; criteria: number; total_weight: number }[];
  for (const r of rows) console.log(`rubric_criteria ${r.role}: ${r.criteria} criteria, weights total ${r.total_weight}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
