-- AgentBoard S0 spike schema (minimal — proves the loop, not the product).
-- This is NOT the v1 schema; it exists only to run the two S0 gates:
--   (a) MCP-on-Vercel handshake, (b) Realtime delivery under RLS.
-- Full schema (workspaces, agents, RLS, etc.) comes in S1 after S0 passes.

create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  status      text not null default 'todo'
              check (status in ('todo','in_progress','done','failed')),
  result      text,
  updated_at  timestamptz not null default now()
);

-- Realtime: broadcast row changes on tasks.
alter publication supabase_realtime add table public.tasks;

-- RLS on. For the S0 spike (no human auth yet) we allow anon SELECT so the
-- board client can subscribe and read. Writes happen server-side via the
-- service-role key (bypasses RLS). This is a SPIKE policy, deliberately loose;
-- S1 replaces it with workspace-scoped owner policies.
alter table public.tasks enable row level security;

create policy "s0_anon_read_tasks"
  on public.tasks for select
  to anon
  using (true);
