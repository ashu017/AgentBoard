-- Harden the agent-plane functions: pin search_path so they can't be hijacked
-- by a malicious role-local search_path (Supabase advisor 0011
-- function_search_path_mutable). The function bodies are unchanged.
alter function public.append_task_event(uuid, text, uuid, text, text, text, text)
  set search_path = public, pg_temp;
alter function public.agent_apply_transition(uuid, uuid, uuid, text, text, text, boolean, text)
  set search_path = public, pg_temp;
