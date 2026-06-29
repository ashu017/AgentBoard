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
}

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  result: string | null;
  assigned_agent_id: string;
  updated_at: string;
}

/** Board read cap (design.md "Many tasks" — show most-recent N, don't truncate silently). */
export const BOARD_TASK_LIMIT = 200;

export async function listAgents(): Promise<AgentRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, description, api_key_prefix, revoked_at, last_seen_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentRow[];
}

export async function listBoardTasks(): Promise<{ tasks: BoardTask[]; capped: boolean }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, status, result, assigned_agent_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(BOARD_TASK_LIMIT + 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BoardTask[];
  return { tasks: rows.slice(0, BOARD_TASK_LIMIT), capped: rows.length > BOARD_TASK_LIMIT };
}
