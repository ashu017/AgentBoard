import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { hashApiKey } from "@/lib/api-key";
import {
  type TaskStatus,
  isStatus,
  isTerminal,
  agentCanTransition,
  prBlocksAgentDone,
} from "@/lib/task-status";
import {
  AgentError,
  badInput,
  unauthorized,
  notFound,
  illegalTransition,
  tooLarge,
} from "@/lib/agent-errors";

// ─────────────────────────────────────────────────────────────────────────────
// The confined agent-plane DB module (CLAUDE.md "Agent DB access is confined";
// design.md isolation posture; DECISIONS 3A/D8).
//
// • Connects via the service-role client (bypasses RLS) — the agent request
//   carries no user JWT, so human-plane RLS would hide every row.
// • STRUCTURAL scope enforcement (D8): there is no exported path to an unscoped
//   query. Every task/event read goes through `scopedTasks()`, which REQUIRES an
//   AgentContext and injects `workspace_id` + `assigned_agent_id`. A new query
//   added without scope won't compile against this surface.
// • Service-role never touches the human UI path (this module is server-only and
//   only imported by the MCP route).
// ─────────────────────────────────────────────────────────────────────────────

/** Result payload cap — protects Realtime payload size + board render (D-SUBMIT). */
export const MAX_RESULT_BYTES = 256 * 1024; // 256 KB

/** last_seen_at write throttle window (D10) — skip the write if seen within this. */
const LAST_SEEN_THROTTLE_MS = 45_000; // 45s, inside the 30–60s band

/** A resolved, authenticated agent identity. The ONLY key to scoped queries. */
export interface AgentContext {
  agentId: string;
  workspaceId: string;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  assigned_agent_id: string;
  parent_id: string | null;
  kind: "project" | "task";
  title: string;
  description: string | null;
  /** Full brief (BRD/spec/design doc) on a project; null when none provided or on
   * a leaf task. The context an agent reads before decomposing (D-PROJECT-SPEC). */
  spec: string | null;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  pr_url: string | null;
  result: string | null;
  review_reason: string | null;
  review_options: unknown | null;
  review_verdict: "approved" | "rejected" | null;
  review_selected_option: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

function db(): SupabaseClient {
  return createAdminClient();
}

// ── Auth: resolve an agent from its bearer key ───────────────────────────────

/**
 * Resolve `(agentId, workspaceId)` from a raw bearer token. Throws 401 if the
 * key is malformed, unknown, or revoked. This is the ONLY way to obtain an
 * AgentContext — so every downstream query is necessarily scoped.
 */
export async function resolveAgentByKey(rawToken: string): Promise<AgentContext> {
  if (!rawToken) throw unauthorized();
  const hash = hashApiKey(rawToken);
  const { data, error } = await db()
    .from("agents")
    .select("id, workspace_id, revoked_at")
    .eq("api_key_hash", hash)
    .is("revoked_at", null) // revoked keys fail the lookup immediately (D12)
    .maybeSingle();

  if (error) throw badInput(error.message);
  if (!data) throw unauthorized();
  return { agentId: data.id, workspaceId: data.workspace_id };
}

// ── Structural scoped-query wrapper (D8) ─────────────────────────────────────

/**
 * Returns a `tasks` query already filtered to the agent's scope. Callers cannot
 * obtain an unfiltered tasks query from this module — this is the structural
 * boundary. Always chain further conditions onto the returned builder.
 */
function scopedTasks(ctx: AgentContext) {
  return db()
    .from("tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("assigned_agent_id", ctx.agentId);
}

// ── last_seen_at, throttled (D10) ────────────────────────────────────────────

/**
 * Bump last_seen_at, but at most once per throttle window. Reads the stored
 * value first and skips the write if recent — avoids turning every poll into a
 * DB write + Realtime event on the hottest path.
 */
export async function touchLastSeen(ctx: AgentContext, nowMs: number = Date.now()): Promise<void> {
  const { data } = await db()
    .from("agents")
    .select("last_seen_at")
    .eq("id", ctx.agentId)
    .maybeSingle();

  const last = data?.last_seen_at ? Date.parse(data.last_seen_at) : 0;
  if (nowMs - last < LAST_SEEN_THROTTLE_MS) return; // within window → skip

  await db()
    .from("agents")
    .update({ last_seen_at: new Date(nowMs).toISOString() })
    .eq("id", ctx.agentId);
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * scopedProjectSubtree(ctx, projectId) — child tasks of a project the caller
 * LEADS. The lead-ownership check is the gate (spec §3a): if the caller doesn't
 * lead a kind='project' row with this id, returns 404 (notFound). This is the
 * ONLY path that returns rows not assigned to the caller, and it stays confined:
 * the project must be in ctx.workspaceId AND led by ctx.agentId.
 */
export async function scopedProjectSubtree(
  ctx: AgentContext,
  projectId: string
): Promise<TaskRow[]> {
  const { data: proj, error: pErr } = await db()
    .from("tasks")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("kind", "project")
    .eq("assigned_agent_id", ctx.agentId)
    .maybeSingle();
  if (pErr) throw badInput(pErr.message);
  if (!proj) throw notFound();

  const { data, error } = await db()
    .from("tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("parent_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw badInput(error.message);
  return (data ?? []) as TaskRow[];
}

/**
 * list_my_tasks(status?, parentId?) — the agent's own tasks, optionally filtered
 * by status and/or parent. `parentId: null` returns only top-level tasks; a uuid
 * returns that project's subtree (children regardless of assignee), gated by
 * lead-ownership via scopedProjectSubtree (spec §3a/P6).
 */
export async function listMyTasks(
  ctx: AgentContext,
  status?: string,
  parentId?: string | null
): Promise<TaskRow[]> {
  let q = scopedTasks(ctx).order("updated_at", { ascending: false });
  if (status !== undefined) {
    if (!isStatus(status)) throw badInput(`Unknown status: ${status}`);
    q = q.eq("status", status);
  }
  if (parentId !== undefined) {
    if (parentId === null) {
      q = q.is("parent_id", null);
    } else {
      // A parent id means "this project's subtree" — gated by lead-ownership.
      // Returns children regardless of assignee (spec §3a/P6).
      const subtree = await scopedProjectSubtree(ctx, parentId);
      return status === undefined ? subtree : subtree.filter((t) => t.status === status);
    }
  }
  const { data, error } = await q;
  if (error) throw badInput(error.message);
  return (data ?? []) as TaskRow[];
}

/**
 * create_subtask(parent_task_id, title, description?, assignee_agent_id?) — create
 * a child task under a PROJECT the agent leads (spec P4). The child is kind='task'.
 * assignee defaults to the lead; if given it must be an active in-workspace agent.
 * Parent not a led project → 404; bad assignee → 404; empty title → 400.
 */
export async function createSubtask(
  ctx: AgentContext,
  parentTaskId: string,
  title: string,
  description?: string,
  assigneeAgentId?: string
): Promise<TaskRow> {
  if (!parentTaskId) throw badInput("parent_task_id required");
  if (typeof title !== "string" || !title.trim()) throw badInput("title required");

  const { data, error } = await db().rpc("create_subtask", {
    p_workspace_id: ctx.workspaceId,
    p_parent_id: parentTaskId,
    p_title: title.trim(),
    p_description: description?.trim() || null,
    p_actor_type: "agent",
    p_actor_id: ctx.agentId,
    p_created_by: null,
    p_require_agent: ctx.agentId, // parent must be a project this agent leads
    p_assignee: assigneeAgentId || null,
  });

  if (error) throw badInput(error.message);
  const res = data as
    | { ok: true; task: TaskRow }
    | { ok: false; reason: "not_found" | "bad_assignee" };

  if (res.ok) return res.task;
  // Both "parent not a led project" and "assignee not in workspace" → 404 (never 403).
  throw notFound();
}

/** Fetch one scoped task or throw 404 (not 403). Used to validate transitions. */
async function getScopedTask(ctx: AgentContext, taskId: string): Promise<TaskRow> {
  if (!taskId) throw badInput("task_id required");
  const { data, error } = await scopedTasks(ctx).eq("id", taskId).maybeSingle();
  if (error) throw badInput(error.message);
  if (!data) throw notFound();
  return data as TaskRow;
}

/**
 * update_task_status(task_id, status, note?). Validates legality against the
 * SSOT (task-status.ts), then applies an atomic compare-and-swap via RPC. A
 * concurrent change that invalidates the move surfaces as 409.
 */
export async function updateTaskStatus(
  ctx: AgentContext,
  taskId: string,
  to: string,
  note?: string
): Promise<TaskRow> {
  if (!isStatus(to)) throw badInput(`Unknown status: ${to}`);
  const task = await getScopedTask(ctx, taskId);
  return applyTransition(ctx, task, to, { note });
}

/**
 * submit_result(task_id, output, status?). Valid only on an in_progress task
 * (→ 409 otherwise). output capped at 256 KB (→ 413). If status is supplied it
 * must be terminal, and result+transition happen in one transaction; if omitted,
 * the result is written with no status change.
 */
export async function submitResult(
  ctx: AgentContext,
  taskId: string,
  output: string,
  status?: string,
  prUrl?: string
): Promise<TaskRow> {
  if (typeof output !== "string") throw badInput("output must be a string");
  if (Buffer.byteLength(output, "utf8") > MAX_RESULT_BYTES) throw tooLarge();
  if (prUrl !== undefined && typeof prUrl !== "string") throw badInput("pr_url must be a string");

  const task = await getScopedTask(ctx, taskId);
  if (task.status !== "in_progress") {
    // An agent submitting a result implies it started work (D-SUBMIT).
    throw illegalTransition("submit_result is only valid on an in_progress task");
  }

  // Attach the PR link if given. getScopedTask above already confirmed the task
  // is in the agent's scope (foreign/absent → 404); this update repeats the same
  // (workspace_id, assigned_agent_id, id) filter so it can only touch that row.
  // Written before the transition so the link is present the moment a
  // Needs-Review card renders (0014, D-BOARD-REDESIGN).
  if (prUrl) {
    const { error: prErr } = await db()
      .from("tasks")
      .update({ pr_url: prUrl })
      .eq("workspace_id", ctx.workspaceId)
      .eq("assigned_agent_id", ctx.agentId)
      .eq("id", taskId);
    if (prErr) throw badInput(prErr.message);
  }

  if (status !== undefined) {
    if (!isStatus(status)) throw badInput(`Unknown status: ${status}`);
    if (!isTerminal(status)) throw badInput("submit_result status must be terminal (done/failed)");
    // Pass the incoming pr_url so the PR-done gate (D-PR-DONE) sees a PR being set
    // in THIS call, not only one already on the row.
    return applyTransition(ctx, task, status, {
      setResult: true,
      result: output,
      incomingPrUrl: prUrl ?? null,
    });
  }

  // No status change: write the result in-place (still atomic w/ its event).
  return applyTransition(ctx, task, task.status, {
    setResult: true,
    result: output,
    sameStatus: true,
  });
}

/** Max review reason length (mirrors the note cap). */
const MAX_REVIEW_REASON = 2000;

export interface ReviewOption { id: string; label: string; detail?: string }

/**
 * request_review(task_id, reason, options?) — park an in_progress task in in_review
 * with a structured request (AL-C). reason required ≤2000; options optional, ≤10,
 * each label ≤200. Not in_progress → 409; foreign/absent task → 404; bad input → 400.
 * The verdict is delivered poll-based: the agent keeps calling list_my_tasks and
 * sees review_verdict/review_note once a human resolves it. The agent cannot move
 * the task out of in_review itself (AL4b) — see agentCanTransition.
 */
export async function requestReview(
  ctx: AgentContext,
  taskId: string,
  reason: string,
  options?: ReviewOption[] | null
): Promise<TaskRow> {
  if (!taskId) throw badInput("task_id required");
  if (typeof reason !== "string" || !reason.trim()) throw badInput("reason required");
  if (reason.length > MAX_REVIEW_REASON) throw badInput("reason too long (max 2000)");
  if (options != null) {
    if (!Array.isArray(options) || options.length > 10) throw badInput("options must be an array of ≤10");
    for (const o of options) {
      if (!o || typeof o.id !== "string" || typeof o.label !== "string" || o.label.length > 200) {
        throw badInput("each option needs id + label (label ≤200)");
      }
    }
  }

  const { data, error } = await db().rpc("request_review", {
    p_workspace_id: ctx.workspaceId,
    p_agent_id: ctx.agentId,
    p_task_id: taskId,
    p_reason: reason.trim(),
    p_options: options ?? null,
  });
  if (error) throw badInput(error.message);
  const res = data as
    | { ok: true; task: TaskRow }
    | { ok: false; reason: "not_found" | "not_in_progress" };
  if (res.ok) return res.task;
  if (res.reason === "not_found") throw notFound();
  throw illegalTransition("request_review is only valid on an in_progress task");
}

export interface WorkspaceAgent {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
}

/**
 * list_agents() — the active agents in the caller's workspace, so a lead can name
 * assignee ids when decomposing. Scoped by workspace_id (confinement: no path to
 * agents outside ctx.workspaceId).
 */
export async function listAgents(ctx: AgentContext): Promise<WorkspaceAgent[]> {
  const { data, error } = await db()
    .from("agents")
    .select("id, name, api_key_prefix, revoked_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw badInput(error.message);
  return (data ?? [])
    .filter((a) => !a.revoked_at)
    .map((a) => ({ id: a.id, name: a.name, prefix: a.api_key_prefix, active: true }));
}

// ── Shared transition application (calls the atomic RPC) ──────────────────────

interface ApplyOpts {
  note?: string;
  setResult?: boolean;
  result?: string;
  /** result-only write: skip the canTransition check (status unchanged). */
  sameStatus?: boolean;
  /** A PR URL being set in the SAME call (submit_result). Combined with the row's
   * existing pr_url for the PR-done gate (D-PR-DONE). */
  incomingPrUrl?: string | null;
}

async function applyTransition(
  ctx: AgentContext,
  task: TaskRow,
  to: TaskStatus,
  opts: ApplyOpts
): Promise<TaskRow> {
  const from = task.status;
  // Agent-plane legality (AL4b): stricter than canTransition — the agent can
  // never drive a task OUT of in_review (a review it raised is human-resolved).
  if (!opts.sameStatus && !agentCanTransition(from, to)) {
    throw illegalTransition(`Cannot move ${from} → ${to}`);
  }
  // PR review gate (D-PR-DONE): an agent may not self-mark a task `done` while it
  // carries a PR — on the row already, or being set in this same submit_result
  // call. The single funnel here covers BOTH submit_result and update_task_status.
  // The task must stay reviewable for the human to close after the PR is merged.
  const hasPrUrl = Boolean(task.pr_url || opts.incomingPrUrl);
  if (prBlocksAgentDone(to, hasPrUrl)) {
    throw illegalTransition(
      "This task has a pull request — leave it in review for your manager to close after the PR is merged. You cannot mark a PR-raised task done yourself."
    );
  }

  const { data, error } = await db().rpc("agent_apply_transition", {
    p_workspace_id: ctx.workspaceId,
    p_agent_id: ctx.agentId,
    p_task_id: task.id,
    p_from: from,
    p_to: to,
    p_note: opts.note ?? null,
    p_set_result: opts.setResult ?? false,
    p_result: opts.result ?? null,
  });

  if (error) throw badInput(error.message);
  const res = data as
    | { ok: true; task: TaskRow }
    | { ok: false; reason: "not_found" }
    | { ok: false; reason: "conflict"; current: string };

  if (res.ok) return res.task;
  if (res.reason === "not_found") throw notFound();
  // Lost-update: the row changed under us; the move is no longer valid → 409.
  throw illegalTransition(
    `Task status changed concurrently (now ${res.current}); ${from} → ${to} no longer valid`
  );
}

export { AgentError };
