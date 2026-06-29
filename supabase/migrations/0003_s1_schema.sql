-- ─────────────────────────────────────────────────────────────────────────────
-- AgentBoard S1 — the real v1 data model, replacing the S0 spike `tasks` table.
--
-- Tables: workspaces, agents, tasks, task_events (design.md "Data model (MVP)").
-- Isolation posture (design.md / DECISIONS D13/D15):
--   • HUMAN plane → RLS now: a row is visible iff its workspace's
--     owner_user_id = auth.uid(). Enforced at the DB on every table.
--   • AGENT plane → app-code scoped query on the service-role connection
--     (lib/agent-db.ts), service-role bypasses RLS. DB-enforced agent RLS is
--     DEFERRED to the multi-user milestone (Appendix A). No agent policies here.
--
-- Status values mirror src/lib/task-status.ts STATUSES (single source of truth);
-- a Vitest test asserts this CHECK matches STATUSES so they can't drift.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- The S0 spike table is replaced wholesale (it had no workspace/agent columns).
drop table if exists public.tasks cascade;

-- ── workspaces ───────────────────────────────────────────────────────────────
-- One workspace per user (single-tenant v1). UNIQUE(owner_user_id) DB-enforces
-- "exactly one" even under a signup race; getOrCreateWorkspace() upserts against
-- it (DECISIONS D2 — app-code bootstrap, not an auth.users trigger).
create table public.workspaces (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null unique references auth.users (id) on delete cascade,
  name           text not null default 'My Workspace',
  created_at     timestamptz not null default now()
);

-- ── agents ───────────────────────────────────────────────────────────────────
-- One API key per agent: SHA-256 of the full `ab_<prefix>_<secret>` token stored
-- in api_key_hash (indexed for the per-call lookup); prefix shown in UI only.
-- revoked_at NULL = active (single disable mechanism, D12). last_seen_at is
-- written (throttled, D10) on each successful MCP call → drives the connected dot.
create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  description   text,
  api_key_hash  text not null unique,
  api_key_prefix text not null,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Hot path: per-call key lookup is `WHERE api_key_hash = ? AND revoked_at IS NULL`.
-- (api_key_hash is already UNIQUE-indexed; this partial index serves active-only.)
create index agents_active_key_idx
  on public.agents (api_key_hash) where revoked_at is null;

create index agents_workspace_idx on public.agents (workspace_id);

-- ── tasks ────────────────────────────────────────────────────────────────────
-- Directed assignment (D11): assigned_agent_id NOT NULL — a task always has one
-- agent. status CHECK mirrors STATUSES (task-status.ts). result capped in app
-- code (256 KB, D-SUBMIT); no DB length cap so the error contract stays in code.
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  assigned_agent_id  uuid not null references public.agents (id) on delete restrict,
  title              text not null,
  description        text,
  status             text not null default 'todo'
                     check (status in ('todo','in_progress','in_review','done','failed')),
  result             text,
  created_by_user_id uuid not null references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- D6-INDEX: list_my_tasks (every agent poll) and board load / read cap.
create index tasks_workspace_agent_idx on public.tasks (workspace_id, assigned_agent_id);
create index tasks_workspace_updated_idx on public.tasks (workspace_id, updated_at desc);

-- ── task_events ──────────────────────────────────────────────────────────────
-- Append-only history; both planes write via one appendTaskEvent() helper, in the
-- same transaction as the task write so history can't desync from state.
create table public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor_type  text not null check (actor_type in ('user','agent')),
  actor_id    uuid not null,
  event_type  text not null
              check (event_type in ('created','status_changed','result_submitted')),
  from_status text check (from_status in ('todo','in_progress','in_review','done','failed')),
  to_status   text check (to_status in ('todo','in_progress','in_review','done','failed')),
  note        text,
  created_at  timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, created_at);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- The board subscribes to tasks row changes (Gate B, D9-RT). Re-add tasks to the
-- publication (the spike table that was in it got dropped above).
alter publication supabase_realtime add table public.tasks;

-- ── Row-Level Security (human plane) ─────────────────────────────────────────
-- A row is visible/editable iff it belongs to a workspace the caller owns. The
-- agent plane uses service-role (bypasses RLS) + app-code scoping, so there are
-- intentionally NO agent policies here.
alter table public.workspaces enable row level security;
alter table public.agents     enable row level security;
alter table public.tasks      enable row level security;
alter table public.task_events enable row level security;

-- workspaces: owner sees/edits only their own.
create policy workspaces_owner_all on public.workspaces
  for all to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- agents: rows whose workspace the caller owns.
create policy agents_owner_all on public.agents
  for all to authenticated
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())))
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

-- tasks: rows whose workspace the caller owns. THIS is the policy the live board
-- depends on (D9-RT): an agent's service-role write is only delivered to the
-- board if the row passes this SELECT.
create policy tasks_owner_all on public.tasks
  for all to authenticated
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())))
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

-- task_events: rows whose task belongs to a workspace the caller owns.
create policy task_events_owner_all on public.task_events
  for all to authenticated
  using (task_id in (
    select t.id from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where w.owner_user_id = (select auth.uid())
  ))
  with check (task_id in (
    select t.id from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where w.owner_user_id = (select auth.uid())
  ));
