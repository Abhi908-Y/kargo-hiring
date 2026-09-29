import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/config/scoring";

// A small stand-in for the parts of the Supabase client this app uses, backed by
// a JSON file. Demo mode only. It re-reads the file on every query so server
// components and route handlers always see the same data.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const ROOT = path.join(process.cwd(), ".demo-data");
const DB_FILE = path.join(ROOT, "db.json");
const FILES = path.join(ROOT, "files");

export function demoDataDir() {
  return ROOT;
}

function load(): Tables {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { settings: [], candidates: [], emails: [], candidate_events: [] };
  }
}

function save(t: Tables) {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(t, null, 1));
  fs.renameSync(tmp, DB_FILE);
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
        email: null, phone: null, extraction_warning: null, tagged_role: null, stage: "processing", band: null,
        route_reasons: [], rescued: false, assigned_role: null, role_source: null, role_reasoning: null, role_mismatch: false,
        pattern_score: null, role_fit_score: null, total_score: null, total_other_role: null, dimension_scores: null,
        brief: null, personal_line: null, flags: [], ai_raw: null, model: null, scored_at: null, scoring_error: null,
        decided_by: null, decided_at: null, email_scheduled_for: null,
        ...row,
      };
    case "emails":
      return {
        id: crypto.randomUUID(), created_at: now(), delivered_to: null, simulated: false, from_address: null,
        scheduled_for: null, sent_at: null, cancelled_at: null, resend_id: null, error: null,
        ...row,
      };
    case "candidate_events":
      return { id: (t.candidate_events?.at(-1)?.id ?? 0) + 1, created_at: now(), detail: null, ...row };
    case "settings":
      return {
        id: 1, reject_below: DEFAULT_SETTINGS.rejectBelow, shortlist_at: DEFAULT_SETTINGS.shortlistAt,
        rescue_pattern_min: DEFAULT_SETTINGS.rescuePatternMin, hold_hours: DEFAULT_SETTINGS.holdHours,
        calendar_link: DEFAULT_SETTINGS.calendarLink, updated_at: now(),
        ...row,
      };
    default:
      return row;
  }
}

/** Mirrors the unique constraints in supabase/schema.sql. */
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

function project(row: Row, cols: string, t: Tables): Row {
  // Split on commas that aren't inside an embed's parentheses.
  const parts = cols.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean);
  const out: Row = {};
  for (const p of parts) {
    const embed = p.match(/^(\w+)\(([^)]*)\)$/);
    if (embed) {
      // e.g. candidates(full_name, file_name) on emails -> via candidate_id
      const [, table, inner] = embed;
      const fk = `${table.replace(/s$/, "")}_id`;
      const target = (t[table] ?? []).find((r) => r.id === row[fk]);
      out[table] = target ? project(target, inner, t) : null;
    } else if (p === "*") {
      Object.assign(out, row);
    } else {
      out[p] = row[p] ?? null;
    }
  }
  return out;
}

type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private limitN: number | null = null;
  private singleMode: "one" | "maybe" | null = null;
  private cols = "*";
  private returning = false;
  private countMode = false;
  private head = false;

  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countMode = Boolean(opts?.count);
      this.head = Boolean(opts?.head);
    } else {
      this.returning = true;
    }
    this.cols = cols;
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  upsert(p: Row) { this.op = "upsert"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  lte(c: string, v: string) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    this.orders.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc }); // PostgREST default
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.exec()).then(onOk, onErr);
  }

  private exec(): Result {
    const t = load();
    const rows = (t[this.table] ??= []);
    let result: Row[] = [];

    if (this.op === "insert" || this.op === "upsert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload!]) as Row[];
      for (const item of items) {
        const existing = this.op === "upsert" ? rows.findIndex((r) => r.id === item.id) : -1;
        const row = existing >= 0 ? { ...rows[existing], ...item } : withDefaults(this.table, item, t);
        const clash = uniqueViolation(this.table, rows, row);
        if (clash) return { data: null, error: { message: `duplicate key value violates unique constraint (${clash})`, code: "23505" } };
        if (existing >= 0) rows[existing] = row;
        else rows.push(row);
        result.push(row);
      }
      save(t);
    } else if (this.op === "update") {
      for (let i = 0; i < rows.length; i++) {
        if (!this.filters.every((f) => f(rows[i]))) continue;
        const row = { ...rows[i], ...(this.payload as Row) };
        const clash = uniqueViolation(this.table, rows, row);
        if (clash) return { data: null, error: { message: `duplicate key value violates unique constraint (${clash})`, code: "23505" } };
        rows[i] = row;
        result.push(row);
      }
      save(t);
    } else if (this.op === "delete") {
      t[this.table] = rows.filter((r) => !this.filters.every((f) => f(r)));
      save(t);
      return { data: null, error: null };
    } else {
      result = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.table === "settings" && result.length === 0 && this.filters.length) result = [withDefaults("settings", {}, t)];
    }

    if (this.op !== "select" && !this.returning) return { data: null, error: null };

    for (const o of [...this.orders].reverse()) {
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
    if (this.limitN != null) result = result.slice(0, this.limitN);
    const data = result.map((r) => project(r, this.cols, t));

    if (this.countMode && this.head) return { data: null, error: null, count };
    if (this.singleMode === "maybe") {
      if (data.length > 1) return { data: null, error: { message: "multiple rows returned" } };
      return { data: data[0] ?? null, error: null };
    }
    if (this.singleMode === "one") {
      if (data.length !== 1) return { data: null, error: { message: `expected 1 row, got ${data.length}` } };
      return { data: data[0], error: null };
    }
    return { data, error: null, count: this.countMode ? count : null };
  }
}

function safeFilePath(p: string) {
  const full = path.resolve(FILES, p);
  if (!full.startsWith(path.resolve(FILES) + path.sep)) throw new Error("bad path");
  return full;
}

export function readDemoFile(p: string): Buffer | null {
  try {
    return fs.readFileSync(safeFilePath(p));
  } catch {
    return null;
  }
}

const storage = {
  from: () => ({
    async upload(p: string, bytes: Uint8Array) {
      const full = safeFilePath(p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, bytes);
      return { data: { path: p }, error: null };
    },
    async remove(paths: string[]) {
      for (const p of paths) fs.rmSync(safeFilePath(p), { force: true });
      return { data: null, error: null };
    },
    async createSignedUrl(p: string, _ttl: number, opts?: { download?: string }) {
      const qs = new URLSearchParams({ path: p, name: opts?.download ?? path.basename(p) });
      return { data: { signedUrl: `/api/demo/file?${qs}` }, error: null };
    },
  }),
};

export function demoClient(): SupabaseClient {
  return { from: (table: string) => new Query(table), storage } as unknown as SupabaseClient;
}
