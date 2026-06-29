import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY service-role client. Bypasses RLS.
// S0: used by the MCP write path. In v1 this lives behind the confined
// `agent-db` scoped-query wrapper (DECISIONS.md D8 / 3A) — never imported
// into client code.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // New Supabase secret key (sb_secret_...), server-only — replaces the legacy
  // service_role JWT. Bypasses RLS.
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
