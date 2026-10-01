import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { finish, Query, splitCols, type Db, type Plan, type Result, type Row } from "./query";

// Production backend: turns a query Plan into parameterised SQL for Neon.
// Table and column names are checked against a strict pattern and quoted;
// every value is passed as a parameter, never spliced into the SQL.

const TABLES = new Set(["settings", "candidates", "emails", "candidate_events", "rubric_criteria", "candidate_notes"]);
const JSONB_COLUMNS = new Set(["dimension_scores", "brief", "ai_raw"]);

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

function table(name: string): string {
  if (!TABLES.has(name)) throw new Error(`Unknown table: ${name}`);
  return ident(name);
}

class Params {
  values: unknown[] = [];
  add(value: unknown, col?: string): string {
    if (col && JSONB_COLUMNS.has(col)) {
      this.values.push(value == null ? null : JSON.stringify(value));
      return `$${this.values.length}::jsonb`;
    }
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function where(plan: Plan, p: Params): string {
  if (!plan.filters.length) return "";
  const parts = plan.filters.map((f) => {
    const col = `t.${ident(f.col)}`;
    if (f.op === "eq") return `${col} = ${p.add(f.value)}`;
    if (f.op === "in") return `${col} = ANY(${p.add(f.value)})`;
    return `${col} <= ${p.add(f.value)}`;
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

function selectList(cols: string): string {
  return splitCols(cols)
    .map((c) => {
      if (c === "*") return "t.*";
      const embed = c.match(/^(\w+)\(([^)]*)\)$/);
      if (embed) {
        // candidates(full_name, file_name) on emails -> json object via candidate_id
        const [, other, inner] = embed;
        const fields = splitCols(inner).map((f) => `'${f.replace(/\W/g, "")}', o.${ident(f)}`).join(", ");
        const fk = ident(`${other.replace(/s$/, "")}_id`);
        return `(SELECT json_build_object(${fields}) FROM ${table(other)} o WHERE o.id = t.${fk}) AS ${ident(other)}`;
      }
      return `t.${ident(c)}`;
    })
    .join(", ");
}

/** Timestamps come back as Date objects; the app works with ISO strings. */
function normalise(row: Row): Row {
  for (const k of Object.keys(row)) if (row[k] instanceof Date) row[k] = (row[k] as Date).toISOString();
  return row;
}

function pickCols(row: Row, cols: string): Row {
  const list = splitCols(cols);
  if (list.includes("*")) return row;
  return Object.fromEntries(list.map((c) => [c, row[c] ?? null]));
}

let sql: NeonQueryFunction<false, false> | null = null;
function client() {
  if (!sql) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("Missing environment variable DATABASE_URL. See .env.example.");
    sql = neon(url);
  }
  return sql;
}

async function run(text: string, values: unknown[]): Promise<Row[]> {
  const rows = (await client().query(text, values)) as Row[];
  return rows.map(normalise);
}

async function execute(plan: Plan): Promise<Result> {
  const t = table(plan.table);
  const p = new Params();
  try {
    if (plan.op === "select") {
      if (plan.count && plan.head) {
        const rows = await run(`SELECT count(*)::int AS count FROM ${t} t${where(plan, p)}`, p.values);
        return finish(plan, [], rows[0]?.count ?? 0);
      }
      let text = `SELECT ${selectList(plan.cols)} FROM ${t} t${where(plan, p)}`;
      if (plan.orders.length) {
        text += ` ORDER BY ${plan.orders
          .map((o) => `t.${ident(o.col)} ${o.asc ? "ASC" : "DESC"} NULLS ${o.nullsFirst ? "FIRST" : "LAST"}`)
          .join(", ")}`;
      }
      if (plan.limit != null) text += ` LIMIT ${Math.max(0, Math.floor(plan.limit))}`;
      const rows = await run(text, p.values);
      return finish(plan, rows, rows.length);
    }

    const returning = plan.returning ? " RETURNING *" : "";
    let rows: Row[];

    if (plan.op === "insert" || plan.op === "upsert") {
      const items = (Array.isArray(plan.payload) ? plan.payload : [plan.payload!]) as Row[];
      rows = [];
      for (const item of items) {
        const cols = Object.keys(item);
        const values = cols.map((c) => p.add(item[c], c));
        let text = `INSERT INTO ${t} AS t (${cols.map(ident).join(", ")}) VALUES (${values.join(", ")})`;
        if (plan.op === "upsert") {
          const updates = cols.filter((c) => c !== "id").map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
          text += ` ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`;
        }
        rows.push(...(await run(text + returning, p.values)));
        p.values = [];
      }
    } else if (plan.op === "update") {
      const set = Object.entries(plan.payload as Row).map(([c, v]) => `${ident(c)} = ${p.add(v, c)}`);
      rows = await run(`UPDATE ${t} AS t SET ${set.join(", ")}${where(plan, p)}${returning}`, p.values);
    } else {
      rows = await run(`DELETE FROM ${t} AS t${where(plan, p)}`, p.values);
      return { data: null, error: null };
    }

    if (!plan.returning) return { data: null, error: null };
    return finish(plan, rows.map((r) => pickCols(r, plan.cols)), rows.length);
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return { data: null, error: { message: err.message ?? String(e), code: err.code } };
  }
}

export function neonDb(): Db {
  return {
    from: (name) => new Query(name, execute),
    files: {
      async put(path, bytes, contentType) {
        try {
          await run(
            `INSERT INTO cv_files (path, content_type, data_base64) VALUES ($1, $2, $3)
             ON CONFLICT (path) DO UPDATE SET content_type = EXCLUDED.content_type, data_base64 = EXCLUDED.data_base64`,
            [path, contentType, Buffer.from(bytes).toString("base64")],
          );
          return null;
        } catch (e) {
          return { message: (e as Error).message };
        }
      },
      async get(path) {
        const rows = await run(`SELECT content_type, data_base64 FROM cv_files WHERE path = $1`, [path]);
        if (!rows[0]) return null;
        return { bytes: new Uint8Array(Buffer.from(rows[0].data_base64, "base64")), contentType: rows[0].content_type };
      },
      async remove(path) {
        await run(`DELETE FROM cv_files WHERE path = $1`, [path]);
      },
    },
  };
}
