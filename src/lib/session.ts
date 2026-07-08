import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";
import { getOrCreateWorkspace, type Workspace } from "@/lib/workspace";
import { getOrCreateMiscProject } from "@/lib/projects";
import { getOrCreateDefaultIdea } from "@/lib/ideas";
import type { User } from "@supabase/supabase-js";

// The authenticated-session layer. Resolves the current user and (idempotently)
// their workspace — the single entry point the manager UI uses, so the D2
// bootstrap fires on the first authenticated request regardless of entry path.

export interface Session {
  user: User;
  workspace: Workspace;
}

/** Current authenticated user, or null. Uses getUser() (verifies the JWT) — not
 *  getSession(), which trusts the cookie without revalidation. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Resolve the full session (user + workspace), bootstrapping the workspace if
 * needed. Returns null when unauthenticated — callers redirect to /login.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const workspace = await getOrCreateWorkspace(supabase, data.user.id);
  // Every workspace gets a default idea (D-IDEAS) + a Miscellaneous project under
  // it (spec P3) — both idempotent.
  const idea = await getOrCreateDefaultIdea(workspace.id);
  await getOrCreateMiscProject(supabase, workspace.id, idea.id);
  return { user: data.user, workspace };
}
