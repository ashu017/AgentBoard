-- ─────────────────────────────────────────────────────────────────────────────
-- Agent-plane atomic write primitives (design.md: "task-write + event-append run
-- in ONE transaction" + "concurrent transition lost-update guard").
--
-- PostgREST/supabase-js can't run multi-statement transactions, so the
-- atomic operations live in Postgres functions called via the service-role
-- connection from lib/agent-db.ts. Design rules honored:
--   • Transition LEGALITY stays in src/lib/task-status.ts (the SSOT) — these
--     functions do NOT re-decide what's legal. The caller validates canTransition
--     first and passes the expected `from`; the function does a compare-and-swap
--     on `status = p_from`, which is the lost-update guard (row-locked).
--   • SCOPING: every function filters `workspace_id = p_ws AND assigned_agent_id
--     = p_agent`. A non-matching row is invisible → maps to 404 (never 403).
--   • Events are constructed in ONE place: append_task_event(). No hand-built
--     event rows anywhere.
--
-- These run as the table owner (service-role already bypasses RLS); they are not
-- exposed to anon/authenticated — only the service-role module calls them.
-- ─────────────────────────────────────────────────────────────────────────────

-- Single event-construction point (design.md "single appendTaskEvent() helper").
create or replace function public.append_task_event(
  p_task_id    uuid,
  p_actor_type text,
  p_actor_id   uuid,
  p_event_type text,
  p_from_status text default null,
  p_to_status   text default null,
  p_note        text default null
) returns void
language sql
as $$
  insert into public.task_events
    (task_id, actor_type, actor_id, event_type, from_status, to_status, note)
  values
    (p_task_id, p_actor_type, p_actor_id, p_event_type, p_from_status, p_to_status, p_note);
$$;

-- Atomic compare-and-swap transition + event. Returns a jsonb result the caller
-- maps to the error contract:
--   { ok:true, task:{...} }                 → success
--   { ok:false, reason:'not_found' }        → no scoped row (404)
--   { ok:false, reason:'conflict', current} → row exists but status != p_from
--                                              (concurrent change; caller re-evaluates)
-- p_set_result/p_result let submit_result write the result in the same txn.
create or replace function public.agent_apply_transition(
  p_workspace_id uuid,
  p_agent_id     uuid,
  p_task_id      uuid,
  p_from         text,
  p_to           text,
  p_note         text,
  p_set_result   boolean,
  p_result       text
) returns jsonb
language plpgsql
as $$
declare
  v_current text;
  v_task    public.tasks;
begin
  -- Lock the scoped row. Missing → not_found (don't reveal existence).
  select status into v_current
    from public.tasks
   where id = p_task_id
     and workspace_id = p_workspace_id
     and assigned_agent_id = p_agent_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Lost-update guard: only swap if the status is still what the caller validated.
  if v_current is distinct from p_from then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'current', v_current);
  end if;

  update public.tasks
     set status     = p_to,
         result     = case when p_set_result then p_result else result end,
         updated_at = now()
   where id = p_task_id
     and workspace_id = p_workspace_id
     and assigned_agent_id = p_agent_id
     and status = p_from
   returning * into v_task;

  -- result_submitted when a result was written; otherwise status_changed.
  perform public.append_task_event(
    p_task_id,
    'agent',
    p_agent_id,
    case when p_set_result then 'result_submitted' else 'status_changed' end,
    p_from,
    p_to,
    p_note
  );

  return jsonb_build_object('ok', true, 'task', to_jsonb(v_task));
end;
$$;

-- Lock down: only the service-role (which owns/bypasses) path uses these. Revoke
-- from the API-facing roles so they're not callable via /rest/v1/rpc.
revoke all on function public.append_task_event(uuid, text, uuid, text, text, text, text) from anon, authenticated;
revoke all on function public.agent_apply_transition(uuid, uuid, uuid, text, text, text, boolean, text) from anon, authenticated;
