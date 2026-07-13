-- Atomic approval-loop primitives (spec AL-C/AL-D). Both do task-write + event in
-- one txn, returning jsonb the caller maps to the error contract.

-- request_review: agent parks an in_progress task in in_review with a structured
-- request. Scoped to (workspace, agent). Returns:
--   { ok:true, task:{...} } | { ok:false, reason:'not_found'|'not_in_progress' }
create or replace function public.request_review(
  p_workspace_id uuid,
  p_agent_id     uuid,
  p_task_id      uuid,
  p_reason       text,
  p_options      jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_task public.tasks;
begin
  select * into v_task
    from public.tasks
   where id = p_task_id
     and workspace_id = p_workspace_id
     and assigned_agent_id = p_agent_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_task.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_progress');
  end if;

  update public.tasks
     set status = 'in_review',
         review_reason = p_reason,
         review_options = p_options,
         review_verdict = null,
         review_selected_option = null,
         review_note = null,
         updated_at = now()
   where id = p_task_id
   returning * into v_task;

  perform public.append_task_event(
    p_task_id, 'agent', p_agent_id, 'status_changed', 'in_progress', 'in_review', p_reason
  );
  return jsonb_build_object('ok', true, 'task', to_jsonb(v_task));
end;
$$;

-- resolve_review: human resolves an in_review task. p_to is the target status
-- (in_progress | done | failed). Scoped to workspace only (human plane, RLS on the
-- caller path guards workspace; this runs via the user RLS client, so the row is
-- already workspace-scoped). Returns { ok:true, task } | { ok:false, reason }.
create or replace function public.resolve_review(
  p_workspace_id uuid,
  p_task_id      uuid,
  p_to           text,      -- 'in_progress' | 'done' | 'failed'
  p_verdict      text,      -- 'approved' | 'rejected'
  p_selected     text,
  p_note         text,
  p_actor_id     uuid
) returns jsonb
language plpgsql
as $$
declare
  v_task public.tasks;
begin
  select * into v_task
    from public.tasks
   where id = p_task_id
     and workspace_id = p_workspace_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_task.status <> 'in_review' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_review');
  end if;

  update public.tasks
     set status = p_to,
         review_verdict = p_verdict,
         review_selected_option = p_selected,
         review_note = p_note,
         updated_at = now()
   where id = p_task_id
   returning * into v_task;

  perform public.append_task_event(
    p_task_id, 'user', p_actor_id, 'status_changed', 'in_review', p_to, p_note
  );
  return jsonb_build_object('ok', true, 'task', to_jsonb(v_task));
end;
$$;

-- request_review is agent-plane: only the service-role module calls it (revoke all).
revoke all on function public.request_review(uuid, uuid, uuid, text, jsonb) from anon, authenticated;
-- resolve_review is human-plane: the manager UI calls it under the user's RLS
-- session (createServerSupabase → role `authenticated`), so it must be executable
-- by that role. It is SECURITY INVOKER, so the row-level UPDATE inside is still
-- subject to the caller's RLS — a user can only resolve tasks in their own
-- workspace. anon stays revoked.
revoke all on function public.resolve_review(uuid, uuid, text, text, text, text, uuid) from anon;
grant execute on function public.resolve_review(uuid, uuid, text, text, text, text, uuid) to authenticated;
alter function public.request_review(uuid, uuid, uuid, text, jsonb) set search_path = public, pg_temp;
alter function public.resolve_review(uuid, uuid, text, text, text, text, uuid) set search_path = public, pg_temp;
