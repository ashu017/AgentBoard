-- ─────────────────────────────────────────────────────────────────────────────
-- AgentBoard waitlist — pre-launch demand capture (DECISIONS D-WAITLIST).
--
-- A public, unauthenticated email capture on the marketing landing page, to
-- validate the core bet (managers want to hand-assign tasks to agents on a
-- board) BEFORE a public launch. Deliberately the INVERSE of the tasks RLS:
--
--   • ANON can INSERT only        → anyone can join the list.
--   • NOBODY can SELECT via API   → no policy grants read, so the anon/public
--                                    key cannot enumerate signups. The owner
--                                    reads counts via the Supabase dashboard /
--                                    service-role (which bypasses RLS).
--
-- UNIQUE(email) makes a re-signup a no-op the client surfaces as "already on the
-- list" (23505). A CHECK enforces a minimal email shape. NOT added to the
-- supabase_realtime publication — no live needs. `source` distinguishes which
-- placement converted (hero vs footer). `honeypot`-style bot rows are dropped in
-- app code, not stored (the client silently no-ops when the hidden field is set).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique
              check (position('@' in email) > 1 and position('.' in email) > 1),
  source      text,
  created_at  timestamptz not null default now()
);

alter table public.waitlist_signups enable row level security;

-- Insert-only for the public. `anon` covers logged-out landing visitors;
-- `authenticated` covers a signed-in visitor who still uses the form. There is
-- intentionally NO select/update/delete policy → the API can never read the list
-- back, so emails are write-only from the client's perspective.
create policy waitlist_public_insert on public.waitlist_signups
  for insert to anon, authenticated
  with check (true);
