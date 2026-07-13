import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDbEnv, applyEnv, admin, seedTenant, seedTask, teardownTenant, type SeededTenant } from "./helpers";
import { generateApiKey } from "@/lib/api-key";

const d = hasDbEnv ? describe : describe.skip;

d("first-class projects", () => {
  let lead: SeededTenant;
  beforeAll(async () => {
    applyEnv();
    lead = await seedTenant(generateApiKey(), "proj-lead");
  });
  afterAll(async () => { if (lead) await teardownTenant(lead); });

  it("getOrCreateMiscProject is idempotent (one Misc per idea)", async () => {
    const { getOrCreateMiscProject } = await import("@/lib/projects");
    // getOrCreateDefaultIdea uses the RLS server client, not admin(); for this
    // admin-context integration test the seeded tenant isn't the authed user, so
    // create/fetch an idea row directly via admin() and pass its id.
    const { data: idea } = await admin().from("ideas")
      .insert({ workspace_id: lead.workspaceId, name: "Test Idea" })
      .select("id").single();
    const a = await getOrCreateMiscProject(admin(), lead.workspaceId, idea!.id);
    const b = await getOrCreateMiscProject(admin(), lead.workspaceId, idea!.id);
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe("project");
    expect(a.assigned_agent_id).toBeNull();

    const { count } = await admin()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", lead.workspaceId)
      .eq("kind", "project")
      .eq("idea_id", idea!.id)
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
      .insert({ workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
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
      .insert({ workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
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

  it("lead create_subtask assigns to another in-ws agent; foreign agent → 404", async () => {
    const a = admin();
    const { data: proj } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
                assigned_agent_id: lead.agentId, title: "Proj X", status: "todo",
                created_by_user_id: lead.userId })
      .select("id").single();
    const { data: ag2 } = await a.from("agents")
      .insert({ workspace_id: lead.workspaceId, name: "ag2x",
                api_key_hash: generateApiKey().hash, api_key_prefix: "yyyy2222" })
      .select("id").single();

    const { createSubtask } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };

    const child = await createSubtask(leadCtx, proj!.id, "do part", undefined, ag2!.id);
    expect(child.assigned_agent_id).toBe(ag2!.id);
    expect(child.kind).toBe("task");

    // An agent id from another workspace must not be assignable → 404.
    const foreign = await seedTenant(generateApiKey(), "foreign");
    try {
      await expect(
        createSubtask(leadCtx, proj!.id, "leak", undefined, foreign.agentId)
      ).rejects.toMatchObject({ code: 404 });
    } finally {
      await teardownTenant(foreign);
    }
  });

  it("create_subtask to a revoked in-workspace agent → 404", async () => {
    const a = admin();
    const { data: proj } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
                assigned_agent_id: lead.agentId, title: "Proj R", status: "todo",
                created_by_user_id: lead.userId })
      .select("id").single();
    // A revoked agent in the SAME workspace.
    const { data: revoked } = await a.from("agents")
      .insert({ workspace_id: lead.workspaceId, name: "revoked-ag",
                api_key_hash: generateApiKey().hash, api_key_prefix: "rrrr3333",
                revoked_at: new Date().toISOString() })
      .select("id").single();

    const { createSubtask } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    await expect(
      createSubtask(leadCtx, proj!.id, "to revoked", undefined, revoked!.id)
    ).rejects.toMatchObject({ code: 404 });
  });

  it("DB rejects a task with no parent, and a project with a parent", async () => {
    const a = admin();
    const noParent = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "task", assigned_agent_id: lead.agentId,
      title: "orphan", status: "todo", created_by_user_id: lead.userId,
    });
    expect(noParent.error).toBeTruthy();

    const { data: proj } = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
      assigned_agent_id: lead.agentId,
      title: "P", status: "todo", created_by_user_id: lead.userId,
    }).select("id").single();
    const projWithParent = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", parent_id: proj!.id,
      title: "bad", status: "todo", created_by_user_id: lead.userId,
    });
    expect(projWithParent.error).toBeTruthy();
  });

  it("spec brief arrives over list_my_tasks on an assigned project (the core guarantee)", async () => {
    const brief = "BRD: build the widget.\n- goal one\n- goal two";
    const projId = await seedTask(lead, { title: "Project with a brief", spec: brief });

    const { listMyTasks } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    const mine = await listMyTasks(leadCtx);
    const proj = mine.find((t) => t.id === projId);
    // The agent receives the full brief verbatim — this is why the feature exists.
    expect(proj?.spec).toBe(brief);
  });

  it("spec is null on a project created without a brief", async () => {
    const projId = await seedTask(lead, { title: "Project, no brief" });

    const { listMyTasks } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    const proj = (await listMyTasks(leadCtx)).find((t) => t.id === projId);
    // Explicit "no brief provided" signal, not undefined/missing.
    expect(proj?.spec).toBeNull();
  });

  it("DB allows an unassigned project but rejects an unassigned task", async () => {
    const a = admin();
    const okProj = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", idea_id: lead.ideaId,
      assigned_agent_id: null,
      title: "unassigned proj", status: "todo", created_by_user_id: lead.userId,
    }).select("id").single();
    expect(okProj.error).toBeFalsy();

    const badTask = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "task", parent_id: okProj.data!.id,
      assigned_agent_id: null, title: "no agent", status: "todo", created_by_user_id: lead.userId,
    });
    expect(badTask.error).toBeTruthy();
  });
});
