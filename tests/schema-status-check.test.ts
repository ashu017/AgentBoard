import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STATUSES } from "../src/lib/task-status";

// design.md "Must-have tests": assert the DB CHECK constraint matches STATUSES,
// so the schema and the single-source-of-truth enum can't silently drift.
//
// We read the v1 schema migration and extract every `check (... in ('a','b',…))`
// list that constrains a status column, then assert each equals STATUSES. This
// is deterministic and offline (no live DB needed in the unit suite); a wrong
// migration fails here before it ever reaches the database.

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/0003_s1_schema.sql", import.meta.url)
);
const sql = readFileSync(migrationPath, "utf8");

/** Pull the quoted values out of an `in ('a','b',...)` clause. */
function parseInList(clause: string): string[] {
  const m = clause.match(/in\s*\(([^)]*)\)/i);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("schema: status CHECK constraints match STATUSES", () => {
  // status column on tasks, plus from_status/to_status on task_events — all must
  // enumerate exactly the canonical statuses.
  const statusChecks = [
    ...sql.matchAll(/check\s*\(\s*status\s+in\s*\([^)]*\)/gi),
    ...sql.matchAll(/check\s*\(\s*from_status\s+in\s*\([^)]*\)/gi),
    ...sql.matchAll(/check\s*\(\s*to_status\s+in\s*\([^)]*\)/gi),
  ].map((m) => m[0]);

  it("finds the expected number of status CHECK clauses (tasks.status + 2 on task_events)", () => {
    expect(statusChecks.length).toBe(3);
  });

  it("every status CHECK lists exactly STATUSES (order-insensitive)", () => {
    const expected = new Set<string>(STATUSES);
    for (const clause of statusChecks) {
      const values = new Set(parseInList(clause));
      expect(values).toEqual(expected);
    }
  });
});
