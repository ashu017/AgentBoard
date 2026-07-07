import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Integration-test harness: loads .env.local, gives a service-role client, and
// seeds/tears down real workspaces+agents+users so the agent-db path can be
// exercised end-to-end against the live Supabase project.

export function loadEnv(): Record<string, string> {
  try {
    const path = fileURLToPath(new URL("../../.env.local", import.meta.url));
    const text = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnv();

/** True when the live-DB integration env is present. Tests skip otherwise. */
export const hasDbEnv = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY);

/** Make the agent-db module read the same env when run under Vitest. */
export function applyEnv(): void {
  if (env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  if (env.SUPABASE_SECRET_KEY) process.env.SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
}

export function admin(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * A Supabase client authenticated AS a specific user (their JWT), so human-plane
 * RLS applies — used to verify the owner_user_id = auth.uid() policies actually
 * deny cross-user access. Generates a session via the admin API.
 */
export async function userClient(userId: string): Promise<SupabaseClient> {
  // Mint a session for the user by generating a magic link and exchanging the
  // tokens isn't directly available; instead use admin to create a session via
  // the auth admin "generate link" → not exposed. Simplest reliable path: sign
  // the user in with a known password. We set one here via admin update.
  const db = admin();
  const { data: u } = await db.auth.admin.getUserById(userId);
  const email = u.user?.email;
  if (!email) throw new Error("user has no email");
  const password = `Test-${userId}-pw!`;
  await db.auth.admin.updateUserById(userId, { password });

  const authed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await authed.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`user sign-in failed: ${error.message}`);
  return authed;
}

export interface SeededTenant {
  userId: string;
  workspaceId: string;
  agentId: string;
  /** default idea for this workspace; project rows must reference it (tasks_project_has_idea). */
  ideaId: string;
  /** raw token + hash for this tenant's agent. */
  token: string;
  hash: string;
}

let counter = 0;

/**
 * Create a real auth user + workspace + agent. Returns ids and the agent key.
 * Pass a generated key (token+hash+prefix) from src/lib/api-key.
 */
export async function seedTenant(
  key: { token: string; hash: string; prefix: string },
  label: string
): Promise<SeededTenant> {
  const db = admin();
  const tag = `${Date.now()}-${counter++}`;
  const email = `agentboard-test-${label}-${tag}@example.test`;

  const { data: userRes, error: userErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  const userId = userRes.user.id;

  const { data: ws, error: wsErr } = await db
    .from("workspaces")
    .insert({ owner_user_id: userId, name: `ws-${label}-${tag}` })
    .select("id")
    .single();
  if (wsErr) throw wsErr;

  const { data: idea, error: ideaErr } = await db
    .from("ideas")
    .insert({ workspace_id: ws.id, name: "Test Idea" })
    .select("id")
    .single();
  if (ideaErr) throw ideaErr;

  const { data: agent, error: agentErr } = await db
    .from("agents")
    .insert({
      workspace_id: ws.id,
      name: `agent-${label}`,
      api_key_hash: key.hash,
      api_key_prefix: key.prefix,
    })
    .select("id")
    .single();
  if (agentErr) throw agentErr;

  return { userId, workspaceId: ws.id, agentId: agent.id, ideaId: idea.id, token: key.token, hash: key.hash };
}

/**
 * Create a top-level work item directly (manager action) for a tenant; returns its id.
 *
 * Under the first-class-projects model, an agent's assignable top-level item is a
 * PROJECT (kind='project', no parent, may be assigned to an agent and carries its own
 * status). That shape satisfies the `tasks_kind_shape` CHECK, so all the existing
 * status-transition / submit_result tests that seed "a task for the agent" keep working
 * unchanged — semantically those rows are now projects. Pass kind:'task' (with a
 * parent_id) only when a child task is explicitly needed.
 */
export async function seedTask(
  t: SeededTenant,
  fields: { title: string; status?: string; description?: string; kind?: string; parentId?: string | null }
): Promise<string> {
  const kind = fields.kind ?? "project";
  const { data, error } = await admin()
    .from("tasks")
    .insert({
      workspace_id: t.workspaceId,
      assigned_agent_id: t.agentId,
      kind,
      parent_id: fields.parentId ?? null,
      idea_id: kind === "project" ? t.ideaId : null,
      title: fields.title,
      description: fields.description ?? null,
      status: fields.status ?? "todo",
      created_by_user_id: t.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Remove everything created for a tenant. */
export async function teardownTenant(t: SeededTenant): Promise<void> {
  const db = admin();
  // Delete the workspace explicitly first (cascades agents → tasks → task_events).
  // Don't rely solely on the auth-user delete cascading — that was unreliable
  // under Vitest (process can exit before the admin call settles), leaving
  // orphaned app rows. Surface errors instead of swallowing them silently.
  const { error: wsErr } = await db.from("workspaces").delete().eq("id", t.workspaceId);
  if (wsErr) console.warn(`teardown: workspace ${t.workspaceId} delete failed: ${wsErr.message}`);
  const { error: userErr } = await db.auth.admin.deleteUser(t.userId);
  if (userErr) console.warn(`teardown: user ${t.userId} delete failed: ${userErr.message}`);
}
