"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Human-plane browser client (board Realtime subscription + client reads). The
// cookie-bound session supplies the user JWT so RLS applies. Lazily constructed —
// never read env at module load (build-time prerender has no env → crash;
// DECISIONS 1A "second scaffold finding").
//
// KEY CHOICE (DECISIONS D-RT-KEY): prefer the legacy anon JWT for this client.
// Supabase Realtime's WebSocket rejects the new-format `sb_publishable_*` key
// (socket opens then closes → the board reports "LIVE" but receives ZERO events,
// so it never updates without a hard refresh). REST accepts either key, but this
// client's whole job is the live board, so it needs a realtime-compatible key.
// Falls back to the publishable key if the anon var isn't set (REST still works;
// realtime just won't).

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createBrowserClient(url, key);
  return client;
}
