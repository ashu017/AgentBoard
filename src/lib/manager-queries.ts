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
  status: TaskStatus;
  result: string | null;
  assigned_agent_id: string;
  parent_id: string | null;
  updated_at: string;
}

/** Board read cap — counts TOP-LEVEL items; children of visible parents come along. */
export const BOARD_TASK_LIMIT = 200;

// ── Board filters (hierarchical-tasks spec H7/H8) ────────────────────────────

export type TimeWindow = "2w" | "30d" | "90d" | "all";
export type StatusFilter = "active" | "all";

export interface BoardFilters {
  window: TimeWindow;
  status: StatusFilter;
}

export const DEFAULT_FILTERS: BoardFilters = { window: "2w", status: "active" };

const WINDOW_DAYS: Record<Exclude<TimeWindow, "all">, number> = { "2w": 14, "30d": 30, "90d": 90 };
const ACTIVE_STATUSES = ["todo", "in_progress", "in_review"];

/** Parse + clamp raw search params into valid filters (falls back to defaults). */
export function parseFilters(raw: { window?: string; status?: string }): BoardFilters {
  const window = (["2w", "30d", "90d", "all"] as const).includes(raw.window as TimeWindow)
    ? (raw.window as TimeWindow)
    : DEFAULT_FILTERS.window;
  const status = (["active", "all"] as const).includes(raw.status as StatusFilter)
    ? (raw.status as StatusFilter)
    : DEFAULT_FILTERS.status;
  return { window, status };
}

export async function listAgents(): Promise<AgentRow[]> {
  const supabase = await createServerSupabase();
  // tasks(count) is the embedded aggregate over the FK tasks.assigned_agent_id.
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, description, api_key_prefix, revoked_at, last_seen_at, created_at, tasks(count)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => {
    const { tasks, ...rest } = a as typeof a & { tasks?: { count: number }[] };
    return { ...rest, task_count: tasks?.[0]?.count ?? 0 } as AgentRow;
  });
}

const BOARD_COLS = "id, title, description, status, result, assigned_agent_id, parent_id, updated_at";

/**
 * Board read: top-level items matching the filters, plus all children of those
 * visible parents (a project is shown whole once it's in view, H7). The read cap
 * counts TOP-LEVEL items; children are not separately capped in v1.
 */
export async function listBoardTasks(
  filters: BoardFilters = DEFAULT_FILTERS
): Promise<{ tasks: BoardTask[]; capped: boolean }> {
  const supabase = await createServerSupabase();

  // 1) Top-level items (parent_id IS NULL) under the window + status filters.
  let top = supabase
    .from("tasks")
    .select(BOARD_COLS)
    .is("parent_id", null)
    .order("updated_at", { ascending: false })
    .limit(BOARD_TASK_LIMIT + 1);

  if (filters.status === "active") top = top.in("status", ACTIVE_STATUSES);
  if (filters.window !== "all") {
    const since = new Date(Date.now() - WINDOW_DAYS[filters.window] * 86_400_000).toISOString();
    top = top.gte("updated_at", since);
  }

  const { data: topData, error: topErr } = await top;
  if (topErr) throw new Error(topErr.message);
  const topRows = (topData ?? []) as BoardTask[];
  const capped = topRows.length > BOARD_TASK_LIMIT;
  const visible = topRows.slice(0, BOARD_TASK_LIMIT);

  // 2) Children of the visible parents (regardless of their own status/window).
  const parentIds = visible.map((t) => t.id);
  let children: BoardTask[] = [];
  if (parentIds.length > 0) {
    const { data: childData, error: childErr } = await supabase
      .from("tasks")
      .select(BOARD_COLS)
      .in("parent_id", parentIds)
      .order("updated_at", { ascending: false });
    if (childErr) throw new Error(childErr.message);
    children = (childData ?? []) as BoardTask[];
  }

  return { tasks: [...visible, ...children], capped };
}
