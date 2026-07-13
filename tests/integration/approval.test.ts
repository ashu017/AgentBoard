import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDbEnv, applyEnv, admin, seedTenant, teardownTenant, seedTask, type SeededTenant } from "./helpers";
import { generateApiKey } from "@/lib/api-key";

const d = hasDbEnv ? describe : describe.skip;

d("approval loop", () => {
  let t: SeededTenant;
  beforeAll(async () => {
    applyEnv();
    t = await seedTenant(generateApiKey(), "approval");
  });
  afterAll(async () => {
    if (t) await teardownTenant(t);
  });

  it("request_review parks an in_progress task in in_review with reason + options", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    // seedTask makes a kind='project' assigned to the agent; move it to in_progress first.
    const taskId = await seedTask(t, { title: "review me", status: "in_progress" });
    const task = await requestReview(ctx, taskId, "need sign-off before dropping the table", [
      { id: "a", label: "dual-write" },
      { id: "b", label: "cutover" },
    ]);
    expect(task.status).toBe("in_review");
    expect(task.review_reason).toContain("sign-off");
    expect(Array.isArray(task.review_options)).toBe(true);
    expect((task.review_options as unknown[]).length).toBe(2);
  });

  it("agent CANNOT move a task out of in_review (AL4b — human-only)", async () => {
    const { requestReview, updateTaskStatus } = await import("@/lib/agent-db");
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    const taskId = await seedTask(t, { title: "in review", status: "in_progress" });
    await requestReview(ctx, taskId, "check this", null);
    await expect(updateTaskStatus(ctx, taskId, "done")).rejects.toMatchObject({ code: 409 });
    await expect(updateTaskStatus(ctx, taskId, "in_progress")).rejects.toMatchObject({ code: 409 });
    await expect(updateTaskStatus(ctx, taskId, "failed")).rejects.toMatchObject({ code: 409 });
  });

  it("request_review on a non-in_progress task → 409", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    const taskId = await seedTask(t, { title: "todo task", status: "todo" });
    await expect(requestReview(ctx, taskId, "x", null)).rejects.toMatchObject({ code: 409 });
  });

  it("request_review with empty reason → 400", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    const taskId = await seedTask(t, { title: "y", status: "in_progress" });
    await expect(requestReview(ctx, taskId, "  ", null)).rejects.toMatchObject({ code: 400 });
  });

  it("request_review on a foreign task → 404", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    // A random uuid the agent doesn't own.
    await expect(
      requestReview(ctx, "00000000-0000-0000-0000-000000000000", "x", null)
    ).rejects.toMatchObject({ code: 404 });
  });

  it("resolve_review approve_close → done with verdict + note (the RPC resolveReview calls, AL-D)", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const a = admin();
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    const taskId = await seedTask(t, { title: "closeme", status: "in_progress" });
    await requestReview(ctx, taskId, "PR ready", null);
    const { data } = await a.rpc("resolve_review", {
      p_workspace_id: t.workspaceId,
      p_task_id: taskId,
      p_to: "done",
      p_verdict: "approved",
      p_selected: null,
      p_note: "merged",
      p_actor_id: t.userId,
    });
    expect((data as { ok: boolean }).ok).toBe(true);
    const { data: row } = await a
      .from("tasks")
      .select("status, review_verdict, review_note")
      .eq("id", taskId)
      .single();
    expect(row!.status).toBe("done");
    expect(row!.review_verdict).toBe("approved");
    expect(row!.review_note).toBe("merged");
  });

  it("resolve_review approve_continue → in_progress; reject → failed", async () => {
    const { requestReview } = await import("@/lib/agent-db");
    const a = admin();
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };

    // approve_continue
    const contId = await seedTask(t, { title: "continue", status: "in_progress" });
    await requestReview(ctx, contId, "which approach?", [{ id: "a", label: "A" }]);
    const { data: contRes } = await a.rpc("resolve_review", {
      p_workspace_id: t.workspaceId,
      p_task_id: contId,
      p_to: "in_progress",
      p_verdict: "approved",
      p_selected: "a",
      p_note: "go with A",
      p_actor_id: t.userId,
    });
    expect((contRes as { ok: boolean }).ok).toBe(true);
    const { data: contRow } = await a
      .from("tasks")
      .select("status, review_verdict, review_selected_option")
      .eq("id", contId)
      .single();
    expect(contRow!.status).toBe("in_progress");
    expect(contRow!.review_verdict).toBe("approved");
    expect(contRow!.review_selected_option).toBe("a");

    // reject
    const rejId = await seedTask(t, { title: "reject", status: "in_progress" });
    await requestReview(ctx, rejId, "bad plan", null);
    const { data: rejRes } = await a.rpc("resolve_review", {
      p_workspace_id: t.workspaceId,
      p_task_id: rejId,
      p_to: "failed",
      p_verdict: "rejected",
      p_selected: null,
      p_note: "no",
      p_actor_id: t.userId,
    });
    expect((rejRes as { ok: boolean }).ok).toBe(true);
    const { data: rejRow } = await a.from("tasks").select("status, review_verdict").eq("id", rejId).single();
    expect(rejRow!.status).toBe("failed");
    expect(rejRow!.review_verdict).toBe("rejected");
  });

  it("resolve_review on a task NOT in_review → not_in_review", async () => {
    const a = admin();
    const taskId = await seedTask(t, { title: "not-reviewing", status: "in_progress" });
    const { data } = await a.rpc("resolve_review", {
      p_workspace_id: t.workspaceId,
      p_task_id: taskId,
      p_to: "done",
      p_verdict: "approved",
      p_selected: null,
      p_note: null,
      p_actor_id: t.userId,
    });
    expect(data as { ok: boolean; reason?: string }).toMatchObject({ ok: false, reason: "not_in_review" });
  });

  it("round-trip: request_review → resolve approve_continue → agent sees verdict via list_my_tasks", async () => {
    const { requestReview, listMyTasks } = await import("@/lib/agent-db");
    const a = admin();
    const ctx = { agentId: t.agentId, workspaceId: t.workspaceId };
    const taskId = await seedTask(t, { title: "roundtrip", status: "in_progress" });
    await requestReview(ctx, taskId, "pick one", [
      { id: "x", label: "X" },
      { id: "y", label: "Y" },
    ]);
    await a.rpc("resolve_review", {
      p_workspace_id: t.workspaceId,
      p_task_id: taskId,
      p_to: "in_progress",
      p_verdict: "approved",
      p_selected: "y",
      p_note: "use Y",
      p_actor_id: t.userId,
    });
    const tasks = await listMyTasks(ctx);
    const seen = tasks.find((tk) => tk.id === taskId);
    expect(seen).toBeTruthy();
    expect(seen!.status).toBe("in_progress");
    expect(seen!.review_verdict).toBe("approved");
    expect(seen!.review_selected_option).toBe("y");
    expect(seen!.review_note).toBe("use Y");
  });
});
