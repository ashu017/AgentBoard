"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Human-plane browser client (board Realtime subscription + client reads). Uses
// the publishable key; the cookie-bound session supplies the user JWT so RLS
// applies. Lazily constructed — never read env at module load (build-time
// prerender has no env → crash; DECISIONS 1A "second scaffold finding").

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createBrowserClient(url, key);
  return client;
}
