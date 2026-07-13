import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Offline guard for the 0018 task-fields migration (need_by + complexity). Mirrors
// schema-status-check.test.ts: read the migration SQL and assert the shape, so a
// wrong CHECK / missing column fails here before it ever reaches the database.
//
// SSOT note: complexity's allowed values live in exactly three places kept in sync
// — the DB CHECK (this migration), the TS union `"low" | "medium" | "high"`, and
// the normalizeComplexity() input clamp in src/app/actions.ts. This test pins the
// DB side; tsc pins the TS side.

const COMPLEXITY_VALUES = ["low", "medium", "high"] as const;

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/0018_task_fields.sql", import.meta.url)
);
const sql = readFileSync(migrationPath, "utf8");

/** Pull the quoted values out of an `in ('a','b',...)` clause. */
function parseInList(clause: string): string[] {
  const m = clause.match(/in\s*\(([^)]*)\)/i);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("schema: 0018 task-fields migration", () => {
  it("adds need_by as a nullable date column (no default, no NOT NULL)", () => {
    const m = sql.match(/add column if not exists\s+need_by\s+date([^;]*)/i);
    expect(m).toBeTruthy();
    const tail = (m?.[1] ?? "").toLowerCase();
    expect(tail).not.toContain("not null");
    expect(tail).not.toContain("default");
  });

  it("adds complexity with a CHECK listing exactly low/medium/high, nullable", () => {
    const m = sql.match(/add column if not exists\s+complexity\s+text([^;]*)/i);
    expect(m).toBeTruthy();
    const decl = m?.[1] ?? "";
    expect(decl.toLowerCase()).not.toContain("not null");
    expect(new Set(parseInList(decl))).toEqual(new Set<string>(COMPLEXITY_VALUES));
  });
});
