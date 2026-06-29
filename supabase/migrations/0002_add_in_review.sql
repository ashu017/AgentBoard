-- Add 'in_review' status — the approval-gate primitive (DECISIONS: POSITION moat).
-- Level A (status-only): agents can park a task awaiting human approval; it's
-- visible on the board. The Approve/Reject resolution loop is a later feature.
--
-- 0001 already created tasks with a 4-value CHECK; replace it with the 5-value one.

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo','in_progress','in_review','done','failed'));
