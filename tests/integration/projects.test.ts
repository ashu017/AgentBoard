import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDbEnv, applyEnv, admin, seedTenant, teardownTenant, type SeededTenant } from "./helpers";
import { generateApiKey } from "@/lib/api-key";

const d = hasDbEnv ? describe : describe.skip;

d("first-class projects", () => {
  let lead: SeededTenant;
  beforeAll(async () => {
    applyEnv();
    lead = await seedTenant(generateApiKey(), "proj-lead");
  });
  afterAll(async () => { if (lead) await teardownTenant(lead); });

  it("getOrCreateMiscProject is idempotent (one Misc per workspace)", async () => {
    const { getOrCreateMiscProject } = await import("@/lib/projects");
    const a = await getOrCreateMiscProject(admin(), lead.workspaceId);
    const b = await getOrCreateMiscProject(admin(), lead.workspaceId);
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe("project");
    expect(a.assigned_agent_id).toBeNull();

    const { count } = await admin()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", lead.workspaceId)
      .eq("kind", "project")
      .is("assigned_agent_id", null);
    expect(count).toBe(1);
  });
});
