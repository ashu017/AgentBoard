# Ideas — a third hierarchy level

**Date:** 2026-07-07
**Status:** Design approved, pending spec review
**Decision log:** to be recorded as `D-IDEAS` in `docs/DECISIONS.md` on implementation.

## Problem

The manager runs several independent bodies of work in parallel — e.g. **AgentBoard**,
**bloodonor.com**, and **office work**. Today the model is two levels inside one workspace:

```
workspace → project → task
```

Putting every project from every idea into one flat board makes it hard to manage: unrelated
work is interleaved, and agents from one idea show up while working on another. The manager
wants **focus on one idea at a time** *and* a **cross-idea overview** ("what needs me
anywhere?"), with **agents that mostly belong to a single idea** (a few shared across ideas).

## Constraints (from the current architecture)

- **Single-tenant v1** — one user = one workspace, DB-enforced (`workspaces.owner_user_id`
  is UNIQUE). Ideas must live *inside* the one workspace; they are NOT separate tenants.
- **Human plane uses RLS** (`owner_user_id = auth.uid()`); the agent plane is app-code scoped
  on the service-role connection via `(workspace_id, agent_id)`.
- Tasks tree today: `tasks.kind ∈ {project, task}`, `tasks.parent_id` self-FK. A project is a
  top-level row (`parent_id = null`); tasks hang off projects.

## Decision summary (what we chose, and why)

| Question | Decision | Why |
|---|---|---|
| Add a level at all? | **Yes — add `idea` above project.** | Only way to get isolation *and* a cross-idea overview without breaking single-tenant. |
| Separate boards per idea? | **No.** | The DB enforces one workspace/user; multi-workspace is a large lift and, worse, would make the cross-idea overview impossible (no query spans workspaces). |
| Idea storage | **Dedicated `ideas` table.** | Ideas aren't tasks — they have no status/priority/assignee/result. A real table is cleaner than overloading `kind='idea'` and stuffing a third concept into `tasks`. |
| Agent ↔ idea | **Agents belong to one or more ideas** (`agent_ideas` join). | Matches "mostly separate agents per idea, some shared." A shared agent links to several ideas. |
| Migration of today's data | **One default idea; move all current projects under it.** | Zero data loss; the manager re-files into real ideas later. |
| Scale assumption | **2–6 stable ideas.** | Keeps ideas lightweight (create/rename/archive only) — no idea-level permissions/settings. |

## Architecture

New hierarchy:

```
workspace → idea → project → task
                 ↳ agents (via agent_ideas: an agent belongs to ≥1 idea)
```

### Data model

**New table `ideas`:**
- `id uuid pk`
- `workspace_id uuid not null → workspaces(id) on delete cascade`
- `name text not null`
- `archived_at timestamptz` (null = active; archive rather than hard-delete so history survives)
- `created_at timestamptz not null default now()`
- RLS: same shape as other human-plane tables — visible/editable iff
  `workspace_id ∈ (select id from workspaces where owner_user_id = auth.uid())`.

**`tasks` change:**
- Add `idea_id uuid → ideas(id)` on **project rows** (`kind='project'`). Tasks keep
  `parent_id` → their project; the idea is derived transitively (task → project → idea).
  Rationale: only projects need the direct idea link; tasks inherit it through their parent,
  keeping the write path simple (creating a task doesn't need to know the idea).
- Every project must have an `idea_id` (NOT NULL after backfill). A per-idea `Miscellaneous`
  project remains the default home for loose tasks (one Miscellaneous per idea).

**New join `agent_ideas`:**
- `agent_id uuid → agents(id) on delete cascade`
- `idea_id uuid → ideas(id) on delete cascade`
- `primary key (agent_id, idea_id)`
- RLS: rows whose `idea_id` belongs to a workspace the caller owns.

### Migration (reshape existing data)

1. Create the `ideas` and `agent_ideas` tables + RLS.
2. Add `tasks.idea_id` (nullable initially).
3. For each workspace: create one default idea named **"AgentBoard"** (the manager's current
   body of work), set every existing top-level project's `idea_id` to it.
4. Link every existing agent to that default idea (`agent_ideas`), so nothing disappears.
5. Set `tasks.idea_id` NOT NULL for `kind='project'` (enforced via trigger or app-code, since
   it only applies to project rows — see "Open question" below).

### Views (human plane)

- **Idea switcher** — a compact **dropdown in the header** showing the current idea name, with
  "All ideas" and "+ New idea" entries. Selecting an idea swaps the board below (projects,
  agents list, live feed, awaiting-review badge all scope to it). This is focus mode.
- **All-ideas overview** — the **default landing view on app open**. A card per active idea
  with roll-up counts (in-review / in-progress / done, PRs raised). Click an idea → enter its
  board. This is the cross-idea "what needs me anywhere?" scan.
- Sidebar AGENTS section shows only the current idea's agents (via `agent_ideas`).
- Idea management: create / rename / archive (Figma-styled modal, consistent with the board).

### Customer experience — key user flows

*Principle: an idea is a lens for the manager and is invisible to the agent.*

1. **First run (post-migration):** existing projects are intact, grouped under a default
   "AgentBoard" idea. A one-time hint explains Ideas + prompts creating a second. Never an
   empty/confusing state.
2. **App open → All-ideas overview:** lands on the cross-idea scan; manager picks an idea to
   enter (or spots an awaiting-review count and clicks straight in).
3. **Create an idea:** header dropdown → "+ New idea" → name it → board swaps to the new,
   empty idea; manager adds agents (auto-linked to this idea) + projects here. Other ideas'
   work is not shown.
4. **Focus / switch:** header dropdown → pick another idea → whole board swaps. One click.
5. **Shared agent:** the add/edit-agent form has an idea multi-select; a shared agent appears
   in every selected idea's sidebar, a dedicated one in just its own.
6. **Agent experience (unchanged):** agent connects with its key, calls `list_my_tasks`, gets
   its tasks — already idea-bounded because its tasks only exist under ideas it's linked to.
   The agent never sees or reasons about "ideas." No new agent-facing concept.

### Agent plane (MCP) — impact

**No MCP contract change.** An agent's key still resolves to `(agentId, workspaceId)` and
`list_my_tasks` returns that agent's own tasks. Because an agent's tasks only exist under
ideas it is linked to, its task list is naturally idea-bounded — the idea scoping is a
human-plane concern (which agents/projects the manager *sees* per idea), not an agent-plane
one. `create_subtask` stays within the parent's project→idea. This keeps the agent surface
unchanged, which is the safest outcome.

*(One consequence to note in the decision log: idea membership is a UI/organizational
boundary, not a security boundary — a workspace-scoped agent could in principle be assigned a
task in any idea by the human. That's fine in single-tenant v1; revisit if/when ideas ever
need hard isolation.)*

### Error handling

- Creating a project requires an `idea_id`; a project with no/invalid idea → 400 (mirrors the
  existing "Project not found in your workspace" guard).
- Archiving an idea with active projects: soft-archive hides it from the switcher but keeps
  data; surface a confirm ("N projects will be hidden"). No cascade delete.
- Deleting the last idea is disallowed (there must always be at least one home for projects).

### Testing (must-have)

- **Migration correctness:** existing projects all get the default idea; existing agents all
  linked; no orphaned projects (every `kind='project'` has an `idea_id`).
- **RLS isolation:** ideas / agent_ideas obey the human-plane owner policy (cross-user deny).
- **Idea scoping query:** the board query filtered by `idea_id` returns only that idea's
  projects + their tasks; the overview roll-up counts match per-idea sums.
- **Agent membership:** an agent linked to idea A does not appear in idea B's sidebar; a
  shared agent appears in both.
- **Agent plane unchanged:** `list_my_tasks` still returns the agent's tasks regardless of
  idea (existing agent-db tests keep passing).

## Out of scope (YAGNI)

- Multi-workspace / separate tenants per idea (rejected — see decision summary).
- Idea-level permissions, members, or settings beyond a name.
- Moving a project between ideas via drag-drop (a later nicety; edit-project can set idea_id).
- Agent-plane idea enforcement as a security boundary (idea membership is organizational in v1).

## Open question for the plan phase

- **Enforcing `idea_id NOT NULL` only on `kind='project'`:** Postgres can't easily do a
  partial NOT NULL. Options: (a) a `CHECK (kind <> 'project' OR idea_id IS NOT NULL)`, or
  (b) enforce in app code (`createProject`/`createChildTask`). Lean toward the CHECK — it's a
  real invariant and belongs in the DB. Decide in writing-plans.
