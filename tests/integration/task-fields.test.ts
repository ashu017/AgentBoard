import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDbEnv, applyEnv, admin, seedTenant, teardownTenant, type SeededTenant } from "./helpers";
import { generateApiKey } from "@/lib/api-key";

// Live-DB coverage for the 0018 task-fields columns (need_by + complexity).
// Gated on .env.local (SUPABASE creds) — skips without a live DB, exactly like the
// other integration suites. REQUIRES migration 0018 to be applied to that DB; it is
// authored but UNAPPLIED, so these run only after the human-approved migration flow.
const d = hasDbEnv ? describe : describe.skip;

d("task fields: need_by + complexity (0018)", () => {
  let t: SeededTenant;
  beforeAll(async () => {
    applyEnv();
    t = await seedTenant(generateApiKey(), "task-fields");
  });
  afterAll(async () => { if (t) await teardownTenant(t); });

  it("accepts a project with need_by + complexity set", async () => {
    const { data, error } = await admin().from("tasks").insert({
      workspace_id: t.workspaceId, kind: "project", idea_id: t.ideaId,
      assigned_agent_id: t.agentId, title: "sized project", status: "todo",
      need_by: "2026-12-31", complexity: "high", created_by_user_id: t.userId,
    }).select("id, need_by, complexity").single();
    expect(error).toBeFalsy();
    expect(data?.need_by).toBe("2026-12-31");
    expect(data?.complexity).toBe("high");
  });

  it("defaults both columns to null when unset (no backfill needed)", async () => {
    const { data, error } = await admin().from("tasks").insert({
      workspace_id: t.workspaceId, kind: "project", idea_id: t.ideaId,
      assigned_agent_id: t.agentId, title: "unsized project", status: "todo",
      created_by_user_id: t.userId,
    }).select("id, need_by, complexity").single();
    expect(error).toBeFalsy();
    expect(data?.need_by).toBeNull();
    expect(data?.complexity).toBeNull();
  });

  it("rejects an out-of-range complexity (CHECK enforces low/medium/high)", async () => {
    const { error } = await admin().from("tasks").insert({
      workspace_id: t.workspaceId, kind: "project", idea_id: t.ideaId,
      assigned_agent_id: t.agentId, title: "bad complexity", status: "todo",
      complexity: "epic", created_by_user_id: t.userId,
    });
    expect(error).toBeTruthy();
  });
});
