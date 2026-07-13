-- ─────────────────────────────────────────────────────────────────────────────
-- Board redesign (DECISIONS D-BOARD-REDESIGN) — fields the Figma "Personal tasks
-- dashboard" surfaces that the v1 schema lacked:
--
--   tasks.priority   — high | medium | low (default medium). Shown on cards + the
--                      project header; set by the human on create, editable later.
--   tasks.pr_url     — optional GitHub PR link surfaced on a "Needs Review" card.
--                      An agent sets this via submit_result(pr_url=...) when it
--                      raises a PR and moves the task to in_review.
--
-- Both nullable / defaulted so existing rows and the agent-plane code keep working
-- without a backfill. No RLS changes (same workspace-scoped policies apply).
--
-- (Agent role/model + avatars are intentionally out of scope for now — the board
-- shows agent name + live status only.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low'));

alter table public.tasks
  add column if not exists pr_url text;
