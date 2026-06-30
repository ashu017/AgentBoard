import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Per-workspace Miscellaneous project (spec P3): the default home for loose tasks.
// kind='project', parent_id NULL, assigned_agent_id NULL (unassigned container).
// Idempotent — title "Miscellaneous" is the lookup key within a workspace.

export const MISC_TITLE = "Miscellaneous";

export interface ProjectRow {
  id: string;
  workspace_id: string;
  title: string;
  kind: "project";
  assigned_agent_id: string | null;
}

/** Return the workspace's Miscellaneous project, creating it if absent. */
export async function getOrCreateMiscProject(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ProjectRow> {
  const existing = await supabase
    .from("tasks")
    .select("id, workspace_id, title, kind, assigned_agent_id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "project")
    .eq("title", MISC_TITLE)
    .is("parent_id", null)
    .maybeSingle();
  if (existing.error) throw new Error(`misc lookup failed: ${existing.error.message}`);
  if (existing.data) return existing.data as ProjectRow;

  const created = await supabase
    .from("tasks")
    .insert({ workspace_id: workspaceId, title: MISC_TITLE, kind: "project", status: "todo" })
    .select("id, workspace_id, title, kind, assigned_agent_id")
    .maybeSingle();
  if (created.data) return created.data as ProjectRow;

  // Lost a race: read back.
  const retry = await supabase
    .from("tasks")
    .select("id, workspace_id, title, kind, assigned_agent_id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "project")
    .eq("title", MISC_TITLE)
    .is("parent_id", null)
    .maybeSingle();
  if (retry.data) return retry.data as ProjectRow;
  throw new Error(`misc create failed: ${created.error?.message ?? "no row"}`);
}
