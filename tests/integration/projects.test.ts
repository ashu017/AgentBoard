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

  it("listAgents returns active workspace agents, scoped", async () => {
    const { listAgents } = await import("@/lib/agent-db");
    const ctx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    const agents = await listAgents(ctx);
    expect(agents.some((a) => a.id === lead.agentId)).toBe(true);
    expect(agents.every((a) => a.active)).toBe(true);
  });

  it("lead reads its project subtree incl. other agents' tasks; non-lead gets 404", async () => {
    const a = admin();
    // A project led by `lead`.
    const { data: proj } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "project",
                assigned_agent_id: lead.agentId, title: "Ship feature", status: "todo",
                created_by_user_id: lead.userId })
      .select("id").single();
    // A second agent in the SAME workspace.
    const { data: ag2 } = await a.from("agents")
      .insert({ workspace_id: lead.workspaceId, name: "ag2",
                api_key_hash: generateApiKey().hash, api_key_prefix: "zzzz1111" })
      .select("id").single();
    // A child task under the project, assigned to that other agent.
    await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "task", parent_id: proj!.id,
      assigned_agent_id: ag2!.id, title: "subtask for ag2", status: "todo",
      created_by_user_id: lead.userId,
    });

    const { listMyTasks } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    const subtree = await listMyTasks(leadCtx, undefined, proj!.id);
    expect(subtree.some((t) => t.assigned_agent_id === ag2!.id)).toBe(true);

    // ag2 does not lead the project → reading its subtree returns 404.
    const ag2Ctx = { agentId: ag2!.id, workspaceId: lead.workspaceId };
    await expect(listMyTasks(ag2Ctx, undefined, proj!.id)).rejects.toMatchObject({ code: 404 });
  });

  it("passing a child task id as parentId returns 404 (no sibling leak)", async () => {
    const a = admin();
    const { data: proj } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "project",
                assigned_agent_id: lead.agentId, title: "Parent proj", status: "todo",
                created_by_user_id: lead.userId })
      .select("id").single();
    const { data: child } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "task", parent_id: proj!.id,
                assigned_agent_id: lead.agentId, title: "a child", status: "todo",
                created_by_user_id: lead.userId })
      .select("id").single();

    const { listMyTasks } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    // child.id is kind='task', so the project gate (kind='project') rejects it → 404.
    await expect(listMyTasks(leadCtx, undefined, child!.id)).rejects.toMatchObject({ code: 404 });
  });
});
