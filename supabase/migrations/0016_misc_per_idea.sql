-- ─────────────────────────────────────────────────────────────────────────────
-- Miscellaneous is now ONE-PER-IDEA, not one-per-workspace (D-IDEAS follow-up).
-- The ideas level (0015) means each idea needs its own Miscellaneous catch-all
-- project. The old partial unique index enforced uniqueness on (workspace_id);
-- re-scope it to (workspace_id, idea_id) so a second idea can have its own Misc.
--
-- Safe: existing data has exactly one Misc per workspace, already carrying the
-- backfilled idea_id, so the new (workspace_id, idea_id) uniqueness holds. Drop +
-- recreate of a partial unique index; no data change.
-- ─────────────────────────────────────────────────────────────────────────────

drop index if exists tasks_one_misc_per_workspace;

create unique index tasks_one_misc_per_idea
  on public.tasks (workspace_id, idea_id)
  where kind = 'project' and parent_id is null and title = 'Miscellaneous';
