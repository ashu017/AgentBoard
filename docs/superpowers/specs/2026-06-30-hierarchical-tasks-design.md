# Design: Hierarchical tasks (project → task) + agent-driven decomposition + board filters

_Status: APPROVED (brainstorm) · 2026-06-30 · BUILT 2026-06-30, then **partly superseded
2026-07-01** by `2026-06-30-first-class-projects-design.md` (P1–P7). H1→P1, H3→P4, H4→P5,
H5→P4; H2's depth-2 *mechanism* → structural kind model (409→404); H6/H7/H8 still hold. See
`docs/DECISIONS.md` → FIRST-CLASS PROJECTS (P1–P7)._

## Problem

Today AgentBoard is flat: a human creates a `task`, assigns it to one agent, the
agent drives it through statuses over MCP. Real work is often a **broad goal**
that should be broken into smaller pieces. We want:

1. A **two-level hierarchy** — a top-level item (a "project" / broad goal) that
   contains child tasks — without a separate, parallel data model.
2. **Agent-driven decomposition** — the agent assigned a project can break it
   into child tasks and work them (directly or by fanning out its own internal
   subagents), with the human watching live and intervening if it stalls.
3. **Humans can also decompose** — a manager can add child tasks to their own
   project, not only agents.
4. **Board filters** — by default the board shows only recently-active work; a
   manager can widen the timeline or show everything.

Recurring tasks are explicitly a **later phase** (see Deferred).

## Decisions (from brainstorm, 2026-06-30)

| # | Decision | Rationale |
|---|----------|-----------|
| H1 | **Single recursive `tasks` table** with nullable `parent_id`. A "project" is just a parent-less task that has children. No separate `projects` table. | Least schema surface; one status enum, one MCP surface, one board renderer. Lifting depth later needs no migration. |
| H2 | **Depth capped at 2 for v1** (parent must be parent-less), enforced in one validator. Recursion-ready. | Protects the 3-second-scan board (1A-UI) and kills the runaway-depth failure mode while we learn how agents actually decompose. |
| H3 | **No privileged "lead agent".** A human assigns a project/task to one agent; every agent has identical capability to decompose. | Uniform model; matches "it depends on the engineer." |
| H4 | **Subagents are internal to the agent's runtime** — AgentBoard does NOT track them. The agent only records child *tasks* for structure/visibility, under its own identity. | Keeps AgentBoard a control plane over *tasks*, not an orchestrator of agent runtimes. Small MCP surface: no agent→agent assignment, no agent-registration-by-agents. D11 holds. |
| H5 | **Both humans and agents create child tasks.** Children inherit the parent's `workspace_id` and `assigned_agent_id`. | Two decomposition entry points; children belong to the same agent (subagents do real fan-out internally). |
| H6 | **Agent owns parent status explicitly.** No rollup engine. Children are informational; the board shows a `N/M done` hint on the parent. | Consistent with "every task is the same kind of row"; agent stays in control. No new status rules. |
| H7 | **Board filters: timeline + status, applied to top-level items.** A visible parent always brings its children. | Live-monitor board shouldn't drown in closed/stale projects. |
| H8 | **Defaults: timeline = last 2 weeks (on `updated_at`), status = Active (non-terminal).** | Recently-touched work stays visible; stale ages out. |

## Architecture

### Data model (one migration)

Add to `public.tasks`:

```sql
alter table public.tasks
  add column parent_id uuid references public.tasks(id) on delete cascade;

create index tasks_workspace_parent_idx on public.tasks (workspace_id, parent_id);
```

- **project**: `parent_id IS NULL` and has ≥1 child.
- **standalone task**: `parent_id IS NULL`, no children.
- **child task**: `parent_id` set (its parent must be parent-less — the depth-2 cap).
- `on delete cascade`: deleting a parent removes its children (a project *is* its work).
- No change to the status enum, RLS policies (children are in the same workspace,
  so the existing `owner_user_id = auth.uid()` policy already covers them), or
  the realtime publication.

### Depth-2 cap (one place)

A child's parent must satisfy `parent_id IS NULL`. Enforced in the create-child
path (both the agent RPC and the human server action call the same check):
attempting to add a child to an already-child task → `409` (illegal, like an
out-of-terminal transition). Lifting the cap later = relax this one predicate.

### MCP surface (one new tool + one filter)

- **`create_subtask(parent_task_id, title, description?)`** — creates a child task
  on a task the calling agent owns. Goes through the confined `agent-db` scoped
  wrapper (D8) and `appendTaskEvent` (a `created` event, actor_type `agent`).
  Validations: parent is the caller's task (else `404`, never `403`); parent is
  depth-0 (else `409`); `title` required (else `400`). Child inherits the
  parent's `workspace_id` + `assigned_agent_id`.
- **`list_my_tasks(status?, parent_id?)`** — gains an optional `parent_id` so an
  agent can read its own subtree (children of a given parent). Existing scoping
  unchanged.

No agent→agent assignment tool. No agent-registration tool. (H4.)

### Human decomposition (server action)

`createChildTask(parentTaskId, title, description?)` in `manager-actions.ts`,
under the user's RLS session. Same depth-2 check; writes the task + `created`
event (actor_type `user`) in the existing transactional pattern. Child inherits
parent's `workspace_id` + `assigned_agent_id`.

### Board / UX

- **Rendering:** projects render as a group with their child tasks nested **one
  level** beneath, within the existing 5-status columns (no separate tree view).
  Parent card shows a `N/M done` progress hint. Standalone tasks render as today.
  Failed-loud / Done-quiet hierarchy unchanged.
- **Filters (URL search params, server-queried — the source of truth):**
  - `window`: `2w` (default) · `30d` · `90d` · `all`. Filters **top-level**
    items by `updated_at >= now() - window` (no bound for `all`).
  - `status`: `active` (default; `status in (todo,in_progress,in_review)`) ·
    `all`. Per-status (done/failed) filtering deferred.
  - Filters select the visible **top-level** set; each visible parent's children
    are always included regardless of their own `updated_at`/status (you see the
    whole project once it's in view).
  - Shareable/bookmarkable; default view = active, touched in last 14 days.
- The board read cap (200) and existing indexes still apply; the
  `tasks(workspace_id, updated_at desc)` index already supports the window query.

## Data flow (decomposition)

```
Human → create project P (assigned to Agent A)           [top-level, parent_id null]
Agent A (via MCP) → create_subtask(P, "step 1")          [child, inherits A + workspace]
Agent A → create_subtask(P, "step 2")
Agent A internally fans out subagents (AgentBoard unaware)
Agent A → update_task_status(step 1, in_progress) …→ done
Agent A → update_task_status(P, done)   # A decides P is done (H6; no auto-rollup)
Board: P shows "2/2 done"; appears under the active/last-2-weeks view live (D9-RT).
```

## Error handling

Reuses the existing contract (400/401/404/409/413). New cases:
- `create_subtask` on a non-owned/absent parent → **404**.
- `create_subtask`/`createChildTask` on a depth-1 (already-child) parent → **409**.
- Empty title → **400**.

## Testing (must-have, alongside implementation)

- **Depth cap:** adding a child to a child is rejected (409), both via MCP and the
  human action. Adding a child to a parent-less task succeeds.
- **Scoping:** agent A cannot `create_subtask` under agent B's / another
  workspace's task (404) — extends the existing cross-tenant test.
- **Inheritance:** a created child has the parent's `workspace_id` +
  `assigned_agent_id`.
- **Event trail:** child creation writes a `created` event with the right
  actor_type (agent vs user).
- **Filters:** default query returns only non-terminal top-level items touched in
  the last 14 days; `window=all`/`status=all` widen correctly; a visible parent's
  children are always included.
- **Board render:** projects nest children one level; `N/M done` hint correct;
  standalone tasks unchanged.

## Deferred (not in this phase)

- **Recurring tasks** — schedule/cron semantics on a project or task. This is the
  flagged *next* phase; to be designed separately. (Likely a `recurrence` rule +
  a scheduler that clones a template task on a cadence — but not decided here.)
- **Depth > 2** — schema already supports it; only the cap predicate + board
  rendering would change.
- **Agent→agent assignment / claim pool** — still deferred (D11 holds).
- **Per-status board filtering** (done/failed) and **custom date ranges** — only
  Active/All + presets in v1.
- **Status rollup engine** — agent owns parent status (H6).

## Open questions / risks

- **Progress hint cost:** `N/M done` per parent needs a child-status count.
  Either an embedded aggregate (like `listAgents`' `tasks(count)`) or a single
  grouped query over visible parents' children. Pick the cheaper at build time;
  cap applies.
- **Filtering + children + read cap interaction:** with `all`/`all` on a large
  board, "always include children of visible parents" could blow the 200 cap.
  Resolution: the cap counts top-level items; children render under their parent
  and are not separately capped in v1 (revisit if boards get huge).
- **Recurring tasks will likely reopen the data model** (template vs instance) —
  keep that in mind so this phase's choices don't paint us in.
