-- Human-in-the-loop approval loop (spec 2026-07-01-approval-loop-design.md, AL-A).
-- The agent parks a task in in_review carrying a structured review request; the
-- human writes a verdict back. One open review per task at a time (enforced in
-- app code: request_review is only valid on an in_progress task).
alter table public.tasks
  add column if not exists review_reason          text,
  add column if not exists review_options         jsonb,
  add column if not exists review_verdict         text
    check (review_verdict in ('approved','rejected')),
  add column if not exists review_selected_option text,
  add column if not exists review_note            text;
