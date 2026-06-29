import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Workspace bootstrap (DECISIONS D2 / design.md): a new user's single workspace
// is created by an idempotent app-code upsert in the authenticated-session
// layer, guarded by UNIQUE(owner_user_id). NOT a DB trigger — a workspace bug
// must never break GitHub OAuth signup, and this stays plain, testable TS.
//
// "Exactly one workspace per user" is guaranteed by the UNIQUE constraint even
// under a signup race: a concurrent second insert hits the conflict and we read
// back the winner.
// ─────────────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
}

/**
 * Return the caller's workspace, creating it if absent. Idempotent. Runs under
 * the user's RLS session (the workspaces_owner_all policy admits only their own
 * row), so `userId` must be the authenticated user's id.
 */
export async function getOrCreateWorkspace(
  supabase: SupabaseClient,
  userId: string
): Promise<Workspace> {
  // Fast path: already exists.
  const existing = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(`workspace lookup failed: ${existing.error.message}`);
  if (existing.data) return existing.data as Workspace;

  // Create. UNIQUE(owner_user_id) makes this safe under a race.
  const created = await supabase
    .from("workspaces")
    .insert({ owner_user_id: userId })
    .select("*")
    .maybeSingle();

  if (created.data) return created.data as Workspace;

  // Lost the race (or RLS hid the conflict result): read back the winner.
  if (created.error) {
    const retry = await supabase
      .from("workspaces")
      .select("*")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (retry.data) return retry.data as Workspace;
    throw new Error(`workspace create failed: ${created.error.message}`);
  }

  throw new Error("workspace create returned no row");
}
