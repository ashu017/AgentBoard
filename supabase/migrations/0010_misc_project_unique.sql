-- Enforce one Miscellaneous project per workspace (spec P3). Without this, the
-- get-or-create read-back race in lib/projects.ts isn't actually safe — two
-- concurrent getSession() calls could both insert. Partial unique index over the
-- unassigned top-level project titled 'Miscellaneous'.
create unique index if not exists tasks_one_misc_per_workspace
  on public.tasks (workspace_id)
  where kind = 'project' and parent_id is null and title = 'Miscellaneous';
