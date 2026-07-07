-- ─────────────────────────────────────────────────────────────────────────────
-- Ideas — a third hierarchy level (DECISIONS D-IDEAS). workspace → idea → project
-- → task. Ideas group parallel bodies of work; single-tenant is preserved (ideas
-- live inside the one workspace, they are NOT tenants). Human-plane only — the
-- agent/MCP plane is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ideas ────────────────────────────────────────────────────────────────────
create table public.ideas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  archived_at   timestamptz,               -- null = active
  created_at    timestamptz not null default now()
);
create index ideas_workspace_idx on public.ideas (workspace_id);

-- ── tasks.idea_id (project rows only) ────────────────────────────────────────
-- Only kind='project' rows carry a direct idea link; tasks inherit it via parent.
-- Partial NOT NULL can't be a column constraint, so a CHECK enforces the invariant.
alter table public.tasks
  add column if not exists idea_id uuid references public.ideas (id) on delete restrict;
create index tasks_idea_idx on public.tasks (idea_id);

-- ── agent_ideas join (an agent belongs to ≥1 idea; shared agents span several) ─
create table public.agent_ideas (
  agent_id  uuid not null references public.agents (id) on delete cascade,
  idea_id   uuid not null references public.ideas (id) on delete cascade,
  primary key (agent_id, idea_id)
);
create index agent_ideas_idea_idx on public.agent_ideas (idea_id);

-- ── Backfill: one default idea per workspace, reparent existing projects+agents ─
do $$
declare
  w record;
  new_idea uuid;
begin
  for w in (select id from public.workspaces) loop
    insert into public.ideas (workspace_id, name)
      values (w.id, 'AgentBoard')
      returning id into new_idea;
    update public.tasks
       set idea_id = new_idea
     where workspace_id = w.id and kind = 'project';
    insert into public.agent_ideas (agent_id, idea_id)
      select a.id, new_idea from public.agents a where a.workspace_id = w.id
      on conflict do nothing;
  end loop;
end $$;

-- Now enforce the invariant: every project row must have an idea.
alter table public.tasks
  add constraint tasks_project_has_idea
  check (kind <> 'project' or idea_id is not null);

-- ── RLS (human plane) ────────────────────────────────────────────────────────
alter table public.ideas       enable row level security;
alter table public.agent_ideas enable row level security;

create policy ideas_owner_all on public.ideas
  for all to authenticated
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())))
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy agent_ideas_owner_all on public.agent_ideas
  for all to authenticated
  using (idea_id in (
    select i.id from public.ideas i
    join public.workspaces w on w.id = i.workspace_id
    where w.owner_user_id = (select auth.uid())))
  with check (idea_id in (
    select i.id from public.ideas i
    join public.workspaces w on w.id = i.workspace_id
    where w.owner_user_id = (select auth.uid())));
