import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";
import type { TaskStatus } from "@/lib/task-status";

// Human-plane read queries for the manager UI. Run under the user's RLS session,
// so they return only the caller's workspace rows.

export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  api_key_prefix: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  /** Number of tasks assigned to this agent — gates delete (0 = deletable). */
  task_count: number;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  /** Long-form brief (BRD/spec/design doc) on a project — delivered to agents,
   * edited in the modal, never rendered on cards/lanes (D-PROJECT-SPEC). */
  spec: string | null;
  status: TaskStatus;
  /** high | medium | low — shown on cards + project header (0014). */
  priority: "high" | "medium" | "low";
  /** Optional GitHub PR link surfaced on a Needs-Review card (0014). */
  pr_url: string | null;
  /** The idea this project belongs to (project rows only; null on task rows). */
  idea_id: string | null;
  result: string | null;
  /** Approval-loop fields (AL-E): populated while/after a task is in_review. */
  review_reason: string | null;
  review_options: { id: string; label: string; detail?: string }[] | null;
  review_verdict: "approved" | "rejected" | null;
  review_selected_option: string | null;
  review_note: string | null;
  /** Null for an unassigned project (P2); always set for a task. */
  assigned_agent_id: string | null;
  parent_id: string | null;
  kind: "project" | "task";
  updated_at: string;
}

/** Board read cap — counts TOP-LEVEL items; children of visible parents come along. */
export const BOARD_TASK_LIMIT = 200;

// ── Board filters (hierarchical-tasks spec H7/H8) ────────────────────────────

export type TimeWindow = "2w" | "30d" | "90d" | "all";
export type StatusFilter = "active" | "all";

/** Project filter: a project id, or "all" for every project (the default). */
export type ProjectFilter = string;

export interface BoardFilters {
  window: TimeWindow;
  status: StatusFilter;
  /** Project id to narrow the board to, or "all" (default). */
  project: ProjectFilter;
}

export const DEFAULT_FILTERS: BoardFilters = { window: "2w", status: "active", project: "all" };

const WINDOW_DAYS: Record<Exclude<TimeWindow, "all">, number> = { "2w": 14, "30d": 30, "90d": 90 };
const ACTIVE_STATUSES = ["todo", "in_progress", "in_review"];

/** Parse + clamp raw search params into valid filters (falls back to defaults). */
export function parseFilters(raw: { window?: string; status?: string; project?: string }): BoardFilters {
  const window = (["2w", "30d", "90d", "all"] as const).includes(raw.window as TimeWindow)
    ? (raw.window as TimeWindow)
    : DEFAULT_FILTERS.window;
  const status = (["active", "all"] as const).includes(raw.status as StatusFilter)
    ? (raw.status as StatusFilter)
    : DEFAULT_FILTERS.status;
  // project is a free-form id; empty/absent → "all". Validity (exists in the
  // workspace) is enforced by RLS at query time, not here.
  const project = raw.project && raw.project.trim() ? raw.project : DEFAULT_FILTERS.project;
  return { window, status, project };
}

export async function listAgents(ideaId?: string): Promise<AgentRow[]> {
  const supabase = await createServerSupabase();
  // tasks(count) is the embedded aggregate over the FK tasks.assigned_agent_id.
  let query = supabase
    .from("agents")
    .select("id, name, description, api_key_prefix, revoked_at, last_seen_at, created_at, tasks(count), agent_ideas!inner(idea_id)")
    .order("created_at", { ascending: true });
  if (ideaId) query = query.eq("agent_ideas.idea_id", ideaId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tasks, agent_ideas: _ai, ...rest } = a as typeof a & { tasks?: { count: number }[]; agent_ideas?: unknown };
    return { ...rest, task_count: tasks?.[0]?.count ?? 0 } as AgentRow;
  });
}

export interface ProjectOption {
  id: string;
  title: string;
  assigned_agent_id: string | null;
}

/** Projects in the caller's workspace (Add-Task selector). Miscellaneous first. */
export async function listProjects(ideaId?: string): Promise<ProjectOption[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("tasks")
    .select("id, title, assigned_agent_id")
    .eq("kind", "project")
    .order("created_at", { ascending: true });
  if (ideaId) query = query.eq("idea_id", ideaId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProjectOption[];
  // Pin Miscellaneous to the top so it is the default selection.
  return rows.sort((a, b) => (a.title === "Miscellaneous" ? -1 : b.title === "Miscellaneous" ? 1 : 0));
}

const BOARD_COLS = "id, title, description, spec, status, priority, pr_url, idea_id, result, assigned_agent_id, parent_id, kind, review_reason, review_options, review_verdict, review_selected_option, review_note, updated_at";

/**
 * Board read for the SWIMLANE view (DECISIONS LANES-1): lanes are projects, and
 * each lane shows that project's tasks across the status columns.
 *
 * - Lanes (top-level kind='project' rows) are filtered by the time window and,
 *   if set, by the selected project id. The status filter is NOT applied to the
 *   project rows — a lane shows whenever its project matches the window, so a
 *   project never vanishes just because it (or its tasks) are done.
 * - The status filter narrows the TASKS shown inside the lanes (Active hides
 *   done/failed child tasks). It is applied to the children query.
 * The read cap counts lanes (top-level projects); child tasks are not separately
 * capped in v1.
 */
export async function listBoardTasks(
  filters: BoardFilters = DEFAULT_FILTERS,
  ideaId?: string
): Promise<{ tasks: BoardTask[]; capped: boolean }> {
  const supabase = await createServerSupabase();

  // 1) Lanes: top-level projects under the window (+ project-id) filter.
  let top = supabase
    .from("tasks")
    .select(BOARD_COLS)
    .is("parent_id", null)
    .eq("kind", "project")
    .order("updated_at", { ascending: false })
    .limit(BOARD_TASK_LIMIT + 1);

  if (ideaId) top = top.eq("idea_id", ideaId);
  if (filters.project !== "all") top = top.eq("id", filters.project);
  if (filters.window !== "all") {
    const since = new Date(Date.now() - WINDOW_DAYS[filters.window] * 86_400_000).toISOString();
    top = top.gte("updated_at", since);
  }

  const { data: topData, error: topErr } = await top;
  if (topErr) throw new Error(topErr.message);
  const topRows = (topData ?? []) as BoardTask[];
  const capped = topRows.length > BOARD_TASK_LIMIT;
  const visible = topRows.slice(0, BOARD_TASK_LIMIT);

  // 2) Child tasks of the visible lanes, narrowed by the status filter
  //    (Active → only non-terminal tasks). Not windowed: a lane shows its whole
  //    current task set once the project is in view.
  const parentIds = visible.map((t) => t.id);
  let children: BoardTask[] = [];
  if (parentIds.length > 0) {
    let childQuery = supabase
      .from("tasks")
      .select(BOARD_COLS)
      .in("parent_id", parentIds)
      .order("updated_at", { ascending: false });
    if (filters.status === "active") childQuery = childQuery.in("status", ACTIVE_STATUSES);
    const { data: childData, error: childErr } = await childQuery;
    if (childErr) throw new Error(childErr.message);
    children = (childData ?? []) as BoardTask[];
  }

  return { tasks: [...visible, ...children], capped };
}
