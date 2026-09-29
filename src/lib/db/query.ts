// A small chainable query builder used by the whole app:
//   db().from("candidates").select("*").eq("stage", "review").order("total_score", { ascending: false })
// It only records what was asked for (a Plan); an executor runs it, either
// against Neon Postgres (lib/db/neon.ts) or the local demo file (lib/db/memory.ts).

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export interface Filter {
  col: string;
  op: "eq" | "in" | "lte";
  value: unknown;
}

export interface Plan {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload: Row | Row[] | null;
  filters: Filter[];
  orders: { col: string; asc: boolean; nullsFirst: boolean }[];
  limit: number | null;
  single: "one" | "maybe" | null;
  cols: string;
  returning: boolean;
  count: boolean;
  head: boolean;
}

export interface DbError {
  message: string;
  /** Postgres error code, e.g. "23505" for a unique violation */
  code?: string;
}

export interface Result {
  data: any;
  error: DbError | null;
  count?: number | null;
}

export type Executor = (plan: Plan) => Promise<Result>;

export class Query implements PromiseLike<Result> {
  private plan: Plan;

  constructor(table: string, private exec: Executor) {
    this.plan = {
      table, op: "select", payload: null, filters: [], orders: [], limit: null,
      single: null, cols: "*", returning: false, count: false, head: false,
    };
  }

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.plan.op === "select") {
      this.plan.count = Boolean(opts?.count);
      this.plan.head = Boolean(opts?.head);
    } else {
      this.plan.returning = true;
    }
    this.plan.cols = cols;
    return this;
  }
  insert(payload: Row | Row[]) { this.plan.op = "insert"; this.plan.payload = payload; return this; }
  update(payload: Row) { this.plan.op = "update"; this.plan.payload = payload; return this; }
  upsert(payload: Row) { this.plan.op = "upsert"; this.plan.payload = payload; return this; }
  delete() { this.plan.op = "delete"; return this; }
  eq(col: string, value: unknown) { this.plan.filters.push({ col, op: "eq", value }); return this; }
  in(col: string, value: unknown[]) { this.plan.filters.push({ col, op: "in", value }); return this; }
  lte(col: string, value: string) { this.plan.filters.push({ col, op: "lte", value }); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    this.plan.orders.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc }); // Postgres default
    return this;
  }
  limit(n: number) { this.plan.limit = n; return this; }
  maybeSingle() { this.plan.single = "maybe"; return this; }
  single() { this.plan.single = "one"; return this; }

  then<A = Result, B = never>(
    onOk?: ((v: Result) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    return this.exec(this.plan).then(onOk, onErr);
  }
}

/** Private CV file storage (kept in the database in production). */
export interface FileStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<DbError | null>;
  get(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  remove(path: string): Promise<void>;
}

export interface Db {
  from(table: string): Query;
  files: FileStore;
}

/** Apply single()/maybeSingle() semantics to a list of rows. */
export function finish(plan: Plan, rows: Row[], count: number): Result {
  if (plan.count && plan.head) return { data: null, error: null, count };
  if (plan.single === "maybe") {
    if (rows.length > 1) return { data: null, error: { message: "multiple rows returned" } };
    return { data: rows[0] ?? null, error: null };
  }
  if (plan.single === "one") {
    if (rows.length !== 1) return { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null, count: plan.count ? count : null };
}

/** Split a select list on commas that aren't inside an embed's parentheses. */
export function splitCols(cols: string): string[] {
  return cols.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean);
}
