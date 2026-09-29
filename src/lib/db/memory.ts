import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RUBRIC_CRITERIA } from "@/config/rubric";
import { DEFAULT_SETTINGS } from "@/config/scoring";
import { finish, Query, splitCols, type Db, type Filter, type Plan, type Result, type Row } from "./query";

// Demo-mode backend: the same tables as db/schema.sql, kept in a JSON file.
// It re-reads the file on every query so server components and route handlers
// always see the same data.

type Tables = Record<string, Row[]>;

const ROOT = path.join(process.cwd(), ".demo-data");
const DB_FILE = path.join(ROOT, "db.json");
const FILES = path.join(ROOT, "files");

function load(): Tables {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { settings: [], candidates: [], emails: [], candidate_events: [] };
      // Locked or mid-swap: retry, and never fall back to "empty" (a later save would wipe the data).
      if (attempt >= 8) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

function save(t: Tables) {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(t, null, 1));
  // On Windows (and in OneDrive folders) the file can be briefly locked by a
  // concurrent read or the sync client, so retry the swap a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, DB_FILE);
      return;
    } catch (e) {
      if (attempt >= 8) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

export function resetDemoData() {
  fs.rmSync(ROOT, { recursive: true, force: true });
}

const now = () => new Date().toISOString();

function withDefaults(table: string, row: Row, t: Tables): Row {
  switch (table) {
    case "candidates":
      return {
        id: crypto.randomUUID(), created_at: now(), updated_at: now(), file_path: null, full_name: null, first_name: null,
        email: null, phone: null, extraction_warning: null, tagged_role: null, stage: "processing",
        assigned_role: null, role_source: null, role_reasoning: null, role_mismatch: false, pattern_score: null,
        score_pm: null, score_spm: null, total_score: null, strong_pattern: false, dimension_scores: null, brief: null,
        personal_line: null, flags: [], ai_raw: null, model: null, scored_at: null, scoring_error: null,
        interview_brief: null, draft_kind: null, draft_subject: null, draft_body: null, draft_source: null,
        draft_error: null, drafted_at: null, sent_at: null,
        ...row,
      };
    case "emails":
      return {
        id: crypto.randomUUID(), created_at: now(), delivered_to: null, simulated: false, from_address: null,
        sent_at: null, resend_id: null, error: null,
        ...row,
      };
    case "candidate_events":
      return { id: (t.candidate_events?.at(-1)?.id ?? 0) + 1, created_at: now(), detail: null, ...row };
    case "settings":
      return { id: 1, top_n: DEFAULT_SETTINGS.topN, calendar_link: DEFAULT_SETTINGS.calendarLink, updated_at: now(), ...row };
    default:
      return row;
  }
}

/** Mirrors the unique constraints in db/schema.sql. */
function uniqueViolation(table: string, rows: Row[], candidate: Row): string | null {
  if (table !== "candidates") return null;
  for (const other of rows) {
    if (other.id === candidate.id) continue;
    if (other.file_hash === candidate.file_hash) return "file_hash";
    if (other.text_hash === candidate.text_hash) return "text_hash";
    if (candidate.email && other.email && other.email.toLowerCase() === candidate.email.toLowerCase()) return "email";
  }
  return null;
}

function matches(row: Row, filters: Filter[]) {
  return filters.every((f) => {
    const v = row[f.col];
    if (f.op === "eq") return v === f.value;
    if (f.op === "in") return (f.value as unknown[]).includes(v);
    return v != null && v <= (f.value as string);
  });
}

function project(row: Row, cols: string, t: Tables): Row {
  const out: Row = {};
  for (const p of splitCols(cols)) {
    const embed = p.match(/^(\w+)\(([^)]*)\)$/);
    if (embed) {
      // e.g. candidates(full_name, file_name) on emails, via candidate_id
      const [, table, inner] = embed;
      const target = (t[table] ?? []).find((r) => r.id === row[`${table.replace(/s$/, "")}_id`]);
      out[table] = target ? project(target, inner, t) : null;
    } else if (p === "*") {
      Object.assign(out, row);
    } else {
      out[p] = row[p] ?? null;
    }
  }
  return out;
}

const duplicate = (col: string): Result => ({
  data: null,
  error: { message: `duplicate key value violates unique constraint (${col})`, code: "23505" },
});

async function execute(plan: Plan): Promise<Result> {
  const t = load();
  const rows = (t[plan.table] ??= []);
  let result: Row[] = [];

  if (plan.op === "insert" || plan.op === "upsert") {
    const items = (Array.isArray(plan.payload) ? plan.payload : [plan.payload!]) as Row[];
    for (const item of items) {
      const existing = plan.op === "upsert" ? rows.findIndex((r) => r.id === item.id) : -1;
      const row = existing >= 0 ? { ...rows[existing], ...item } : withDefaults(plan.table, item, t);
      const clash = uniqueViolation(plan.table, rows, row);
      if (clash) return duplicate(clash);
      if (existing >= 0) rows[existing] = row;
      else rows.push(row);
      result.push(row);
    }
    save(t);
  } else if (plan.op === "update") {
    for (let i = 0; i < rows.length; i++) {
      if (!matches(rows[i], plan.filters)) continue;
      const row = { ...rows[i], ...(plan.payload as Row) };
      const clash = uniqueViolation(plan.table, rows, row);
      if (clash) return duplicate(clash);
      rows[i] = row;
      result.push(row);
    }
    save(t);
  } else if (plan.op === "delete") {
    t[plan.table] = rows.filter((r) => !matches(r, plan.filters));
    save(t);
    return { data: null, error: null };
  } else {
    if (plan.table === "rubric_criteria" && rows.length === 0) {
      // Seeded like `npm run db:setup` does for Neon.
      RUBRIC_CRITERIA.forEach((c, i) => rows.push({ id: i + 1, ...c }));
    }
    result = rows.filter((r) => matches(r, plan.filters));
    if (plan.table === "settings" && result.length === 0) result = [withDefaults("settings", {}, t)];
  }

  if (plan.op !== "select" && !plan.returning) return { data: null, error: null };

  for (const o of [...plan.orders].reverse()) {
    result = [...result].sort((a, b) => {
      const av = a[o.col], bv = b[o.col];
      if (av == null && bv == null) return 0;
      if (av == null) return o.nullsFirst ? -1 : 1;
      if (bv == null) return o.nullsFirst ? 1 : -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return o.asc ? cmp : -cmp;
    });
  }
  const count = result.length;
  if (plan.limit != null) result = result.slice(0, plan.limit);
  return finish(plan, result.map((r) => project(r, plan.cols, t)), count);
}

function safeFilePath(p: string) {
  const full = path.resolve(FILES, p);
  if (!full.startsWith(path.resolve(FILES) + path.sep)) throw new Error("bad path");
  return full;
}

export function memoryDb(): Db {
  return {
    from: (table) => new Query(table, execute),
    files: {
      async put(p, bytes, contentType) {
        const full = safeFilePath(p);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, bytes);
        fs.writeFileSync(`${full}.type`, contentType);
        return null;
      },
      async get(p) {
        try {
          const full = safeFilePath(p);
          return { bytes: new Uint8Array(fs.readFileSync(full)), contentType: fs.readFileSync(`${full}.type`, "utf8") };
        } catch {
          return null;
        }
      },
      async remove(p) {
        const full = safeFilePath(p);
        fs.rmSync(full, { force: true });
        fs.rmSync(`${full}.type`, { force: true });
      },
    },
  };
}
