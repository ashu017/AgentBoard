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
