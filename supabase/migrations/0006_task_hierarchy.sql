-- Hierarchical tasks (project → task), per
-- docs/superpowers/specs/2026-06-30-hierarchical-tasks-design.md.
--
-- One recursive table: a "project" is a parent-less task that has children; a
-- child task has parent_id set. Depth is capped at 2 in app code (a child's
-- parent must be parent-less), not in SQL, so lifting the cap later needs no
-- migration. on delete cascade: deleting a parent removes its children.
alter table public.tasks
  add column if not exists parent_id uuid references public.tasks (id) on delete cascade;

-- Fetch a parent's children (board nesting, list_my_tasks parent filter).
create index if not exists tasks_workspace_parent_idx
  on public.tasks (workspace_id, parent_id);

-- Agent-created subtasks have no human creator (the task_events row records the
-- agent as actor instead), so created_by_user_id must be nullable. Human-created
-- tasks still set it.
alter table public.tasks
  alter column created_by_user_id drop not null;
