# First-Class Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make projects first-class — every task belongs to a project, loose tasks default to a per-workspace Miscellaneous project, and a project's lead agent can decompose it and assign tasks to any agent in the workspace.

**Architecture:** Single recursive `tasks` table gains a `kind` (`'project'|'task'`) discriminator and a nullable `assigned_agent_id` (projects may be unassigned; a CHECK keeps tasks always-assigned and always-parented). Agent plane adds a `list_agents` tool, cross-agent `create_subtask`, and a confined `scopedProjectSubtree` read accessor. Manager UI splits "New" into Project/Task with a Miscellaneous-default project selector.

**Tech Stack:** Next.js (App Router, TS), Supabase (Postgres + RLS + Realtime), MCP TS SDK via `mcp-handler`, Vitest (live-DB integration), Zod.

**Reference spec:** `docs/superpowers/specs/2026-06-30-first-class-projects-design.md`

**Conventions to honor:** status SSOT in `src/lib/task-status.ts`; agent queries confined in `src/lib/agent-db.ts` (no unscoped path); errors `400/401/404/409/413` (never `403`); every design decision logged in `docs/DECISIONS.md` in the same change.

**Build/test commands:**
- Lint/build: `npm run build`
- Tests: `npx vitest run` (integration tests skip automatically if `.env.local` lacks `SUPABASE_SECRET_KEY`)
- Single test file: `npx vitest run tests/integration/projects.test.ts`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/0008_first_class_projects.sql` | `kind` column, `tasks_kind_shape` CHECK, nullable assignee | Create |
| `supabase/migrations/0009_create_subtask_assignee.sql` | `create_subtask` RPC gains assignee + sets `kind='task'` | Create |
| `src/lib/projects.ts` | `getOrCreateMiscProject()` — per-workspace Miscellaneous bootstrap | Create |
| `src/lib/agent-db.ts` | `listAgents`, `scopedProjectSubtree`, `createSubtask(assignee)`, `kind` on `TaskRow` | Modify |
| `src/app/api/mcp/route.ts` | `list_agents` tool, `assignee_agent_id` param, updated instructions | Modify |
| `src/lib/manager-actions.ts` | `createProject`, `createTask(projectId)` | Modify |
| `src/lib/manager-queries.ts` | `kind` on `BoardTask`, `listProjects()` | Modify |
| `src/app/actions.ts` | `createProjectAction`, `createTask` gains projectId | Modify |
| `src/app/board/page.tsx` | pass projects to `BoardClient` | Modify |
| `src/app/board/BoardClient.tsx` | split `+ New` dropdown, project selector, `kind`-based `isProject` | Modify |
| `tests/integration/projects.test.ts` | cross-agent assign, lead subtree read, kind invariants, default project | Create |
| `docs/DECISIONS.md` | log P1–P7 + H-reversals | Modify |

---

## Task 1: Migration — `kind` discriminator + nullable assignee

**Files:**
- Create: `supabase/migrations/0008_first_class_projects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- First-class projects (spec 2026-06-30-first-class-projects-design.md, P1/P2).
-- A "project" becomes an explicit row (kind='project'), not inferred from child
-- count. Every task (kind='task') must have a parent project AND an agent;
-- projects are top-level and may be unassigned (NULL lead). This replaces the
-- emergent "parent-less task = project" model of migration 0006.

alter table public.tasks
  add column if not exists kind text not null default 'task'
    check (kind in ('project','task'));

-- Projects are unassignable containers; the shape CHECK below still forces every
-- TASK to carry an agent, so directed assignment (D11) holds for tasks.
alter table public.tasks
  alter column assigned_agent_id drop not null;

-- Shape invariant (P2): projects are top-level; tasks are parented + assigned.
alter table public.tasks
  add constraint tasks_kind_shape check (
    (kind = 'project' and parent_id is null)
    or
    (kind = 'task' and parent_id is not null and assigned_agent_id is not null)
  );

-- Find a workspace's projects (Add-Task project selector, listProjects).
create index if not exists tasks_workspace_kind_idx
  on public.tasks (workspace_id, kind);
```

- [ ] **Step 2: Apply the migration**

Use the supabase MCP `apply_migration` tool with name `first_class_projects` and the SQL above, OR run via the project's migration flow. Confirm no error.

- [ ] **Step 3: Verify the constraint exists**

Run via supabase MCP `execute_sql`:
```sql
select conname from pg_constraint where conname = 'tasks_kind_shape';
```
Expected: one row `tasks_kind_shape`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_first_class_projects.sql
git commit -m "feat(db): add kind discriminator + nullable project assignee (P1/P2)"
```

---

## Task 2: Migration — `create_subtask` RPC with assignee + kind

**Files:**
- Create: `supabase/migrations/0009_create_subtask_assignee.sql`

Context: the existing RPC (0007) forces the child to inherit the parent's agent and never sets `kind`. We replace it so the child is `kind='task'` and can be assigned to a chosen, validated in-workspace agent. The depth check changes from "parent.parent_id IS NULL" to "parent.kind = 'project'".

- [ ] **Step 1: Write the migration**

```sql
-- Update create_subtask for first-class projects (spec P4). The child is now an
-- explicit kind='task' row; its assignee can be any ACTIVE agent in the same
-- workspace (cross-agent decomposition), defaulting to the lead. The parent must
-- be a kind='project' the caller leads (agent plane) or owns (human plane).
--
-- Returns jsonb the caller maps to the error contract:
--   { ok:true, task:{...} }
--   { ok:false, reason:'not_found' }        → parent not in scope / not a project (404)
--   { ok:false, reason:'bad_assignee' }      → assignee not an active workspace agent (404)
create or replace function public.create_subtask(
  p_workspace_id uuid,
  p_parent_id    uuid,
  p_title        text,
  p_description  text,
  p_actor_type   text,    -- 'agent' | 'user'
  p_actor_id     uuid,
  p_created_by   uuid,    -- created_by_user_id for the child row (human plane)
  p_require_agent uuid,   -- if not null, parent.assigned_agent_id must equal this (lead gate, agent plane)
  p_assignee     uuid     -- the child's assigned_agent_id; if null, defaults to parent's lead / actor
) returns jsonb
language plpgsql
as $$
declare
  v_parent   public.tasks;
  v_child    public.tasks;
  v_assignee uuid;
begin
  -- Lock the parent within scope. Missing / wrong lead → not_found (404, not 403).
  select * into v_parent
    from public.tasks
   where id = p_parent_id
     and workspace_id = p_workspace_id
     and kind = 'project'
     and (p_require_agent is null or assigned_agent_id = p_require_agent)
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Resolve assignee: explicit arg, else parent lead, else the acting agent.
  v_assignee := coalesce(p_assignee, v_parent.assigned_agent_id, p_actor_id);

  -- A task must have an agent (kind_shape CHECK), and it must be an active agent
  -- in this workspace. NULL or foreign/revoked → bad_assignee (404).
  if v_assignee is null or not exists (
    select 1 from public.agents
     where id = v_assignee
       and workspace_id = p_workspace_id
       and revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_assignee');
  end if;

  insert into public.tasks
    (workspace_id, assigned_agent_id, parent_id, kind, title, description, status, created_by_user_id)
  values
    (p_workspace_id, v_assignee, p_parent_id, 'task', p_title, p_description, 'todo', p_created_by)
  returning * into v_child;

  perform public.append_task_event(
    v_child.id, p_actor_type, p_actor_id, 'created', null, 'todo', null
  );

  return jsonb_build_object('ok', true, 'task', to_jsonb(v_child));
end;
$$;

revoke all on function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid)
  from anon, authenticated;

alter function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid)
  set search_path = public, pg_temp;

-- Drop the old 8-arg signature so callers can't hit the stale version.
drop function if exists public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid);
```

- [ ] **Step 2: Apply the migration** (supabase MCP `apply_migration`, name `create_subtask_assignee`). Confirm no error.

- [ ] **Step 3: Verify the 9-arg function exists**

```sql
select pronargs from pg_proc where proname = 'create_subtask';
```
Expected: a row with `pronargs = 9` (and the old 8-arg gone).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_create_subtask_assignee.sql
git commit -m "feat(db): create_subtask gains assignee + sets kind=task (P4)"
```

---

## Task 3: Miscellaneous project bootstrap

**Files:**
- Create: `src/lib/projects.ts`
- Modify: `src/lib/session.ts` (call the bootstrap where the workspace is ensured)
- Test: `tests/integration/projects.test.ts`

- [ ] **Step 1: Write the failing test** (create the file)

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasDbEnv, applyEnv, admin, seedTenant, teardownTenant, type SeededTenant } from "./helpers";
import { generateApiKey } from "@/lib/api-key";

const d = hasDbEnv ? describe : describe.skip;

d("first-class projects", () => {
  let lead: SeededTenant;
  beforeAll(async () => {
    applyEnv();
    lead = await seedTenant(generateApiKey(), "proj-lead");
  });
  afterAll(async () => { if (lead) await teardownTenant(lead); });

  it("getOrCreateMiscProject is idempotent (one Misc per workspace)", async () => {
    const { getOrCreateMiscProject } = await import("@/lib/projects");
    const a = await getOrCreateMiscProject(admin(), lead.workspaceId);
    const b = await getOrCreateMiscProject(admin(), lead.workspaceId);
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe("project");

    const { count } = await admin()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", lead.workspaceId)
      .eq("kind", "project")
      .is("assigned_agent_id", null);
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/projects.test.ts`
Expected: FAIL — cannot resolve `@/lib/projects`.

- [ ] **Step 3: Implement `src/lib/projects.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/projects.test.ts`
Expected: PASS (or SKIP if no DB env — then verify on a machine with `.env.local`).

- [ ] **Step 5: Wire bootstrap into session** — in `src/lib/session.ts`, after `getOrCreateWorkspace(...)` resolves the workspace, call `await getOrCreateMiscProject(supabase, workspace.id)`. Read the file first; add the import `import { getOrCreateMiscProject } from "@/lib/projects";` and the call on the workspace-ensure path. (If `session.ts` does not ensure the workspace, add the call in `src/app/board/page.tsx` after the workspace is loaded instead.)

- [ ] **Step 6: Build to verify wiring compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects.ts src/lib/session.ts tests/integration/projects.test.ts
git commit -m "feat: per-workspace Miscellaneous project bootstrap (P3)"
```

---

## Task 4: `agent-db` — `kind` on TaskRow + `listAgents`

**Files:**
- Modify: `src/lib/agent-db.ts`
- Test: `tests/integration/projects.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the `d(...)` block)

```ts
  it("listAgents returns active workspace agents, scoped", async () => {
    const { listAgents } = await import("@/lib/agent-db");
    const ctx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
    const agents = await listAgents(ctx);
    expect(agents.some((a) => a.id === lead.agentId)).toBe(true);
    expect(agents.every((a) => a.active)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/projects.test.ts -t listAgents`
Expected: FAIL — `listAgents` not exported.

- [ ] **Step 3: Implement** — in `src/lib/agent-db.ts`:

(a) add `kind: "project" | "task";` to the `TaskRow` interface (after `parent_id`).

(b) add the new accessor + type near the other operations:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/projects.test.ts -t listAgents`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-db.ts tests/integration/projects.test.ts
git commit -m "feat(agent-db): kind on TaskRow + listAgents (P5)"
```

---

## Task 5: `agent-db` — `scopedProjectSubtree` (lead reads subtree)

**Files:**
- Modify: `src/lib/agent-db.ts`
- Test: `tests/integration/projects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it("lead reads its project subtree incl. other agents' tasks; non-lead gets 404", async () => {
    const other = await seedTenant(generateApiKey(), "proj-other");
    try {
      const a = admin();
      // A project led by `lead`.
      const { data: proj } = await a.from("tasks")
        .insert({ workspace_id: lead.workspaceId, kind: "project",
                  assigned_agent_id: lead.agentId, title: "Ship feature", status: "todo" })
        .select("id").single();
      // A child task under it, assigned to a DIFFERENT agent in the same ws.
      // (other agent lives in another workspace here, so use lead's ws + a 2nd agent.)
      const { data: ag2 } = await a.from("agents")
        .insert({ workspace_id: lead.workspaceId, name: "ag2",
                  api_key_hash: generateApiKey().hash, api_key_prefix: "zzzz1111" })
        .select("id").single();
      await a.from("tasks").insert({
        workspace_id: lead.workspaceId, kind: "task", parent_id: proj!.id,
        assigned_agent_id: ag2!.id, title: "subtask for ag2", status: "todo",
      });

      const { listMyTasks } = await import("@/lib/agent-db");
      const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };
      const subtree = await listMyTasks(leadCtx, undefined, proj!.id);
      expect(subtree.some((t) => t.assigned_agent_id === ag2!.id)).toBe(true);

      // ag2 does not lead the project → reading its subtree returns nothing (404 path).
      const ag2Ctx = { agentId: ag2!.id, workspaceId: lead.workspaceId };
      await expect(listMyTasks(ag2Ctx, undefined, proj!.id)).rejects.toMatchObject({ code: 404 });
    } finally {
      await teardownTenant(other);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/projects.test.ts -t subtree`
Expected: FAIL — `listMyTasks` still returns only the caller's own rows (ag2's task absent for lead).

- [ ] **Step 3: Implement** — in `src/lib/agent-db.ts`:

(a) add the confined subtree accessor:

```ts
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
```

(b) route `listMyTasks` to it when a `parentId` is given. Replace the `parentId` branch in `listMyTasks` so that a non-null `parentId` delegates to the subtree accessor (covering cross-agent children), while `null` keeps the "my top-level" behavior:

```ts
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
```

(Place this block before the `const { data, error } = await q;` execution, and ensure the early `return` skips the scoped-self query for the subtree case.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/projects.test.ts -t subtree`
Expected: PASS.

- [ ] **Step 5: Run the full file** to confirm no regressions: `npx vitest run tests/integration/projects.test.ts` → PASS/SKIP.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-db.ts tests/integration/projects.test.ts
git commit -m "feat(agent-db): confined scopedProjectSubtree for lead reads (P6/§3a)"
```

---

## Task 6: `agent-db` — `createSubtask` with assignee + lead gate

**Files:**
- Modify: `src/lib/agent-db.ts`
- Test: `tests/integration/projects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it("lead create_subtask assigns to another in-ws agent; foreign agent → 404", async () => {
    const a = admin();
    const { data: proj } = await a.from("tasks")
      .insert({ workspace_id: lead.workspaceId, kind: "project",
                assigned_agent_id: lead.agentId, title: "Proj X", status: "todo" })
      .select("id").single();
    const { data: ag2 } = await a.from("agents")
      .insert({ workspace_id: lead.workspaceId, name: "ag2x",
                api_key_hash: generateApiKey().hash, api_key_prefix: "yyyy2222" })
      .select("id").single();

    const { createSubtask } = await import("@/lib/agent-db");
    const leadCtx = { agentId: lead.agentId, workspaceId: lead.workspaceId };

    const child = await createSubtask(leadCtx, proj!.id, "do part", undefined, ag2!.id);
    expect(child.assigned_agent_id).toBe(ag2!.id);
    expect(child.kind).toBe("task");

    // An agent id from another workspace must not be assignable → 404.
    const foreign = await seedTenant(generateApiKey(), "foreign");
    try {
      await expect(
        createSubtask(leadCtx, proj!.id, "leak", undefined, foreign.agentId)
      ).rejects.toMatchObject({ code: 404 });
    } finally {
      await teardownTenant(foreign);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/projects.test.ts -t create_subtask`
Expected: FAIL — `createSubtask` has no 5th `assignee` param / RPC arg mismatch.

- [ ] **Step 3: Implement** — replace `createSubtask` in `src/lib/agent-db.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/projects.test.ts -t create_subtask`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-db.ts tests/integration/projects.test.ts
git commit -m "feat(agent-db): create_subtask cross-agent assignee + lead gate (P4)"
```

---

## Task 7: MCP route — `list_agents` tool + `assignee_agent_id` param

**Files:**
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Update imports** — add `listAgents` and `scopedProjectSubtree` are not needed here (they're reached via the lib); add `listAgents` to the existing import block from `@/lib/agent-db`:

```ts
import {
  resolveAgentByKey,
  touchLastSeen,
  listMyTasks,
  updateTaskStatus,
  submitResult,
  createSubtask,
  listAgents,
  type AgentContext,
} from "@/lib/agent-db";
```

- [ ] **Step 2: Add the `assignee_agent_id` param to `create_subtask`** — in the `server.tool("create_subtask", ...)` schema object add:

```ts
        assignee_agent_id: z
          .string()
          .optional()
          .describe("Assign the subtask to this agent (from list_agents). Defaults to you, the project lead. Must be an active agent in your workspace."),
```

and update its handler call:

```ts
        async ({ parent_task_id, title, description, assignee_agent_id }, extra) => {
          try {
            const ctx = ctxFrom(extra);
            await touchLastSeen(ctx);
            const task = await createSubtask(ctx, parent_task_id, title, description, assignee_agent_id);
            return ok({ task });
          } catch (err) {
            return toolError(err);
          }
        }
```

Also update the `create_subtask` description string to: `"Break a PROJECT you lead into a child task. Defaults to assigning the subtask to you; pass assignee_agent_id to delegate to another agent in your workspace. The subtask starts as 'todo'."`

- [ ] **Step 3: Register the `list_agents` tool** — add after the `create_subtask` tool block:

```ts
    server.tool(
      "list_agents",
      "List the active agents in your workspace (id, name, prefix). Use this to find an agent id to assign a subtask to via create_subtask.",
      {},
      async (_args, extra) => {
        try {
          const ctx = ctxFrom(extra);
          await touchLastSeen(ctx);
          const agents = await listAgents(ctx);
          return ok({ agents });
        } catch (err) {
          return toolError(err);
        }
      }
    );
```

- [ ] **Step 4: Update `SERVER_INSTRUCTIONS`** — replace the `create_subtask` bullet so it reflects projects + delegation:

```
- If you've been assigned a PROJECT, break it into tasks with create_subtask (call list_agents first if you want to delegate a subtask to another agent; otherwise it's assigned to you). Then work each task. You can read your whole project's progress with list_my_tasks(parent_task_id=<project id>), including tasks you delegated.
```

- [ ] **Step 5: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds (the MCP route type-checks against the updated `agent-db` signatures).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat(mcp): list_agents tool + create_subtask assignee param (P4/P5)"
```

---

## Task 8: Manager actions — `createProject` + `createTask(projectId)`

**Files:**
- Modify: `src/lib/manager-actions.ts`

- [ ] **Step 1: Add `createProject`** — append to `src/lib/manager-actions.ts`:

```ts
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
  description?: string
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
      created_by_user_id: session.user.id,
    })
    .select("id, title, status, assigned_agent_id")
    .single();
  if (error) throw new Error(`create project failed: ${error.message}`);

  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: project.id, actor_type: "user", actor_id: session.user.id,
    event_type: "created", to_status: INITIAL_STATUS,
  });
  if (evErr) {
    await supabase.from("tasks").delete().eq("id", project.id);
    throw new Error(`create project event failed: ${evErr.message}`);
  }
  return project as CreatedProject;
}
```

- [ ] **Step 2: Make `createTask` require a project** — change the signature to accept `projectId`, default to Miscellaneous when absent, and set `kind='task'` + `parent_id`. Replace the existing `createTask` body's insert. Add the import at top: `import { getOrCreateMiscProject } from "@/lib/projects";`. New signature + key changes:

```ts
export async function createTask(
  title: string,
  assignedAgentId: string,
  description?: string,
  projectId?: string
): Promise<CreatedTask> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!title.trim()) throw new Error("Task title is required");
  if (!assignedAgentId) throw new Error("An assignee agent is required");

  const supabase = await createServerSupabase();

  const { data: agent } = await supabase
    .from("agents").select("id, revoked_at")
    .eq("id", assignedAgentId).eq("workspace_id", session.workspace.id).maybeSingle();
  if (!agent) throw new Error("Assignee agent not found in your workspace");
  if (agent.revoked_at) throw new Error("Cannot assign work to a revoked agent");

  // Resolve the parent project: explicit, else Miscellaneous (default home, P3).
  let parentId = projectId;
  if (!parentId) {
    const misc = await getOrCreateMiscProject(supabase, session.workspace.id);
    parentId = misc.id;
  } else {
    const { data: proj } = await supabase
      .from("tasks").select("id")
      .eq("id", parentId).eq("workspace_id", session.workspace.id).eq("kind", "project").maybeSingle();
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
      created_by_user_id: session.user.id,
    })
    .select("id, title, status, assigned_agent_id")
    .single();
  if (error) throw new Error(`create task failed: ${error.message}`);

  const { error: evErr } = await supabase.from("task_events").insert({
    task_id: task.id, actor_type: "user", actor_id: session.user.id,
    event_type: "created", to_status: INITIAL_STATUS,
  });
  if (evErr) {
    await supabase.from("tasks").delete().eq("id", task.id);
    throw new Error(`create task event failed: ${evErr.message}`);
  }
  return task as CreatedTask;
}
```

Note: `createChildTask` (human decomposition) stays, but its insert must now also set `kind: "task"`. Read it and add `kind: "task"` to the insert object, and change its parent guard from `parent.parent_id` to checking the parent is `kind='project'`.

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build fails ONLY where `createTask`/`createChildTask` callers need updating (next task) — fix those in Task 9. Type errors limited to `actions.ts`/UI are expected here.

- [ ] **Step 4: Commit**

```bash
git add src/lib/manager-actions.ts
git commit -m "feat(manager): createProject + createTask requires a project (P1/P2/P3)"
```

---

## Task 9: Manager queries + actions wiring

**Files:**
- Modify: `src/lib/manager-queries.ts`, `src/app/actions.ts`, `src/app/board/page.tsx`

- [ ] **Step 1: Add `kind` to `BoardTask` + `listProjects`** — in `src/lib/manager-queries.ts`:

(a) add `kind: "project" | "task";` to the `BoardTask` interface, and add `kind` to `BOARD_COLS`:
```ts
const BOARD_COLS = "id, title, description, status, result, assigned_agent_id, parent_id, kind, updated_at";
```

(b) add a projects list for the selectors:
```ts
export interface ProjectOption {
  id: string;
  title: string;
  assigned_agent_id: string | null;
}

/** Projects in the caller's workspace (Add-Task selector). Miscellaneous first. */
export async function listProjects(): Promise<ProjectOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, assigned_agent_id")
    .eq("kind", "project")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProjectOption[];
  // Pin Miscellaneous to the top so it is the default selection.
  return rows.sort((a, b) => (a.title === "Miscellaneous" ? -1 : b.title === "Miscellaneous" ? 1 : 0));
}
```

- [ ] **Step 2: Update `actions.ts`** — add the project action and thread `projectId` through `createTaskAction`:

```ts
// add to imports from "@/lib/manager-actions":
//   createProject as _createProject, type CreatedProject

export async function createProjectAction(
  _prev: ActionResult<CreatedProject> | null,
  formData: FormData
): Promise<ActionResult<CreatedProject>> {
  try {
    const title = String(formData.get("title") ?? "");
    const leadAgentId = String(formData.get("leadAgentId") ?? "");
    const description = String(formData.get("description") ?? "");
    const project = await _createProject(title, leadAgentId || undefined, description);
    revalidatePath("/board");
    return { ok: true, data: project };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create project" };
  }
}
```

In `createTaskAction`, read the project id and pass it:
```ts
    const projectId = String(formData.get("projectId") ?? "");
    await _createTask(title, assignee, description, projectId || undefined);
```

- [ ] **Step 3: Pass projects into the board** — in `src/app/board/page.tsx`, call `listProjects()` alongside the existing `listBoardTasks`/`listAgents`, and pass `projects` as a prop to `<BoardClient .../>`. Read the file first to match its data-loading shape.

- [ ] **Step 4: Build** — expect remaining type errors only in `BoardClient.tsx` (next task).

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/manager-queries.ts src/app/actions.ts src/app/board/page.tsx
git commit -m "feat(manager): listProjects + createProjectAction + projectId wiring"
```

---

## Task 10: Board UI — split `+ New` dropdown + project selector

**Files:**
- Modify: `src/app/board/BoardClient.tsx`

- [ ] **Step 1: Accept `projects` prop + import the action** — add `createProjectAction` to the imports from `@/app/actions`, add `ProjectOption` to the type import from `@/lib/manager-queries`, and add `projects: ProjectOption[]` to `BoardClient`'s props and signature.

- [ ] **Step 2: Replace the single "New task" button** with a split dropdown. Replace the button at lines ~109-111 with:

```tsx
        <NewMenu
          onProject={() => setShowNewProject(true)}
          onTask={() => setShowNew(true)}
        />
```

and add state near the other `useState` hooks:
```tsx
  const [showNewProject, setShowNewProject] = useState(false);
```

- [ ] **Step 3: Add the `NewMenu` component**

```tsx
function NewMenu({ onProject, onTask }: { onProject: () => void; onTask: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="bg-orange px-3 py-1.5 text-sm font-medium text-paper">
        + New ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 border border-line bg-paper text-sm shadow">
          <button onClick={() => { setOpen(false); onProject(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Project</button>
          <button onClick={() => { setOpen(false); onTask(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Task</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the New Project modal** — after the existing New-task `<Modal>`:

```tsx
      <Modal open={showNewProject} onClose={() => setShowNewProject(false)} title="New project" systemTag="SYS:: NEW PROJECT" blurBackdrop>
        <NewProjectPanel agents={agents} onDone={() => setShowNewProject(false)} />
      </Modal>
```

- [ ] **Step 5: Add `NewProjectPanel`**

```tsx
function NewProjectPanel({ agents, onDone }: { agents: AgentRow[]; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult<unknown> | null, FormData>(createProjectAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={formAction}>
      <div className="grid gap-3">
        <input name="title" required placeholder="Project title" className="border border-line bg-paper px-3 py-2 text-sm" />
        <select name="leadAgentId" defaultValue="" className="border border-line bg-paper px-3 py-2 text-sm">
          <option value="">Unassigned (no lead agent)</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Creating…" : "Create project"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Add the project selector to `NewTaskPanel`** — give it `projects: ProjectOption[]`, pass `projects` from the parent (`<NewTaskPanel agents={agents} projects={projects} .../>`), and add this field as the FIRST field in the grid (defaults to Miscellaneous, which `listProjects` pins first):

```tsx
        <select name="projectId" defaultValue={projects[0]?.id ?? ""} className="border border-line bg-paper px-3 py-2 text-sm">
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
        </select>
```

- [ ] **Step 7: Flip `isProject` to use `kind`** — in `TaskCard`, change `const isProject = childTasks.length > 0;` to `const isProject = task.kind === "project";`. (Keep `doneCount`/`childTasks` usage as-is — an empty project now shows `0/0 done`; that's fine.)

- [ ] **Step 8: Build + lint**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/board/BoardClient.tsx
git commit -m "feat(ui): split New into Project/Task + project selector defaulting to Miscellaneous (§2)"
```

---

## Task 11: Kind-invariant DB tests

**Files:**
- Modify: `tests/integration/projects.test.ts`

- [ ] **Step 1: Write the tests**

```ts
  it("DB rejects a task with no parent, and a project with a parent", async () => {
    const a = admin();
    // task without parent → kind_shape violation.
    const noParent = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "task", assigned_agent_id: lead.agentId,
      title: "orphan", status: "todo", created_by_user_id: lead.userId,
    });
    expect(noParent.error).toBeTruthy();

    // make a valid project, then try a project WITH a parent → violation.
    const { data: proj } = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", assigned_agent_id: lead.agentId,
      title: "P", status: "todo", created_by_user_id: lead.userId,
    }).select("id").single();
    const projWithParent = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", parent_id: proj!.id,
      title: "bad", status: "todo", created_by_user_id: lead.userId,
    });
    expect(projWithParent.error).toBeTruthy();
  });

  it("DB allows an unassigned project but rejects an unassigned task", async () => {
    const a = admin();
    const okProj = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "project", assigned_agent_id: null,
      title: "unassigned proj", status: "todo", created_by_user_id: lead.userId,
    }).select("id").single();
    expect(okProj.error).toBeFalsy();

    const badTask = await a.from("tasks").insert({
      workspace_id: lead.workspaceId, kind: "task", parent_id: okProj.data!.id,
      assigned_agent_id: null, title: "no agent", status: "todo", created_by_user_id: lead.userId,
    });
    expect(badTask.error).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify they pass** (the constraint already exists from Task 1)

Run: `npx vitest run tests/integration/projects.test.ts`
Expected: PASS/SKIP.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/projects.test.ts
git commit -m "test: kind-shape invariants (task needs parent+agent, project is top-level)"
```

---

## Task 12: Decision log + docs consistency

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Add decision entries** — append a new subsection under the appropriate area (near the hierarchical/task decisions) recording **P1–P7** with their rationale and date `2026-06-30`, and an explicit note that they **supersede** hierarchical-tasks `H1` (project now marked by `kind`), `H3`/`H5` (lead agent + cross-agent assignment), and `H4` (agents can list agents + assign across agents). Reference the spec path. Use the existing entry format (ID — decision — why — date). Do NOT delete the H1/H3/H4/H5 reasoning; mark them "Superseded by P*".

- [ ] **Step 2: Update CLAUDE.md "Out of scope"** if needed — `create_subtask` and cross-agent assignment are now in scope; ensure no contradiction remains (the "extra MCP tools" line referred to `get_task`/`add_comment`/`heartbeat`, which stay out — leave those).

- [ ] **Step 3: Commit**

```bash
git add docs/DECISIONS.md CLAUDE.md
git commit -m "docs: log first-class-projects decisions (P1-P7) + supersede H1/H3/H4/H5"
```

---

## Task 13: Full verification sweep

- [ ] **Step 1: Build** — `npm run build` → succeeds.
- [ ] **Step 2: All tests** — `npx vitest run` → all pass or skip (no failures).
- [ ] **Step 3: Manual loop (if DB env present)** — start the app, log in, create a project assigned to an agent, connect that agent over MCP, confirm `list_my_tasks` shows the project, `create_subtask` adds a task (delegate one to a second agent via `list_agents`), and the board shows the project card with its subtasks live. Add a loose task and confirm it lands in Miscellaneous.
- [ ] **Step 4: Final commit** (if any cleanup) and stop.

---

## Self-review notes (author)

- **Spec coverage:** §1 → Task 1; §2 → Tasks 9–10; §3 → Tasks 4,6,7; §3a → Task 5; §4 → no code (SSOT unchanged), asserted by existing drift test; §5 → Tasks 1–3,8; §6 → Tasks 3–6,11. DECISIONS → Task 12.
- **Type consistency:** `TaskRow.kind`, `BoardTask.kind`, `createSubtask(…, assigneeAgentId?)`, RPC arg `p_assignee`, `listAgents → WorkspaceAgent`, `listProjects → ProjectOption` used consistently across tasks.
- **Unassigned-project caveat:** agents cannot decompose an unassigned project (no lead) — by design (spec P4 note); Miscellaneous is decomposed by humans in the UI.
