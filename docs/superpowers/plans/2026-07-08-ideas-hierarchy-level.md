# Ideas Hierarchy Level — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "idea" grouping level above projects (`workspace → idea → project → task`) so the manager can organize parallel bodies of work (AgentBoard, bloodonor.com, office) with per-idea focus plus a cross-idea overview.

**Architecture:** A dedicated `ideas` table + an `agent_ideas` join, and a new `tasks.idea_id` on project rows only. The board is scoped to a selected idea (chosen via a header dropdown); the app opens on an all-ideas overview. The agent/MCP plane is unchanged — idea scoping is purely human-plane. Single-tenant is preserved (ideas live inside the one workspace).

**Tech Stack:** Next.js App Router (TS), Supabase Postgres + RLS, Vitest (pure-unit only — no live-DB harness in this repo), the Supabase MCP for applying/verifying migrations.

**Source spec:** `docs/superpowers/specs/2026-07-07-ideas-hierarchy-level-design.md`

**Testing reality (read before starting):** This repo's tests are all pure units (`src/lib/*.test.ts`) — there is NO live-DB/integration harness. So: pure decision logic (idea filtering, overview roll-ups, validation) is built **TDD**; DB migrations + RLS + queries + UI are built and verified via **build/lint + the Supabase MCP (`execute_sql`) + a manual board walkthrough**. Do not invent a Vitest DB harness.

**Branch:** `feat/ideas-hierarchy-level` (already created; the spec commit is on it).

**Scope notes (from self-review):**
- `createChildTask` (human-side subtask under a project) inherits the parent project's
  `idea_id` automatically — the child is a `kind='task'` row, so the CHECK doesn't apply and
  no idea arg is needed. No change required there; verify it still compiles in Task 5.
- **Rename/archive idea UI is intentionally minimal in v1:** Task 8 ships the *create* path
  (IdeaModal) + switcher. Rename/archive lib actions + wrappers exist (Tasks 5–6) but are only
  surfaced via a small manage affordance in Task 8 Step 4 (a "manage" pencil next to the active
  idea in the switcher opening the same IdeaModal in rename mode). If time-boxed, rename/archive
  UI can be a fast follow — the actions are ready. Flagged so it isn't silently dropped.

---

## File Structure

**Create:**
- `supabase/migrations/0015_ideas.sql` — ideas + agent_ideas tables, RLS, `tasks.idea_id`, backfill.
- `src/lib/ideas.ts` — idea types + human-plane queries (`listIdeas`, `getOrCreateDefaultIdea`, overview roll-ups) and pure helpers (idea-scoped filtering).
- `src/lib/ideas.test.ts` — pure-unit tests for the scoping/roll-up helpers.
- `src/app/board/_components/IdeaSwitcher.tsx` — header dropdown (current idea, All ideas, + New idea).
- `src/app/board/_components/IdeaOverview.tsx` — all-ideas overview cards.
- `src/app/board/_components/IdeaModal.tsx` — create / rename / archive an idea (figma Modal).

**Modify:**
- `src/lib/manager-queries.ts` — add `idea_id` to `BoardTask`/`BOARD_COLS`; `listBoardTasks` accepts an idea filter; `listAgents`/`listProjects` accept an idea filter.
- `src/lib/manager-actions.ts` — `createProject` requires an idea; new `createIdea`/`renameIdea`/`archiveIdea`; agent create/update take idea links.
- `src/app/actions.ts` — server-action wrappers for the new idea/agent-link actions.
- `src/app/board/page.tsx` — resolve the active idea from `?idea=`, default to overview.
- `src/app/board/BoardClient.tsx` — render overview vs. focused board; wire IdeaSwitcher + IdeaModal; pass idea to children.
- `src/app/board/_components/Header.tsx` — mount the IdeaSwitcher.
- `src/app/board/_components/Sidebar.tsx` — agents list already receives `agents`; no change beyond receiving idea-scoped agents from the parent.
- `src/app/_components/AddAgentFlow.tsx` — add an idea multi-select to the create form.
- `docs/DECISIONS.md` — record `D-IDEAS`.

---

## Task 1: Migration — ideas + agent_ideas tables, tasks.idea_id, backfill

**Files:**
- Create: `supabase/migrations/0015_ideas.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0015_ideas.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Ideas — a third hierarchy level (DECISIONS D-IDEAS). workspace → idea → project
-- → task. Ideas group parallel bodies of work; single-tenant is preserved (ideas
-- live inside the one workspace, they are NOT tenants). Human-plane only — the
-- agent/MCP plane is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ideas ────────────────────────────────────────────────────────────────────
create table public.ideas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  archived_at   timestamptz,               -- null = active
  created_at    timestamptz not null default now()
);
create index ideas_workspace_idx on public.ideas (workspace_id);

-- ── tasks.idea_id (project rows only) ────────────────────────────────────────
-- Only kind='project' rows carry a direct idea link; tasks inherit it via parent.
-- Partial NOT NULL can't be a column constraint, so a CHECK enforces the invariant
-- (D-IDEAS open question resolved: DB CHECK, not app code).
alter table public.tasks
  add column if not exists idea_id uuid references public.ideas (id) on delete restrict;
create index tasks_idea_idx on public.tasks (idea_id);

-- ── agent_ideas join (an agent belongs to ≥1 idea; shared agents span several) ─
create table public.agent_ideas (
  agent_id  uuid not null references public.agents (id) on delete cascade,
  idea_id   uuid not null references public.ideas (id) on delete cascade,
  primary key (agent_id, idea_id)
);
create index agent_ideas_idea_idx on public.agent_ideas (idea_id);

-- ── Backfill: one default idea per workspace, reparent existing projects+agents ─
-- Every workspace that has any tasks or agents gets a default "AgentBoard" idea;
-- all existing top-level projects and all existing agents attach to it. Zero loss.
do $$
declare
  w record;
  new_idea uuid;
begin
  for w in (select id from public.workspaces) loop
    insert into public.ideas (workspace_id, name)
      values (w.id, 'AgentBoard')
      returning id into new_idea;
    update public.tasks
       set idea_id = new_idea
     where workspace_id = w.id and kind = 'project';
    insert into public.agent_ideas (agent_id, idea_id)
      select a.id, new_idea from public.agents a where a.workspace_id = w.id
      on conflict do nothing;
  end loop;
end $$;

-- Now enforce the invariant: every project row must have an idea.
alter table public.tasks
  add constraint tasks_project_has_idea
  check (kind <> 'project' or idea_id is not null);

-- ── RLS (human plane) ────────────────────────────────────────────────────────
alter table public.ideas       enable row level security;
alter table public.agent_ideas enable row level security;

create policy ideas_owner_all on public.ideas
  for all to authenticated
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())))
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy agent_ideas_owner_all on public.agent_ideas
  for all to authenticated
  using (idea_id in (
    select i.id from public.ideas i
    join public.workspaces w on w.id = i.workspace_id
    where w.owner_user_id = (select auth.uid())))
  with check (idea_id in (
    select i.id from public.ideas i
    join public.workspaces w on w.id = i.workspace_id
    where w.owner_user_id = (select auth.uid())));
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with name `ideas` and the SQL body above (the DDL + backfill + RLS). Applying via MCP runs it against the live project.

- [ ] **Step 3: Verify the backfill with execute_sql**

Run via `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from public.ideas) as ideas,
  (select count(*) from public.tasks where kind='project' and idea_id is null) as orphan_projects,
  (select count(*) from public.agents a
     where not exists (select 1 from public.agent_ideas ai where ai.agent_id = a.id)) as unlinked_agents;
```

Expected: `orphan_projects = 0`, `unlinked_agents = 0`, `ideas ≥ 1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_ideas.sql
git commit -m "feat(db): ideas + agent_ideas tables, tasks.idea_id, backfill (0015)"
```

---

## Task 2: Idea types + pure scoping/roll-up helpers (TDD)

**Files:**
- Create: `src/lib/ideas.ts`
- Test: `src/lib/ideas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ideas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rollUpByIdea, type IdeaRollupInput } from "./ideas";

describe("ideas: rollUpByIdea", () => {
  const ideas = [
    { id: "i1", name: "AgentBoard" },
    { id: "i2", name: "bloodonor.com" },
  ];
  // project → idea map, and that project's child task statuses / pr flags
  const projects = [
    { id: "p1", idea_id: "i1" },
    { id: "p2", idea_id: "i2" },
  ];
  const tasks = [
    { parent_id: "p1", status: "in_review", pr_url: "http://x" },
    { parent_id: "p1", status: "in_progress", pr_url: null },
    { parent_id: "p1", status: "done", pr_url: null },
    { parent_id: "p2", status: "in_progress", pr_url: null },
  ];
  const input: IdeaRollupInput = { ideas, projects, tasks };

  it("aggregates per-idea counts from its projects' tasks", () => {
    const rows = rollUpByIdea(input);
    const ab = rows.find((r) => r.id === "i1")!;
    expect(ab).toMatchObject({ name: "AgentBoard", inReview: 1, inProgress: 1, done: 1, prsRaised: 1 });
    const bd = rows.find((r) => r.id === "i2")!;
    expect(bd).toMatchObject({ inReview: 0, inProgress: 1, done: 0, prsRaised: 0 });
  });

  it("returns a row for an idea with no projects (all zeros)", () => {
    const rows = rollUpByIdea({ ideas: [...ideas, { id: "i3", name: "office" }], projects, tasks });
    expect(rows.find((r) => r.id === "i3")).toMatchObject({ inReview: 0, inProgress: 0, done: 0, prsRaised: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ideas.test.ts`
Expected: FAIL — `rollUpByIdea` / `IdeaRollupInput` not exported (module missing).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/ideas.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Idea {
  id: string;
  name: string;
  archived_at: string | null;
}

// ── Pure roll-up (all-ideas overview counts). Kept pure so it's unit-tested and
// reused by the overview view. ───────────────────────────────────────────────
export interface IdeaRollupInput {
  ideas: { id: string; name: string }[];
  projects: { id: string; idea_id: string | null }[];
  tasks: { parent_id: string | null; status: string; pr_url: string | null }[];
}
export interface IdeaRollup {
  id: string;
  name: string;
  inReview: number;
  inProgress: number;
  done: number;
  prsRaised: number;
}

export function rollUpByIdea(input: IdeaRollupInput): IdeaRollup[] {
  const projectIdea = new Map(input.projects.map((p) => [p.id, p.idea_id]));
  const base = new Map<string, IdeaRollup>(
    input.ideas.map((i) => [i.id, { id: i.id, name: i.name, inReview: 0, inProgress: 0, done: 0, prsRaised: 0 }])
  );
  for (const t of input.tasks) {
    const ideaId = t.parent_id ? projectIdea.get(t.parent_id) : null;
    if (!ideaId) continue;
    const row = base.get(ideaId);
    if (!row) continue;
    if (t.status === "in_review") row.inReview++;
    else if (t.status === "in_progress") row.inProgress++;
    else if (t.status === "done") row.done++;
    if (t.pr_url) row.prsRaised++;
  }
  return input.ideas.map((i) => base.get(i.id)!);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ideas.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ideas.ts src/lib/ideas.test.ts
git commit -m "feat(ideas): idea types + pure per-idea roll-up helper (TDD)"
```

---

## Task 3: Idea queries — listIdeas + getOrCreateDefaultIdea

**Files:**
- Modify: `src/lib/ideas.ts` (append)

- [ ] **Step 1: Append the queries**

Add to `src/lib/ideas.ts`:

```ts
/** Active (non-archived) ideas in the caller's workspace, oldest first. */
export async function listIdeas(): Promise<Idea[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ideas")
    .select("id, name, archived_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Idea[];
}

/**
 * The workspace's default idea (first active one), creating an "AgentBoard" idea
 * if none exists. Used as the fallback home when no idea is selected. Runs under
 * the user's RLS session, so it only ever touches the caller's workspace.
 */
export async function getOrCreateDefaultIdea(workspaceId: string): Promise<Idea> {
  const supabase = await createServerSupabase();
  const existing = await supabase
    .from("ideas")
    .select("id, name, archived_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as Idea;

  const created = await supabase
    .from("ideas")
    .insert({ workspace_id: workspaceId, name: "AgentBoard" })
    .select("id, name, archived_at")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data as Idea;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ideas.ts
git commit -m "feat(ideas): listIdeas + getOrCreateDefaultIdea queries"
```

---

## Task 4: Scope the board queries to an idea

**Files:**
- Modify: `src/lib/manager-queries.ts`

- [ ] **Step 1: Add `idea_id` to BoardTask + BOARD_COLS**

In `src/lib/manager-queries.ts`, add to the `BoardTask` interface (after `pr_url`):

```ts
  /** The idea this project belongs to (project rows only; null on task rows). */
  idea_id: string | null;
```

And update `BOARD_COLS` to include it:

```ts
const BOARD_COLS = "id, title, description, status, priority, pr_url, idea_id, result, assigned_agent_id, parent_id, kind, review_reason, review_options, review_verdict, review_selected_option, review_note, updated_at";
```

- [ ] **Step 2: Filter `listBoardTasks` lanes by idea**

In `listBoardTasks`, the top-level (lanes) query currently filters by `parent_id is null` + window + optional project id. Add an idea filter. Change the `BoardFilters` usage: add an `idea` field to the query. Modify the lanes query block:

```ts
  // 1) Lanes: top-level PROJECTS under this idea (+ window / project-id filter).
  let top = supabase
    .from("tasks")
    .select(BOARD_COLS)
    .is("parent_id", null)
    .eq("kind", "project")
    .order("updated_at", { ascending: false })
    .limit(BOARD_TASK_LIMIT + 1);

  if (ideaId) top = top.eq("idea_id", ideaId);
  if (filters.project !== "all") top = top.eq("id", filters.project);
```

Update the function signature to accept the idea id:

```ts
export async function listBoardTasks(
  filters: BoardFilters = DEFAULT_FILTERS,
  ideaId?: string
): Promise<{ tasks: BoardTask[]; capped: boolean }> {
```

(The children query is unchanged — it already fetches children of the visible lanes.)

- [ ] **Step 3: Filter `listAgents` by idea (via agent_ideas)**

Change `listAgents` to accept an optional idea id and inner-join `agent_ideas` when given:

```ts
export async function listAgents(ideaId?: string): Promise<AgentRow[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("agents")
    .select("id, name, description, api_key_prefix, revoked_at, last_seen_at, created_at, tasks(count), agent_ideas!inner(idea_id)")
    .order("created_at", { ascending: true });
  if (ideaId) query = query.eq("agent_ideas.idea_id", ideaId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => {
    const { tasks, agent_ideas: _ai, ...rest } = a as typeof a & { tasks?: { count: number }[]; agent_ideas?: unknown };
    return { ...rest, task_count: tasks?.[0]?.count ?? 0 } as AgentRow;
  });
}
```

Note: `!inner` requires each returned agent to have at least one `agent_ideas` row; after the Task 1 backfill every agent has one, so no agent silently disappears.

- [ ] **Step 4: Scope `listProjects` (Add-Task selector) to the idea**

```ts
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
  return rows.sort((a, b) => (a.title === "Miscellaneous" ? -1 : b.title === "Miscellaneous" ? 1 : 0));
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/manager-queries.ts
git commit -m "feat(ideas): scope board/agents/projects queries by idea_id"
```

---

## Task 5: Manager actions — createProject requires idea; idea CRUD

**Files:**
- Modify: `src/lib/manager-actions.ts`

- [ ] **Step 1: Make `createProject` take + require an idea**

`createProject` currently takes `(title, leadAgentId?, description?, priority?)`. Add `ideaId` as the first-class scoping arg (required) and set it on the insert. Update the signature:

```ts
export async function createProject(
  title: string,
  ideaId: string,
  leadAgentId?: string,
  description?: string,
  priority: "high" | "medium" | "low" = "medium"
): Promise<CreatedProject> {
```

After the session/title guards, validate the idea belongs to the workspace:

```ts
  if (!ideaId) throw new Error("An idea is required");
  const { data: idea } = await supabase
    .from("ideas")
    .select("id")
    .eq("id", ideaId)
    .eq("workspace_id", session.workspace.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!idea) throw new Error("Idea not found in your workspace");
```

And add `idea_id: ideaId` to the `.insert({...})` object for the project row.

- [ ] **Step 2: Set idea_id on the Miscellaneous project when created under an idea**

In `createTask`, the fallback to `getOrCreateMiscProject` creates a Misc project with no idea — which now violates the CHECK. Fix `getOrCreateMiscProject` calls to be idea-scoped: change `src/lib/projects.ts` `getOrCreateMiscProject(supabase, workspaceId)` to `getOrCreateMiscProject(supabase, workspaceId, ideaId)`, add `.eq("idea_id", ideaId)` to the lookup and `idea_id: ideaId` to the insert, and make the lookup key `(workspace_id, idea_id, title='Miscellaneous')`. Then update `createTask` to pass the parent project's idea (look it up from the chosen `projectId`, or the active idea) before resolving Misc.

Concretely, in `createTask` replace the Misc resolution block:

```ts
  // Resolve the parent project. If an explicit projectId is given, use it (and
  // inherit its idea). Otherwise fall back to the active idea's Miscellaneous.
  let parentId = projectId;
  if (parentId) {
    const { data: proj } = await supabase
      .from("tasks").select("id, idea_id").eq("id", parentId)
      .eq("workspace_id", session.workspace.id).eq("kind", "project").maybeSingle();
    if (!proj) throw new Error("Project not found in your workspace");
  } else {
    if (!ideaId) throw new Error("An idea is required to create a loose task");
    const misc = await getOrCreateMiscProject(supabase, session.workspace.id, ideaId);
    parentId = misc.id;
  }
```

Add `ideaId` as a param to `createTask` (after `projectId`).

- [ ] **Step 3: Add idea CRUD actions**

Append to `src/lib/manager-actions.ts`:

```ts
/** Create an idea in the caller's workspace. */
export async function createIdea(name: string): Promise<{ id: string; name: string }> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!name.trim()) throw new Error("Idea name is required");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ideas")
    .insert({ workspace_id: session.workspace.id, name: name.trim() })
    .select("id, name")
    .single();
  if (error) throw new Error(`create idea failed: ${error.message}`);
  return data;
}

/** Rename an idea (RLS-scoped to the caller's workspace). */
export async function renameIdea(ideaId: string, name: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  if (!name.trim()) throw new Error("Idea name is required");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ideas").update({ name: name.trim() })
    .eq("id", ideaId).eq("workspace_id", session.workspace.id)
    .select("id").maybeSingle();
  if (error) throw new Error(`rename idea failed: ${error.message}`);
  if (!data) throw new Error("Idea not found in your workspace");
}

/**
 * Archive an idea (soft — hides from the switcher, keeps data). Refuses if it's
 * the last active idea (there must always be a home for projects).
 */
export async function archiveIdea(ideaId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("unauthenticated");
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("ideas").select("id", { count: "exact", head: true })
    .eq("workspace_id", session.workspace.id).is("archived_at", null);
  if ((count ?? 0) <= 1) throw new Error("Can't archive your only idea");
  const { data, error } = await supabase
    .from("ideas").update({ archived_at: new Date().toISOString() })
    .eq("id", ideaId).eq("workspace_id", session.workspace.id)
    .select("id").maybeSingle();
  if (error) throw new Error(`archive idea failed: ${error.message}`);
  if (!data) throw new Error("Idea not found in your workspace");
}
```

- [ ] **Step 4: Link agents to ideas on create**

Change `createAgent(name, description?)` → `createAgent(name, description?, ideaIds?: string[])`. After the agent insert succeeds, insert `agent_ideas` rows:

```ts
  if (ideaIds && ideaIds.length > 0) {
    const rows = ideaIds.map((idea_id) => ({ agent_id: data.id, idea_id }));
    const { error: linkErr } = await supabase.from("agent_ideas").insert(rows);
    if (linkErr) throw new Error(`link agent to ideas failed: ${linkErr.message}`);
  }
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors ONLY at call sites in `actions.ts` (fixed in Task 6) — the lib file itself should type-check. If `manager-queries` or `projects` signatures mismatch, fix them here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/manager-actions.ts src/lib/projects.ts
git commit -m "feat(ideas): createProject requires idea; idea CRUD; misc+agent idea links"
```

---

## Task 6: Server-action wrappers

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Import the new lib functions**

Add to the import block from `@/lib/manager-actions`:

```ts
  createIdea as _createIdea,
  renameIdea as _renameIdea,
  archiveIdea as _archiveIdea,
```

- [ ] **Step 2: Thread `idea` through createProject / createTask actions**

In `createProjectAction`, read the idea and pass it (idea is required):

```ts
    const ideaId = String(formData.get("ideaId") ?? "");
    const project = await _createProject(title, ideaId, leadAgentId || undefined, description, priority);
```

In `createTaskAction`, read + pass the idea:

```ts
    const ideaId = String(formData.get("ideaId") ?? "");
    await _createTask(title, assignee, description, projectId || undefined, priority, ideaId || undefined);
```

In `createAgentAction`, read the idea multi-select (`getAll`) and pass it:

```ts
    const ideaIds = formData.getAll("ideaIds").map(String).filter(Boolean);
    const agent = await _createAgent(name, description, ideaIds);
```

- [ ] **Step 3: Add idea action wrappers**

```ts
export async function createIdeaAction(
  _prev: ActionResult<{ id: string; name: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const idea = await _createIdea(String(formData.get("name") ?? ""));
    revalidatePath("/board");
    return { ok: true, data: idea };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create idea" };
  }
}

export async function renameIdeaAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await _renameIdea(String(formData.get("ideaId") ?? ""), String(formData.get("name") ?? ""));
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to rename idea" };
  }
}

export async function archiveIdeaAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await _archiveIdea(String(formData.get("ideaId") ?? ""));
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to archive idea" };
  }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(ideas): server-action wrappers (create/rename/archive idea; thread idea into create)"
```

---

## Task 7: Board page — resolve active idea, default to overview

**Files:**
- Modify: `src/app/board/page.tsx`

- [ ] **Step 1: Resolve idea from ?idea= and load idea-scoped data**

Rewrite `src/app/board/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents, listProjects, parseFilters } from "@/lib/manager-queries";
import { listIdeas, getOrCreateDefaultIdea, rollUpByIdea } from "@/lib/ideas";
import { BoardClient } from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; status?: string; project?: string; idea?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;

  const ideas = await listIdeas();
  // Ensure at least one idea exists (belt-and-braces if a workspace predates 0015).
  if (ideas.length === 0) {
    await getOrCreateDefaultIdea(session.workspace.id);
  }
  const activeIdea = sp.idea && ideas.some((i) => i.id === sp.idea) ? sp.idea : null;

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  if (!activeIdea) {
    // All-ideas overview: pull every project + task to roll up per-idea counts.
    const { tasks } = await listBoardTasks({ ...parseFilters(sp), status: "all" as const });
    const projects = tasks.filter((t) => t.kind === "project").map((p) => ({ id: p.id, idea_id: p.idea_id }));
    const overview = rollUpByIdea({ ideas, projects, tasks });
    return (
      <BoardClient
        mode="overview"
        ideas={ideas}
        overview={overview}
        activeIdeaId={null}
        initialTasks={[]}
        agents={[]}
        projects={[]}
        capped={false}
        mcpEndpoint={mcpEndpoint}
        workspaceName={session.workspace.name}
        filters={parseFilters(sp)}
      />
    );
  }

  const filters = { ...parseFilters(sp), status: "all" as const };
  const [{ tasks, capped }, agents, projects] = await Promise.all([
    listBoardTasks(filters, activeIdea),
    listAgents(activeIdea),
    listProjects(activeIdea),
  ]);
  return (
    <BoardClient
      mode="board"
      ideas={ideas}
      overview={[]}
      activeIdeaId={activeIdea}
      initialTasks={tasks}
      agents={agents}
      projects={projects}
      capped={capped}
      mcpEndpoint={mcpEndpoint}
      workspaceName={session.workspace.name}
      filters={filters}
    />
  );
}
```

- [ ] **Step 2: Verify (will fail until BoardClient props updated in Task 8)**

Run: `npx tsc --noEmit`
Expected: errors at `<BoardClient .../>` (new props). These are fixed in Task 8 — proceed.

- [ ] **Step 3: Commit**

```bash
git add src/app/board/page.tsx
git commit -m "feat(ideas): board page resolves active idea; overview vs board mode"
```

---

## Task 8: BoardClient — overview vs focused board, switcher, idea modal

**Files:**
- Modify: `src/app/board/BoardClient.tsx`
- Create: `src/app/board/_components/IdeaSwitcher.tsx`
- Create: `src/app/board/_components/IdeaOverview.tsx`
- Create: `src/app/board/_components/IdeaModal.tsx`

- [ ] **Step 1: Create IdeaSwitcher (header dropdown)**

Create `src/app/board/_components/IdeaSwitcher.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, LayoutGrid } from "lucide-react";
import type { Idea } from "@/lib/ideas";
import { RULE } from "./board-ui";

export function IdeaSwitcher({
  ideas,
  activeIdeaId,
  onNewIdea,
}: {
  ideas: Idea[];
  activeIdeaId: string | null;
  onNewIdea: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const active = ideas.find((i) => i.id === activeIdeaId);
  const label = active ? active.name : "All ideas";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mono flex items-center gap-1.5 border px-3 py-1.5 text-sm uppercase tracking-wide text-ink hover:text-orange"
        style={{ borderColor: RULE }}
      >
        {label} <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="clip-corner absolute left-0 z-30 mt-1 w-56 border border-line bg-paper text-sm shadow-xl">
          <button role="menuitem" onClick={() => { setOpen(false); router.push("/board"); }}
            className="mono flex w-full items-center gap-2 px-3 py-2 text-left uppercase tracking-wide hover:bg-paper-2">
            <LayoutGrid size={13} /> All ideas
          </button>
          <div className="border-t" style={{ borderColor: RULE }} />
          {ideas.map((i) => (
            <button key={i.id} role="menuitem" onClick={() => { setOpen(false); router.push(`/board?idea=${i.id}`); }}
              className={`block w-full px-3 py-2 text-left hover:bg-paper-2 ${i.id === activeIdeaId ? "text-orange" : ""}`}>
              {i.name}
            </button>
          ))}
          <div className="border-t" style={{ borderColor: RULE }} />
          <button role="menuitem" onClick={() => { setOpen(false); onNewIdea(); }}
            className="mono flex w-full items-center gap-2 px-3 py-2 text-left uppercase tracking-wide text-orange hover:bg-paper-2">
            <Plus size={13} /> New idea
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create IdeaOverview (all-ideas cards)**

Create `src/app/board/_components/IdeaOverview.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import type { IdeaRollup } from "@/lib/ideas";
import { RULE } from "./board-ui";

export function IdeaOverview({ rows }: { rows: IdeaRollup[] }) {
  const router = useRouter();
  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::ALL IDEAS</p>
      <h1 className="display mb-6 text-xl uppercase tracking-wide">What needs you</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(`/board?idea=${r.id}`)}
            className="clip-corner border bg-paper p-4 text-left hover:border-orange"
            style={{ borderColor: RULE }}
          >
            <div className="display text-base uppercase tracking-wide">{r.name}</div>
            <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span style={{ color: r.inReview > 0 ? "#7c3aed" : "var(--ink-soft)" }}>{r.inReview} in review</span>
              <span className="text-ink-soft">{r.inProgress} in progress</span>
              <span className="text-ink-soft">{r.done} done</span>
              <span className="text-ink-soft">{r.prsRaised} PRs</span>
            </div>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="mono text-sm text-ink-soft">No ideas yet.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create IdeaModal (create/rename)**

Create `src/app/board/_components/IdeaModal.tsx`:

```tsx
"use client";
import { useActionState, useEffect } from "react";
import { createIdeaAction, type ActionResult } from "@/app/actions";
import { Modal } from "@/app/_components/Modal";

export function IdeaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string; name: string }> | null, FormData>(createIdeaAction, null);
  useEffect(() => { if (state?.ok) onClose(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="New idea" systemTag="SYS:: NEW IDEA" variant="figma">
      <form action={formAction}>
        <input name="name" required placeholder="Idea name (e.g. bloodonor.com)" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
            {pending ? "Creating…" : "Create idea"}
          </button>
          <button type="button" onClick={onClose} className="border border-line px-4 py-2 text-sm">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Update BoardClient props + render overview vs board**

In `src/app/board/BoardClient.tsx`, extend the props to add `mode`, `ideas`, `overview`, `activeIdeaId`, and import the new components:

```tsx
import { IdeaSwitcher } from "./_components/IdeaSwitcher";
import { IdeaOverview } from "./_components/IdeaOverview";
import { IdeaModal } from "./_components/IdeaModal";
import type { Idea, IdeaRollup } from "@/lib/ideas";
```

Add to the props type + destructure:

```tsx
  mode,
  ideas,
  overview,
  activeIdeaId,
```
```tsx
  mode: "overview" | "board";
  ideas: Idea[];
  overview: IdeaRollup[];
  activeIdeaId: string | null;
```

Add idea-modal state near the other modal state:

```tsx
  const [showNewIdea, setShowNewIdea] = useState(false);
```

Render: when `mode === "overview"`, show Header (with switcher) + `<IdeaOverview rows={overview} />` and nothing else; otherwise the existing focused board. Wrap the existing body so the Header always renders with the switcher, and swap the main region. Add the `<IdeaModal open={showNewIdea} onClose={() => setShowNewIdea(false)} />` alongside the other modals.

- [ ] **Step 5: Mount the switcher in the Header**

In `src/app/board/_components/Header.tsx`, add props `ideas`, `activeIdeaId`, `onNewIdea` and render `<IdeaSwitcher ideas={ideas} activeIdeaId={activeIdeaId} onNewIdea={onNewIdea} />` right after the wordmark. Pass these from BoardClient's `<Header .../>`.

- [ ] **Step 6: Pass the active idea into the create-task/project forms**

In BoardClient, the New Task and New Project panels must submit `ideaId`. Add a hidden input `<input type="hidden" name="ideaId" value={activeIdeaId ?? ""} />` inside `NewTaskPanel` and `NewProjectPanel` forms (both only render in board mode, where `activeIdeaId` is set).

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: exit 0; `/board` builds.

- [ ] **Step 8: Commit**

```bash
git add src/app/board/BoardClient.tsx src/app/board/_components/IdeaSwitcher.tsx src/app/board/_components/IdeaOverview.tsx src/app/board/_components/IdeaModal.tsx src/app/board/_components/Header.tsx
git commit -m "feat(ideas): overview view, header idea switcher, new-idea modal"
```

---

## Task 9: Agent create form — idea multi-select

**Files:**
- Modify: `src/app/_components/AddAgentFlow.tsx`
- Modify: `src/app/board/BoardClient.tsx` (pass ideas to AddAgentFlow)

- [ ] **Step 1: Pass ideas + active idea into AddAgentFlow**

`AddAgentFlow` is rendered in BoardClient as `<AddAgentFlow mcpEndpoint=... onClose=... />`. Add an `ideas: Idea[]` prop and `defaultIdeaId?: string`, passing `ideas={ideas}` and `defaultIdeaId={activeIdeaId ?? undefined}` from BoardClient.

- [ ] **Step 2: Add the multi-select to the create-agent form (step 1)**

In `AddAgentFlow.tsx` step-1 form (the `name`/`description` inputs), add a checkbox list of ideas with `name="ideaIds"`, pre-checking `defaultIdeaId`:

```tsx
<fieldset className="mt-1">
  <legend className="mono text-[11px] uppercase tracking-widest text-ink-soft">Ideas this agent works on</legend>
  <div className="mt-1 flex flex-col gap-1">
    {ideas.map((i) => (
      <label key={i.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ideaIds" value={i.id} defaultChecked={i.id === defaultIdeaId} />
        {i.name}
      </label>
    ))}
  </div>
</fieldset>
```

(`createAgentAction` already reads `formData.getAll("ideaIds")` from Task 6.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/AddAgentFlow.tsx src/app/board/BoardClient.tsx
git commit -m "feat(ideas): agent create form gains an idea multi-select"
```

---

## Task 10: Full verification + DECISIONS + manual walkthrough

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Full gate sweep**

Run: `npx tsc --noEmit && npm run lint && npm run build && npx vitest run`
Expected: all clean; the pre-existing suite + the new `ideas.test.ts` pass.

- [ ] **Step 2: Manual board walkthrough (dev-login)**

Start: `DEV_LOGIN=1 npx next dev -H 127.0.0.1 -p 3100`. Verify, in the browser:
1. `/board` opens on the **All ideas overview** (a card per idea with counts).
2. The header **idea dropdown** switches into an idea; the board shows only that idea's projects + agents.
3. **+ New idea** creates an idea; the board switches to it (empty).
4. Creating a **project** while focused in idea X attaches it to X (visible only there).
5. Adding an **agent** with idea X checked shows it in X's sidebar and not in another idea.

- [ ] **Step 3: Record D-IDEAS in DECISIONS**

Append a `### D-IDEAS — Ideas: a third hierarchy level` entry to `docs/DECISIONS.md` summarizing: the workspace→idea→project→task model, dedicated `ideas` table + `agent_ideas` join + `tasks.idea_id` (project rows, DB CHECK), overview-on-open + header switcher, agent plane unchanged (idea = organizational not security boundary), migration = one default "AgentBoard" idea. Reference the spec + this plan.

- [ ] **Step 4: Commit + push**

```bash
git add docs/DECISIONS.md
git commit -m "docs(decisions): record D-IDEAS (ideas hierarchy level)"
git push -u origin feat/ideas-hierarchy-level
```

- [ ] **Step 5: Open the PR**

Open `https://github.com/ashu017/AgentBoard/pull/new/feat/ideas-hierarchy-level` with a summary of the model, migration, and the overview/switcher UX. Note that migration 0015 is applied live.
```
