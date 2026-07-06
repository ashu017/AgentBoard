import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSession } from "@/lib/session";
import { generateApiKey } from "@/lib/api-key";
import { INITIAL_STATUS, isStatus, canTransition, type TaskStatus } from "@/lib/task-status";
import { getOrCreateMiscProject } from "@/lib/projects";

// ─────────────────────────────────────────────────────────────────────────────
// Human-plane write operations (the manager UI). All run under the user's RLS
// session (createServerSupabase) — NOT the service-role key. RLS enforces that a
// manager can only write within their own workspace; these helpers add the
// app-level shape (key generation, the created event, validation).
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatedAgent {
  id: string;
  name: string;
  prefix: string;
  /** Full API key — returned EXACTLY ONCE; never stored or re-derivable (D12). */
  token: string;
}

/** Create an agent in the caller's workspace; returns the one-time key. */
export async function createAgent(name: string, description?: string): Promise<CreatedAgent> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!name.trim()) throw new Error("Agent name is required");

  const supabase = await createServerSupabase();
  const key = generateApiKey();
  const { data, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: session.workspace.id,
      name: name.trim(),
      description: description?.trim() || null,
      api_key_hash: key.hash,
      api_key_prefix: key.prefix,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(`create agent failed: ${error.message}`);

  return { id: data.id, name: data.name, prefix: key.prefix, token: key.token };
}

/** Revoke an agent's key (sets revoked_at). The agent's next MCP call → 401. */
export async function revokeAgent(agentId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  const supabase = await createServerSupabase();
  // RLS scopes the update to the caller's workspace; a foreign id matches no row.
  const { error } = await supabase
    .from("agents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("workspace_id", session.workspace.id);
  if (error) throw new Error(`revoke failed: ${error.message}`);
}

/**
 * Delete an agent — ONLY if no task references it (tasks.assigned_agent_id is
 * `on delete restrict`, so the DB would reject a delete otherwise). For cleaning
 * up a mistakenly-created agent. Once an agent has done work, use revoke instead
 * (preserves the audit trail). Throws if the agent has any tasks.
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  const supabase = await createServerSupabase();

  // Guard: refuse if any task references this agent (also enforced by the FK).
  const { count, error: countErr } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", session.workspace.id)
    .eq("assigned_agent_id", agentId);
  if (countErr) throw new Error(`delete precheck failed: ${countErr.message}`);
  if ((count ?? 0) > 0) {
    throw new Error("This agent has tasks — revoke it instead of deleting.");
  }

  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("id", agentId)
    .eq("workspace_id", session.workspace.id);
  if (error) throw new Error(`delete failed: ${error.message}`);
}

export interface CreatedTask {
  id: string;
  title: string;
  status: string;
  assigned_agent_id: string;
}

/**
 * Create + assign a task (directed assignment, D11). Task starts as `todo`. The
 * task row and its `created` event are written together; if the event append
 * fails the task is rolled back so history can't desync (best-effort in app
 * code since this is the human plane, not the agent RPC path).
 */
export async function createTask(
  title: string,
  assignedAgentId: string,
  description?: string,
  projectId?: string,
  priority: "high" | "medium" | "low" = "medium"
): Promise<CreatedTask> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!title.trim()) throw new Error("Task title is required");
  if (!assignedAgentId) throw new Error("An assignee agent is required");

  const supabase = await createServerSupabase();

  // Guard: the agent must exist, be active, and belong to this workspace.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, revoked_at")
    .eq("id", assignedAgentId)
    .eq("workspace_id", session.workspace.id)
    .maybeSingle();
  if (!agent) throw new Error("Assignee agent not found in your workspace");
  if (agent.revoked_at) throw new Error("Cannot assign work to a revoked agent");

  // Resolve the parent project: explicit, else Miscellaneous (default home, P3).
  let parentId = projectId;
  if (!parentId) {
    const misc = await getOrCreateMiscProject(supabase, session.workspace.id);
    parentId = misc.id;
  } else {
    const { data: proj } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", parentId)
      .eq("workspace_id", session.workspace.id)
      .eq("kind", "project")
      .maybeSingle();
    if (!proj) throw new Error("Project not found in your workspace");
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: session.workspace.id,
      assigned_agent_id: assignedAgentId,
      parent_id: parentId,
      kind: "task",
      title: title.trim(),
      description: description?.trim() || null,
      status: INITIAL_STATUS,
      priority,
      created_by_user_id: session.user.id,
    })
    .select("id, title, status, assigned_agent_id")
    .single();
  if (error) throw new Error(`create task failed: ${error.message}`);

  // Append the `created` event (human plane). One helper, consistent fields.
  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: task.id,
    actor_type: "user",
    actor_id: session.user.id,
    event_type: "created",
    to_status: INITIAL_STATUS,
  });
  if (evErr) {
    // Roll back the task so state/history can't desync.
    await supabase.from("tasks").delete().eq("id", task.id);
    throw new Error(`create task event failed: ${evErr.message}`);
  }

  return task as CreatedTask;
}

/**
 * Add a child task under a project the manager owns (human decomposition). The
 * parent must be a project (subtasks live under projects). The child inherits the
 * parent's workspace + assigned agent, starts `todo`. Runs under the user's RLS
 * session (parent lookup already scoped to the workspace).
 */
export async function createChildTask(
  parentTaskId: string,
  title: string,
  description?: string
): Promise<CreatedTask> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!parentTaskId) throw new Error("A parent task is required");
  if (!title.trim()) throw new Error("Task title is required");

  const supabase = await createServerSupabase();

  // Parent must be in this workspace and be a project (subtasks live under projects).
  const { data: parent } = await supabase
    .from("tasks")
    .select("id, assigned_agent_id, kind")
    .eq("id", parentTaskId)
    .eq("workspace_id", session.workspace.id)
    .maybeSingle();
  if (!parent) throw new Error("Parent task not found in your workspace");
  if (parent.kind !== "project") throw new Error("Subtasks can only be added to a project");

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: session.workspace.id,
      assigned_agent_id: parent.assigned_agent_id, // child inherits parent's agent
      parent_id: parent.id,
      kind: "task",
      title: title.trim(),
      description: description?.trim() || null,
      status: INITIAL_STATUS,
      created_by_user_id: session.user.id,
    })
    .select("id, title, status, assigned_agent_id")
    .single();
  if (error) throw new Error(`create subtask failed: ${error.message}`);

  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: task.id,
    actor_type: "user",
    actor_id: session.user.id,
    event_type: "created",
    to_status: INITIAL_STATUS,
  });
  if (evErr) {
    await supabase.from("tasks").delete().eq("id", task.id);
    throw new Error(`create subtask event failed: ${evErr.message}`);
  }

  return task as CreatedTask;
}

/**
 * Edit a task's title + description (board-ux #3). Runs under the user's RLS
 * session, so the update only matches a task in the caller's workspace (a foreign
 * id updates nothing). Only the editable text fields — status/assignee/parent are
 * unchanged. `updated_at` is bumped so the board reorders/refreshes.
 */
export async function updateTask(
  taskId: string,
  title: string,
  description?: string
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!taskId) throw new Error("A task id is required");
  if (!title.trim()) throw new Error("Task title is required");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("workspace_id", session.workspace.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`update task failed: ${error.message}`);
  if (!data) throw new Error("Task not found in your workspace");
}

/**
 * Move a task to a new status from the board (drag-and-drop, board-ux). Human
 * plane, so it can drive any transition the SSOT allows (including in_review →
 * *, which is the human's job). Validates against task-status.ts, writes the row
 * + a `status_changed` event, RLS-scoped to the caller's workspace.
 */
export async function moveTask(taskId: string, to: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!taskId) throw new Error("A task id is required");
  if (!isStatus(to)) throw new Error(`Unknown status: ${to}`);

  const supabase = await createServerSupabase();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", taskId)
    .eq("workspace_id", session.workspace.id)
    .maybeSingle();
  if (!task) throw new Error("Task not found in your workspace");

  const from = task.status as TaskStatus;
  if (from === (to as TaskStatus)) return; // no-op (dropped in the same column)
  if (!canTransition(from, to as TaskStatus)) {
    throw new Error(`Can't move ${from} → ${to}`);
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("workspace_id", session.workspace.id);
  if (error) throw new Error(`move failed: ${error.message}`);

  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: taskId,
    actor_type: "user",
    actor_id: session.user.id,
    event_type: "status_changed",
    from_status: from,
    to_status: to,
  });
  if (evErr) throw new Error(`move event failed: ${evErr.message}`);
}

export type ReviewVerdict = "approve_continue" | "approve_close" | "reject";

/**
 * Resolve an in_review task from the manager UI (approval loop AL-D).
 * approve_continue → in_progress (agent resumes), approve_close → done (human
 * sign-off / PR merged, AL4b), reject → failed. Runs under the user's RLS session
 * via the resolve_review RPC (atomic status + verdict + event), so the RPC only
 * matches a task in the caller's workspace.
 */
export async function resolveReview(
  taskId: string,
  verdict: ReviewVerdict,
  selectedOptionId?: string,
  note?: string
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!taskId) throw new Error("A task id is required");

  const to =
    verdict === "approve_continue" ? "in_progress" :
    verdict === "approve_close" ? "done" : "failed";
  const dbVerdict = verdict === "reject" ? "rejected" : "approved";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("resolve_review", {
    p_workspace_id: session.workspace.id,
    p_task_id: taskId,
    p_to: to,
    p_verdict: dbVerdict,
    p_selected: selectedOptionId || null,
    p_note: note?.trim() || null,
    p_actor_id: session.user.id,
  });
  if (error) throw new Error(`resolve review failed: ${error.message}`);
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    throw new Error(
      res.reason === "not_in_review" ? "Task is not awaiting review" : "Review not found in your workspace"
    );
  }
}

export interface CreatedProject {
  id: string;
  title: string;
  status: string;
  assigned_agent_id: string | null;
}

/**
 * Create a project (kind='project', spec P1). Optional lead agent (NULL =
 * unassigned). Runs under the user's RLS session. Writes the `created` event.
 */
export async function createProject(
  title: string,
  leadAgentId?: string,
  description?: string,
  priority: "high" | "medium" | "low" = "medium"
): Promise<CreatedProject> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!title.trim()) throw new Error("Project title is required");

  const supabase = await createServerSupabase();

  if (leadAgentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, revoked_at")
      .eq("id", leadAgentId)
      .eq("workspace_id", session.workspace.id)
      .maybeSingle();
    if (!agent) throw new Error("Lead agent not found in your workspace");
    if (agent.revoked_at) throw new Error("Cannot assign a project to a revoked agent");
  }

  const { data: project, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: session.workspace.id,
      kind: "project",
      assigned_agent_id: leadAgentId || null,
      title: title.trim(),
      description: description?.trim() || null,
      status: INITIAL_STATUS,
      priority,
      created_by_user_id: session.user.id,
    })
    .select("id, title, status, assigned_agent_id")
    .single();
  if (error) throw new Error(`create project failed: ${error.message}`);

  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: project.id,
    actor_type: "user",
    actor_id: session.user.id,
    event_type: "created",
    to_status: INITIAL_STATUS,
  });
  if (evErr) {
    await supabase.from("tasks").delete().eq("id", project.id);
    throw new Error(`create project event failed: ${evErr.message}`);
  }
  return project as CreatedProject;
}

/**
 * Edit a project's title, description, and lead agent (board-ux #4). Runs under
 * the user's RLS session (only matches a project in the caller's workspace).
 * leadAgentId "" clears the lead (unassigned, allowed for projects — P2); a given
 * id must be an active in-workspace agent. Only edits the project row; child tasks
 * keep their own assignees. `updated_at` bumped so the lane refreshes.
 */
export async function updateProject(
  projectId: string,
  title: string,
  leadAgentId?: string,
  description?: string
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!projectId) throw new Error("A project id is required");
  if (!title.trim()) throw new Error("Project title is required");

  const supabase = await createServerSupabase();

  if (leadAgentId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, revoked_at")
      .eq("id", leadAgentId)
      .eq("workspace_id", session.workspace.id)
      .maybeSingle();
    if (!agent) throw new Error("Lead agent not found in your workspace");
    if (agent.revoked_at) throw new Error("Cannot assign a project to a revoked agent");
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      assigned_agent_id: leadAgentId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("workspace_id", session.workspace.id)
    .eq("kind", "project")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`update project failed: ${error.message}`);
  if (!data) throw new Error("Project not found in your workspace");
}

/**
 * Delete a task (board-ux). RLS-scoped to the caller's workspace. Deleting a
 * project cascades to its child tasks (tasks.parent_id is `on delete cascade`)
 * and each task's events (task_events.task_id cascade) — so this one call handles
 * both a leaf task and a whole project. Miscellaneous cannot be deleted (guarded).
 */
export async function deleteTask(taskId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!taskId) throw new Error("A task id is required");

  const supabase = await createServerSupabase();

  // Guard: don't allow deleting the Miscellaneous system project.
  const { data: row } = await supabase
    .from("tasks")
    .select("id, kind, title")
    .eq("id", taskId)
    .eq("workspace_id", session.workspace.id)
    .maybeSingle();
  if (!row) throw new Error("Not found in your workspace");
  if (row.kind === "project" && row.title === "Miscellaneous") {
    throw new Error("The Miscellaneous project can't be deleted");
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("workspace_id", session.workspace.id);
  if (error) throw new Error(`delete failed: ${error.message}`);
}
