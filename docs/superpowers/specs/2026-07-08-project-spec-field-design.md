# Project `spec` field — a full brief for agents

**Date:** 2026-07-08
**Status:** Design approved, pending spec review
**Decision log:** to be recorded as `D-PROJECT-SPEC` in `docs/DECISIONS.md` on implementation.

## Problem

A project today has two human-facing fields: `title` (required) and `description`
(optional, short). Both are meant for the board — a glanceable label and a one-liner.
Neither is a place to put the *full* context an agent needs to actually do the work:
a BRD, a spec doc, or a design doc.

The manager wants to attach that full brief to a project so the **agent** picking it up
over MCP has real context to decompose and execute — while the **board UI** stays clean
and continues to show only title + description.

## Constraints (from the current architecture)

- **Projects are `tasks` rows** with `kind='project'` (spec `2026-06-30-first-class-projects-design.md`,
  P1). `title text not null`, `description text` nullable.
- **Agent reads go through `select("*")`** — `scopedTasks()` and `scopedProjectSubtree()`
  in `src/lib/agent-db.ts` select all columns, and `list_my_tasks` returns whole rows. A
  new column flows to agents automatically; the guarantee to prove is that it *arrives*.
- **A seeded Miscellaneous project** exists per workspace (P3) and must keep working with
  no backfill. Empty/quick projects are a first-class path (P1) — the New Project flow
  must not gain a hard requirement.
- **Human plane uses RLS**, agent plane is app-code scoped on the service-role connection.
  A new nullable text column changes neither.

## Decision summary (what we chose, and why)

| Question | Decision | Why |
|---|---|---|
| What form does the brief take? | **Pasted long-form text** (a `tasks.spec` column). Not a link. | AgentBoard stays self-contained — the agent is *guaranteed* the full text over the existing MCP read path. A URL could be un-fetchable or auth-gated for an agent runtime, so the "agent has context" promise would fail silently. Matches how `description`/`result` already work. |
| Optional or mandatory? | **Optional in the schema, strongly surfaced in the UI.** | A hard DB requirement fights the model (nullable `description`, seeded Miscellaneous project, empty-project-first workflow) and forces a backfill for zero real safety gain. Optional-but-prominent gets the behavior we want — managers reach for it — without breaking anything. |
| Which hierarchy levels? | **Projects only.** | A project is the unit an agent is assigned and decomposes; its child tasks inherit context by living under it (a lead reads the whole subtree via `scopedProjectSubtree`). Per-task specs risk duplication/contradiction (YAGNI); idea-level specs couple to the in-flight ideas work. |
| Field name | **`spec`.** | Matches the manager's framing (BRD / spec doc / design doc). |
| Shown on the board? | **No.** | Cards and lane headers keep showing only title + description. The spec is a "back-of-card" brief entered/edited in the modal and delivered to the agent. |
| Editable after creation? | **Yes** — settable at creation *and* editable via the Edit Project modal. | Managers write briefs as work firms up, not only up front. |

## Architecture

### Data model

One nullable column, no CHECK tied to `kind` (the app layer only sets/reads it for
projects; keeping the DB constraint-free avoids fighting the existing shape invariant):

```sql
-- supabase/migrations/00XX_project_spec.sql
alter table public.tasks add column if not exists spec text;
```

Existing rows — every current project (incl. seeded **Miscellaneous**) and every task —
get `spec = null`. No backfill, no data migration.

### Manager plane (write) — `src/lib/manager-actions.ts`, `src/app/actions.ts`

- `createProject(title, leadAgentId?, description?, priority, spec?)` and
  `updateProject(projectId, title, leadAgentId?, description?, spec?)` gain a `spec`
  parameter, trimmed to `null` when empty — mirroring exactly how `description` is
  handled today.
- `createProjectAction` / `updateProjectAction` read `spec` from the submitted `FormData`
  and pass it through.

### UI — `src/app/board/BoardClient.tsx`

- **New Project** and **Edit Project** modals gain a labelled `<textarea name="spec">`
  (larger than the description box — this is long-form), with helper text along the lines
  of: *"Full brief for your agents — BRD, spec, or design doc. Not shown on the board;
  delivered to the assigned agent."* The Edit modal pre-fills `defaultValue={project.spec ?? ""}`.
- The field is **not** rendered on lane headers or task cards. The board's visual system
  is unchanged; the spec is intentionally back-of-card.
- The board's realtime `select(...)` column list is extended to include `spec` only if a
  client component needs it (e.g. to pre-fill the Edit modal). If the Edit modal fetches
  the project row it already has, add `spec` to that select; otherwise the column need not
  reach the board client at all.

### Agent plane (read) — `src/lib/agent-db.ts`, `src/app/api/mcp/route.ts` — *the point*

- Add `spec: string | null` to the `TaskRow` interface. Because `scopedTasks()` and
  `scopedProjectSubtree()` use `select("*")`, `list_my_tasks` returns `spec` with no
  serialization change.
- Update the `list_my_tasks` tool **description** so agents know a project row carries a
  `spec` — the full brief — and should read it before decomposing the project into subtasks.
- When a project has no brief, the agent receives `spec: null` — an explicit
  "no brief provided" signal (the surfacing half of the optional-but-prominent decision).

## Error handling

No new error modes. `spec` is optional on write (empty → `null`, like `description`) and
nullable on read. No length cap is enforced beyond the practical MCP result-size limits
already in place (`413` oversize applies to `submit_result`, not to reads); `spec` is
manager-authored, not agent-authored, so the abuse surface is the manager's own workspace.

## Testing (must-have paths)

1. **Migration** applies cleanly; existing project + task rows read back `spec = null`.
2. **`createProject` / `updateProject`** round-trip a `spec` value, and trim
   whitespace-only input to `null`.
3. **MCP read guarantee (integration, live path):** an agent calling `list_my_tasks` on a
   project assigned to it receives the exact `spec` text; and receives `spec: null` when
   unset. This is the "agent actually has the context" assertion — the reason the feature
   exists.
4. **Board isolation:** the New/Edit Project modals expose the field; lane headers and
   cards do **not** render `spec`.

## Decision log entry (to add on implementation)

`D-PROJECT-SPEC` — Projects carry an optional `spec` brief (BRD / spec / design doc).
Text-only, not a link (self-contained, per D-STACK). Project-level only. Optional in the
schema but surfaced prominently in the New/Edit Project modals and editable after creation.
Delivered to the assigned agent over the existing `list_my_tasks` MCP read path (`select("*")`);
never rendered on board cards or lane headers.

## Out of scope

- Per-task or per-idea specs (separable features; YAGNI now).
- Spec as an external link / uploaded file (reconsider only if a self-contained text brief
  proves insufficient).
- Versioning / history of the spec (the `task_events` log is not extended for spec edits in v1).
- Rendering the spec anywhere in the human board UI beyond the edit modal.
