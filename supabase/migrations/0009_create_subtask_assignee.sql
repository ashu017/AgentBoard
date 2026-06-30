-- Update create_subtask for first-class projects (spec P4). The child is now an
-- explicit kind='task' row; its assignee can be any ACTIVE agent in the same
-- workspace (cross-agent decomposition), defaulting to the lead. The parent must
-- be a kind='project' the caller leads (agent plane) or owns (human plane).
--
-- Returns jsonb the caller maps to the error contract:
--   { ok:true, task:{...} }
--   { ok:false, reason:'not_found' }        → parent not in scope / not a project (404)
--   { ok:false, reason:'bad_assignee' }      → assignee not an active workspace agent (404)
create or replace function public.create_subtask(
  p_workspace_id uuid,
  p_parent_id    uuid,
  p_title        text,
  p_description  text,
  p_actor_type   text,    -- 'agent' | 'user'
  p_actor_id     uuid,
  p_created_by   uuid,    -- created_by_user_id for the child row (human plane)
  p_require_agent uuid,   -- if not null, parent.assigned_agent_id must equal this (lead gate, agent plane)
  p_assignee     uuid     -- the child's assigned_agent_id; if null, defaults to parent's lead / actor
) returns jsonb
language plpgsql
as $$
declare
  v_parent   public.tasks;
  v_child    public.tasks;
  v_assignee uuid;
begin
  -- Lock the parent within scope. Missing / wrong lead → not_found (404, not 403).
  select * into v_parent
    from public.tasks
   where id = p_parent_id
     and workspace_id = p_workspace_id
     and kind = 'project'
     and (p_require_agent is null or assigned_agent_id = p_require_agent)
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Resolve assignee: explicit arg, else parent lead, else the acting agent.
  v_assignee := coalesce(p_assignee, v_parent.assigned_agent_id, p_actor_id);

  -- A task must have an agent (kind_shape CHECK), and it must be an active agent
  -- in this workspace. NULL or foreign/revoked → bad_assignee (404).
  if v_assignee is null or not exists (
    select 1 from public.agents
     where id = v_assignee
       and workspace_id = p_workspace_id
       and revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_assignee');
  end if;

  insert into public.tasks
    (workspace_id, assigned_agent_id, parent_id, kind, title, description, status, created_by_user_id)
  values
    (p_workspace_id, v_assignee, p_parent_id, 'task', p_title, p_description, 'todo', p_created_by)
  returning * into v_child;

  perform public.append_task_event(
    v_child.id, p_actor_type, p_actor_id, 'created', null, 'todo', null
  );

  return jsonb_build_object('ok', true, 'task', to_jsonb(v_child));
end;
$$;

revoke all on function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid)
  from anon, authenticated;

alter function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid)
  set search_path = public, pg_temp;

-- Drop the old 8-arg signature so callers can't hit the stale version.
drop function if exists public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid);
