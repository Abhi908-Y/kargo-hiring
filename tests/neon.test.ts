import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the SQL the Neon backend generates, without a real database.
const calls: { text: string; values: unknown[] }[] = [];
let nextRows: Record<string, unknown>[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return nextRows;
    },
  }),
}));

process.env.DATABASE_URL = "postgres://test";
const { neonDb } = await import("../src/lib/db/neon");
const db = neonDb();

beforeEach(() => {
  calls.length = 0;
  nextRows = [];
});

describe("neon query builder", () => {
  it("builds a filtered, ordered select with parameters", async () => {
    nextRows = [{ id: "1", created_at: new Date("2026-09-29T10:00:00Z") }];
    const { data } = await db.from("candidates").select("*").eq("stage", "scored").order("total_score", { ascending: false }).limit(5);
    expect(calls[0].text).toBe(
      `SELECT t.* FROM "candidates" t WHERE t."stage" = $1 ORDER BY t."total_score" DESC NULLS FIRST LIMIT 5`,
    );
    expect(calls[0].values).toEqual(["scored"]);
    expect(data[0].created_at).toBe("2026-09-29T10:00:00.000Z"); // Dates become ISO strings
  });

  it("builds a count query", async () => {
    nextRows = [{ count: 3 }];
    const { count } = await db.from("candidates").select("id", { count: "exact", head: true }).eq("stage", "scored");
    expect(calls[0].text).toBe(`SELECT count(*)::int AS count FROM "candidates" t WHERE t."stage" = $1`);
    expect(count).toBe(3);
  });

  it("builds an embedded select for emails -> candidates", async () => {
    await db.from("emails").select("*, candidates(full_name, file_name)").order("created_at", { ascending: false });
    expect(calls[0].text).toContain(
      `(SELECT json_build_object('full_name', o."full_name", 'file_name', o."file_name") FROM "candidates" o WHERE o.id = t."candidate_id") AS "candidates"`,
    );
  });

  it("casts jsonb columns and returns rows for update ... select", async () => {
    nextRows = [{ id: "x" }];
    const { data } = await db
      .from("candidates")
      .update({ stage: "sent", brief: { who_they_are: "a" } })
      .eq("id", "x")
      .eq("stage", "scored")
      .select("id");
    expect(calls[0].text).toBe(
      `UPDATE "candidates" AS t SET "stage" = $1, "brief" = $2::jsonb WHERE t."id" = $3 AND t."stage" = $4 RETURNING *`,
    );
    expect(calls[0].values).toEqual(["sent", '{"who_they_are":"a"}', "x", "scored"]);
    expect(data).toEqual([{ id: "x" }]);
  });

  it("builds an upsert on id", async () => {
    await db.from("settings").upsert({ id: 1, top_n: 5 });
    expect(calls[0].text).toBe(
      `INSERT INTO "settings" AS t ("id", "top_n") VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET "top_n" = EXCLUDED."top_n"`,
    );
  });

  it("refuses unknown tables and unsafe column names", async () => {
    await expect(async () => db.from("users").select("*").then((r) => r)).rejects.toThrow(/Unknown table/);
    const { error } = await db.from("candidates").select("*").eq('stage"; drop table x; --', 1);
    expect(error?.message).toMatch(/Invalid identifier/);
    expect(calls).toHaveLength(0);
  });
});
