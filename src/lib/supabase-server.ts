import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Human-plane server client. Cookie-bound Supabase session (the authenticated
// user's JWT) → all queries run under human-plane RLS (owner_user_id = auth.uid).
// This is the ONLY DB path for the manager UI. Never the service-role key (that
// is confined to lib/agent-db.ts for the agent plane).
// ─────────────────────────────────────────────────────────────────────────────

export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY");

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Server Components cookie writes throw; the middleware refreshes the
        // session instead, so swallowing here is the documented Supabase pattern.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component — middleware handles refresh */
        }
      },
    },
  });
}
