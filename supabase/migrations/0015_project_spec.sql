-- ─────────────────────────────────────────────────────────────────────────────
-- Project spec field (DECISIONS D-PROJECT-SPEC; spec
-- docs/superpowers/specs/2026-07-08-project-spec-field-design.md) — a full brief
-- for agents that the board UI does NOT surface:
--
--   tasks.spec   — long-form brief (BRD / spec / design doc) attached to a project.
--                  Set/edited by the human in the New/Edit Project modal; delivered
--                  to the assigned agent over the existing list_my_tasks read path
--                  (select("*")). Never rendered on board cards or lane headers.
--
-- Nullable so existing rows (every current project incl. the seeded Miscellaneous
-- project, and every task) keep working with no backfill. Only the app layer sets
-- or reads it, and only for kind='project' rows — no CHECK ties it to kind, to
-- avoid fighting the tasks_kind_shape invariant. No RLS changes (same
-- workspace-scoped policies apply).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists spec text;
