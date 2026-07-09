-- ─────────────────────────────────────────────────────────────────────────────
-- Task/project scheduling + sizing fields (issues #6 tasks, #7 projects) — extra
-- attributes the manager can set on a task or project alongside title/priority:
--
--   tasks.need_by     — optional target date (DATE, no time-of-day). Shown in the
--                       task-detail modal + edited in the create/edit forms. Set by
--                       the human; agents read it along with the rest of the row.
--   tasks.complexity  — low | medium | high (nullable, no default). A rough sizing
--                       signal, emphasized for projects but allowed on any row.
--
-- Both nullable (need_by defaulted to NULL, complexity NULL) so existing rows and
-- the agent-plane code keep working without a backfill. No RLS changes (same
-- workspace-scoped policies apply). Mirrors 0014's priority/pr_url style.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists need_by date;

alter table public.tasks
  add column if not exists complexity text
    check (complexity in ('low', 'medium', 'high'));
