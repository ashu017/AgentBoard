import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  hasDbEnv,
  applyEnv,
  seedTenant,
  seedTask,
  teardownTenant,
  type SeededTenant,
} from "./helpers";
import { generateApiKey } from "../../src/lib/api-key";

// Live-DB integration tests for the confined agent-plane module. Skips entirely
// when .env.local isn't present so the unit suite still runs anywhere.
const d = hasDbEnv ? describe : describe.skip;

// Import agent-db lazily AFTER env is applied (it reads env at call time via
// createAdminClient, but keep the import after applyEnv for safety).
applyEnv();

d("agent-db (live DB)", () => {
  let A: SeededTenant; // tenant A
  let B: SeededTenant; // tenant B (the cross-tenant victim)
  let agentDb: typeof import("../../src/lib/agent-db");

  beforeAll(async () => {
    agentDb = await import("../../src/lib/agent-db");
    A = await seedTenant(generateApiKey(), "A");
    B = await seedTenant(generateApiKey(), "B");
  });

  afterAll(async () => {
    if (A) await teardownTenant(A);
    if (B) await teardownTenant(B);
  });

  // Agent delete guard (manager action) — relies on the FK on delete restrict
  // and an app-level task-count precheck. Asserts the DB-level invariant the
  // deleteAgent() guard depends on: an agent with tasks cannot be deleted, one
  // without can.
  describe("delete-agent guard (FK on delete restrict)", () => {
    it("deleting an agent WITH a task is rejected by the DB", async () => {
      const { admin } = await import("./helpers");
      const t = await seedTenant(generateApiKey(), "del-has-task");
      await seedTask(t, { title: "blocks delete", status: "todo" });
      const { error } = await admin().from("agents").delete().eq("id", t.agentId);
      expect(error).not.toBeNull(); // FK on delete restrict
      await teardownTenant(t);
    });

    it("deleting an agent with NO tasks succeeds", async () => {
      const { admin } = await import("./helpers");
      const t = await seedTenant(generateApiKey(), "del-no-task");
      const { error } = await admin().from("agents").delete().eq("id", t.agentId);
      expect(error).toBeNull();
      const { data } = await admin().from("agents").select("id").eq("id", t.agentId);
      expect(data).toHaveLength(0);
      await teardownTenant(t);
    });
  });

  describe("resolveAgentByKey", () => {
    it("resolves a valid key to its (agentId, workspaceId)", async () => {
      const ctx = await agentDb.resolveAgentByKey(A.token);
      expect(ctx.agentId).toBe(A.agentId);
      expect(ctx.workspaceId).toBe(A.workspaceId);
    });

    it("rejects an unknown key with 401", async () => {
      await expect(agentDb.resolveAgentByKey(generateApiKey().token)).rejects.toMatchObject({ code: 401 });
    });

    it("rejects a revoked key with 401 (D12)", async () => {
      const revoked = generateApiKey();
      const t = await seedTenant(revoked, "revoked");
      // Revoke it.
      const { admin } = await import("./helpers");
      await admin().from("agents").update({ revoked_at: new Date().toISOString() }).eq("id", t.agentId);
      await expect(agentDb.resolveAgentByKey(revoked.token)).rejects.toMatchObject({ code: 401 });
      await teardownTenant(t);
    });
  });

  // ── THE CRITICAL TEST (design.md): cross-tenant isolation ──────────────────
  describe("cross-tenant isolation (CRITICAL — a failure is a data breach)", () => {
    it("agent A cannot READ workspace B's tasks", async () => {
      await seedTask(B, { title: "B-secret", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const aTasks = await agentDb.listMyTasks(ctxA);
      expect(aTasks.every((t) => t.workspace_id === A.workspaceId)).toBe(true);
      expect(aTasks.some((t) => t.title === "B-secret")).toBe(false);
    });

    it("agent A cannot UPDATE B's task (sees 404, not 403)", async () => {
      const bTaskId = await seedTask(B, { title: "B-update-target", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.updateTaskStatus(ctxA, bTaskId, "in_progress")).rejects.toMatchObject({ code: 404 });
    });

    it("agent A cannot SUBMIT a result to B's task (404)", async () => {
      const bTaskId = await seedTask(B, { title: "B-submit-target", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.submitResult(ctxA, bTaskId, "stolen")).rejects.toMatchObject({ code: 404 });

      // And B's task is untouched.
      const ctxB = await agentDb.resolveAgentByKey(B.token);
      const [bTask] = (await agentDb.listMyTasks(ctxB)).filter((t) => t.id === bTaskId);
      expect(bTask.result).toBeNull();
      expect(bTask.status).toBe("in_progress");
    });

    it("agent A cannot create_subtask under B's task (404)", async () => {
      const bTaskId = await seedTask(B, { title: "B-parent", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.createSubtask(ctxA, bTaskId, "smuggled child")).rejects.toMatchObject({ code: 404 });
    });
  });

  // ── Hierarchical tasks (create_subtask + depth cap) ────────────────────────
  describe("createSubtask (hierarchy, depth-2 cap)", () => {
    it("creates a child inheriting the parent's workspace + agent, status todo", async () => {
      const parentId = await seedTask(A, { title: "A-project", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const child = await agentDb.createSubtask(ctxA, parentId, "step one", "detail");
      expect(child.parent_id).toBe(parentId);
      expect(child.workspace_id).toBe(A.workspaceId);
      expect(child.assigned_agent_id).toBe(A.agentId);
      expect(child.status).toBe("todo");
    });

    it("writes a `created` event for the child (actor agent)", async () => {
      const parentId = await seedTask(A, { title: "A-project-ev", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const child = await agentDb.createSubtask(ctxA, parentId, "child-ev");
      const { admin } = await import("./helpers");
      const { data: events } = await admin()
        .from("task_events")
        .select("event_type, actor_type, to_status")
        .eq("task_id", child.id);
      expect(events).toContainEqual(
        expect.objectContaining({ event_type: "created", actor_type: "agent", to_status: "todo" })
      );
    });

    it("rejects a subtask of a subtask with 409 (depth-2 cap)", async () => {
      const parentId = await seedTask(A, { title: "A-depth", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const child = await agentDb.createSubtask(ctxA, parentId, "level-2");
      await expect(agentDb.createSubtask(ctxA, child.id, "level-3")).rejects.toMatchObject({ code: 409 });
    });

    it("rejects an empty title with 400", async () => {
      const parentId = await seedTask(A, { title: "A-empty", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.createSubtask(ctxA, parentId, "   ")).rejects.toMatchObject({ code: 400 });
    });

    it("404 for a parent not assigned to the agent (absent id)", async () => {
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(
        agentDb.createSubtask(ctxA, "00000000-0000-0000-0000-000000000000", "orphan")
      ).rejects.toMatchObject({ code: 404 });
    });

    it("list_my_tasks(parentId) returns only that parent's children", async () => {
      const parentId = await seedTask(A, { title: "A-listparent", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await agentDb.createSubtask(ctxA, parentId, "c1");
      await agentDb.createSubtask(ctxA, parentId, "c2");
      const children = await agentDb.listMyTasks(ctxA, undefined, parentId);
      expect(children.length).toBe(2);
      expect(children.every((t) => t.parent_id === parentId)).toBe(true);
    });
  });

  describe("listMyTasks", () => {
    it("returns only the agent's own tasks, filterable by status", async () => {
      await seedTask(A, { title: "A-todo", status: "todo" });
      await seedTask(A, { title: "A-inprog", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const todos = await agentDb.listMyTasks(ctxA, "todo");
      expect(todos.length).toBeGreaterThanOrEqual(1);
      expect(todos.every((t) => t.status === "todo")).toBe(true);
    });

    it("rejects an unknown status filter with 400", async () => {
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.listMyTasks(ctxA, "bogus")).rejects.toMatchObject({ code: 400 });
    });
  });

  describe("updateTaskStatus", () => {
    it("applies a legal transition and writes an event", async () => {
      const id = await seedTask(A, { title: "A-legal", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const updated = await agentDb.updateTaskStatus(ctxA, id, "in_progress", "starting");
      expect(updated.status).toBe("in_progress");

      const { admin } = await import("./helpers");
      const { data: events } = await admin()
        .from("task_events")
        .select("event_type, from_status, to_status, actor_type")
        .eq("task_id", id);
      expect(events).toContainEqual(
        expect.objectContaining({ event_type: "status_changed", from_status: "todo", to_status: "in_progress", actor_type: "agent" })
      );
    });

    it("rejects an illegal transition with 409 (out of terminal)", async () => {
      const id = await seedTask(A, { title: "A-terminal", status: "done" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.updateTaskStatus(ctxA, id, "in_progress")).rejects.toMatchObject({ code: 409 });
    });

    it("404 for a task id not assigned to the agent (own workspace, absent id)", async () => {
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(
        agentDb.updateTaskStatus(ctxA, "00000000-0000-0000-0000-000000000000", "in_progress")
      ).rejects.toMatchObject({ code: 404 });
    });
  });

  describe("submitResult (D-SUBMIT)", () => {
    it("writes result + terminal transition in one call", async () => {
      const id = await seedTask(A, { title: "A-submit", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const r = await agentDb.submitResult(ctxA, id, "the answer is 42", "done");
      expect(r.status).toBe("done");
      expect(r.result).toBe("the answer is 42");
    });

    it("rejects submit_result on a todo task with 409 (implies work started)", async () => {
      const id = await seedTask(A, { title: "A-submit-todo", status: "todo" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.submitResult(ctxA, id, "premature")).rejects.toMatchObject({ code: 409 });
    });

    it("rejects an oversize result with 413", async () => {
      const id = await seedTask(A, { title: "A-submit-big", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const huge = "x".repeat(agentDb.MAX_RESULT_BYTES + 1);
      await expect(agentDb.submitResult(ctxA, id, huge)).rejects.toMatchObject({ code: 413 });
    });

    it("rejects a non-terminal status with 400", async () => {
      const id = await seedTask(A, { title: "A-submit-nonterminal", status: "in_progress" });
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      await expect(agentDb.submitResult(ctxA, id, "x", "in_progress")).rejects.toMatchObject({ code: 400 });
    });
  });

  describe("touchLastSeen (D10 throttle)", () => {
    it("writes on first call, skips within the throttle window", async () => {
      const ctxA = await agentDb.resolveAgentByKey(A.token);
      const { admin } = await import("./helpers");
      await admin().from("agents").update({ last_seen_at: null }).eq("id", A.agentId);

      await agentDb.touchLastSeen(ctxA);
      const { data: after1 } = await admin().from("agents").select("last_seen_at").eq("id", A.agentId).single();
      expect(after1?.last_seen_at).not.toBeNull();

      // Second immediate call should be skipped (value unchanged).
      await agentDb.touchLastSeen(ctxA);
      const { data: after2 } = await admin().from("agents").select("last_seen_at").eq("id", A.agentId).single();
      expect(after2?.last_seen_at).toBe(after1?.last_seen_at);
    });
  });
});
