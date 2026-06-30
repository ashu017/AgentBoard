# Design: First-class projects + Miscellaneous + multi-agent decomposition

_Status: APPROVED (brainstorm) · 2026-06-30 · Builds on (and supersedes parts of)
`2026-06-30-hierarchical-tasks-design.md`._

## Problem

The hierarchical-tasks model treats a "project" as an *emergent* label — a
parent-less task that happens to have children (`isProject = childTasks.length > 0`).
That can't express the model the user actually wants:

1. **Every task belongs to a project.** A standalone parent-less task should not
   exist; loose work lives in a default **Miscellaneous** project.
2. **Projects are first-class** — a project can exist with zero tasks, can be
   assigned to a *lead agent*, or can be unassigned (a pure container).
3. **Multi-agent projects** — tasks within one project can be assigned to
   *different* agents, not only the project's lead.
4. **Agent-driven decomposition across agents** — a lead agent assigned a project
   can break it into tasks over MCP and assign each task to *any* agent in the
   workspace, and can monitor the project's full subtree.
5. **Project has its own status**, updated by its lead agent (not derived).

This reverses several hierarchical-tasks decisions (H1, H3, H4, H5); each reversal
is called out below and logged in `docs/DECISIONS.md`.

## Decisions (from brainstorm, 2026-06-30)

| # | Decision | Rationale | Supersedes |
|---|----------|-----------|-----------|
| P1 | **Single recursive `tasks` table, plus a `kind` discriminator** (`'project' \| 'task'`). A project is an explicit row, not inferred from child count. | Keeps one table, one status enum, one board renderer (Approach A); but makes "empty project" distinguishable from "standalone task". | H1 (project was un-marked) |
| P2 | **Every task belongs to a project; projects can be unassigned.** `kind='task' ⟹ parent_id NOT NULL AND assigned_agent_id NOT NULL`. `kind='project' ⟹ parent_id IS NULL`; its `assigned_agent_id` may be NULL (unassigned / Miscellaneous). | Enforces "every task has a home" at the DB; lets Miscellaneous be a real, ownerless catch-all. | — |
| P3 | **One Miscellaneous project per workspace**, seeded at workspace bootstrap, default home for loose tasks. | A first-class default container for work not yet organized into a named project. | — |
| P4 | **Lead agent + cross-agent task assignment.** A project may have a lead agent; that lead can create tasks under it and assign each to *any active agent in the same workspace*. | The user's model: lead decomposes, work distributes across the fleet. | H3 (no lead), H5 (children inherit parent's agent) |
| P5 | **Agents can discover other agents** via a new `list_agents` MCP tool (workspace-scoped). | Required so a lead can name assignee IDs when distributing tasks. | H4 (no agent-registration-by-agents) |
| P6 | **Lead can read its project's full subtree** (incl. tasks assigned to other agents) via `list_my_tasks(parent_task_id=…)`. Enforced by a second *named, confined* accessor — the strict per-agent confinement (D8) is preserved, not relaxed. | Lets the lead monitor/coordinate without opening an unscoped read path. | — |
| P7 | **Project status is its own, agent-updated** value, sharing the one status enum (`task-status.ts`). No rollup engine; the `N/M done` board hint stays informational. | Consistent with "every row is the same kind of status machine"; lead stays in control. | (keeps H6) |

## Architecture

### §1 — Data model (migration `0008`)

```sql
alter table public.tasks
  add column kind text not null default 'task'
    check (kind in ('project','task'));

-- projects are top-level; tasks always have a parent AND an agent.
alter table public.tasks
  add constraint tasks_kind_shape check (
    (kind = 'project' and parent_id is null)
    or
    (kind = 'task' and parent_id is not null and assigned_agent_id is not null)
  );

-- projects may be unassigned (the kind_shape check still forces tasks to have one).
alter table public.tasks
  alter column assigned_agent_id drop not null;
```

- **project**: `kind='project'`, `parent_id IS NULL`, optional `assigned_agent_id` (the lead; NULL = unassigned).
- **task**: `kind='task'`, `parent_id` → a project, `assigned_agent_id NOT NULL`.
- The depth-2 cap is now expressed by P1+P2: a task's parent is a `kind='project'`
  row, and a project has no parent. (A task cannot parent another task.)
- No change to the status enum, the realtime publication, or the human RLS
  policies (children share the workspace; existing `owner_user_id = auth.uid()`
  covers them).

**No existing task data** (confirmed) — the only backfill is creating Miscellaneous.

### §2 — Frontend (manager UI, `BoardClient.tsx`)

- The single **New task** button becomes a **+ New** split dropdown → **Project** / **Task**.
- **Add Project** modal (`SYS:: NEW PROJECT`): title, optional description, and an
  *optional* **lead agent** selector with an explicit "Unassigned" default. Starts `todo`.
- **Add Task** modal (`SYS:: ASSIGN`): existing fields **plus** a **Project**
  selector defaulting to **Miscellaneous** (pinned top, pre-selected). The **Agent**
  ("Assign to…") selector stays **required**. Title + description unchanged.
- **Board rendering**: `isProject` flips from `childTasks.length > 0` →
  `task.kind === 'project'`, so an empty project renders as a project card. The
  `+ subtask` affordance and `N/M done` hint stay. Miscellaneous renders as a
  normal project card.
- **Out of scope** (this change): reassigning a task's project after creation,
  drag-between-projects, renaming Miscellaneous.

### §3 — Agent plane (MCP tools, `route.ts` + `agent-db.ts`)

- **New tool `list_agents()`** — returns the caller's workspace agents
  (`id`, `name`, `prefix`, active flag). Scoped by `workspace_id` from `AgentContext`.
- **`create_subtask` gains optional `assignee_agent_id`.** The parent must be a
  `kind='project'` row the caller **leads** (`assigned_agent_id = ctx.agentId`);
  a project the caller doesn't lead → `404`. Default assignee: the calling
  (lead) agent. If `assignee_agent_id` is supplied, the target must be an active
  agent in the same workspace — else `404` (never `403`, per the error contract).
  Child is `kind='task'`. (Note: an **unassigned** project has no lead, so it can
  only be decomposed by a human in the UI, not over MCP — consistent with P2.)
- **`update_task_status` / `submit_result`** unchanged; they already operate on any
  task assigned to the caller, including a project row (lead updates project status).

The confinement invariant (D8 — no exported unscoped query) is preserved:
`list_agents` scopes by workspace; cross-agent assignment validates the target is
in-workspace before the RPC writes.

### §3a — Read-scope widening (D8 exception, confined)

Add **one** named accessor rather than relaxing `scopedTasks()`:

- **`scopedProjectSubtree(ctx, projectId)`** — returns child rows where
  `parent_id = projectId` AND `projectId` is a `kind='project'` row whose
  `assigned_agent_id = ctx.agentId` (the lead). If the caller doesn't lead that
  project → `404`. An agent still cannot read arbitrary tasks — only the subtree of
  a project it leads.
- `list_my_tasks(parent_task_id=X)` routes to this accessor when `X` is a project
  the caller leads; otherwise the existing "assigned to me" path. Two narrow named
  scoped accessors; the "no unscoped query" rule holds.

### §4 — Status & transitions

No change to `src/lib/task-status.ts`. Projects and tasks share the one status
enum and transition map (SSOT). Project status is `todo → in_progress → done/failed`,
updated by its lead agent. The `N/M done` roll-up is informational only — no engine
derives project status.

### §5 — Migration & data mechanics

One ordered migration `0008_first_class_projects.sql`:
1. Add `kind` + the `tasks_kind_shape` CHECK above.
2. Drop `assigned_agent_id NOT NULL` (CHECK preserves "tasks always have an agent").
3. Seed a Miscellaneous project per existing workspace; add the same seed to
   workspace bootstrap (`getOrCreateWorkspace`) so new workspaces get one.
4. Update the `create_subtask` RPC: optional assignee, validate in-workspace active
   agent, set `kind='task'` on the child, keep the atomic insert + `created` event.
5. Keep the existing Vitest drift guard (DB status CHECK == `STATUSES`); add
   `kind`-invariant tests.

### §6 — Testing (must-haves; security-critical are non-negotiable)

- **Cross-agent assignment**: lead → another in-workspace agent (ok); → agent in
  another workspace → `404` (isolation, not `403`).
- **Lead read scope (§3a)**: lead reads its project subtree incl. other agents'
  tasks (ok); non-lead reading that project → `404`.
- **`kind` invariants**: task without a parent rejected; project with a parent
  rejected; unassigned project allowed; unassigned task rejected.
- **Default project**: Add-Task with no explicit project resolves to Miscellaneous.
- **Status SSOT** drift guard still passes for both levels.

## Out of scope (this change)

Reassigning a task's project after creation · drag-between-projects · renaming or
deleting Miscellaneous · project-level RLS for agents (still app-code scoped, D-RLS-DEFER)
· rollup-derived project status · nesting deeper than project→task.
