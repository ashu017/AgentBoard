-- Atomic create-child-task primitive (hierarchical-tasks spec). Both the agent
-- plane (create_subtask MCP tool) and the human plane (createChildTask server
-- action) call this so the depth-2 cap + child insert + `created` event live in
-- ONE place. The child inherits the parent's workspace_id + assigned_agent_id.
--
-- Returns jsonb the caller maps to the error contract:
--   { ok:true, task:{...} }
--   { ok:false, reason:'not_found' }       → parent not in scope (404)
--   { ok:false, reason:'depth_exceeded' }  → parent is already a child (409, v1 cap)
--
-- p_actor_type/p_actor_id record who created it (user vs agent) in task_events.
-- Scope is enforced by the caller passing the right (workspace, agent) for the
-- agent plane; the human plane passes its workspace + created_by user.
create or replace function public.create_subtask(
  p_workspace_id uuid,
  p_parent_id    uuid,
  p_title        text,
  p_description  text,
  p_actor_type   text,   -- 'agent' | 'user'
  p_actor_id     uuid,
  p_created_by   uuid,   -- created_by_user_id for the child row
  p_require_agent uuid   -- if not null, parent.assigned_agent_id must equal this (agent plane)
) returns jsonb
language plpgsql
as $$
declare
  v_parent public.tasks;
  v_child  public.tasks;
begin
  -- Lock the parent within scope. Missing / wrong agent → not_found (404, not 403).
  select * into v_parent
    from public.tasks
   where id = p_parent_id
     and workspace_id = p_workspace_id
     and (p_require_agent is null or assigned_agent_id = p_require_agent)
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Depth-2 cap: the parent must itself be top-level.
  if v_parent.parent_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'depth_exceeded');
  end if;

  insert into public.tasks
    (workspace_id, assigned_agent_id, parent_id, title, description, status, created_by_user_id)
  values
    (p_workspace_id, v_parent.assigned_agent_id, p_parent_id, p_title, p_description,
     'todo', p_created_by)
  returning * into v_child;

  perform public.append_task_event(
    v_child.id, p_actor_type, p_actor_id, 'created', null, 'todo', null
  );

  return jsonb_build_object('ok', true, 'task', to_jsonb(v_child));
end;
$$;

revoke all on function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid)
  from anon, authenticated;

alter function public.create_subtask(uuid, uuid, text, text, text, uuid, uuid, uuid)
  set search_path = public, pg_temp;
