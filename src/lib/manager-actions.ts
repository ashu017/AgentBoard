import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSession } from "@/lib/session";
import { generateApiKey } from "@/lib/api-key";
import { INITIAL_STATUS } from "@/lib/task-status";

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
  description?: string
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

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: session.workspace.id,
      assigned_agent_id: assignedAgentId,
      title: title.trim(),
      description: description?.trim() || null,
      status: INITIAL_STATUS,
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
