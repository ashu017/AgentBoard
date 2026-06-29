"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY login. Lets us exercise the full board against the live DB before
// GitHub OAuth is wired (Phase 3b). Hard-gated on DEV_LOGIN=1 — it must never be
// enabled in production. The real flow is GitHub OAuth (one provider, v1).
// ─────────────────────────────────────────────────────────────────────────────

const DEV_EMAIL = "dev@agentboard.local";
const DEV_PASSWORD = "dev-agentboard-local-pw";

export async function devLogin(): Promise<void> {
  if (process.env.DEV_LOGIN !== "1") throw new Error("Dev login is disabled");

  // Ensure the dev user exists (idempotent), via the admin API.
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === DEV_EMAIL);
  if (!existing) {
    await admin.auth.admin.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
  }

  // Sign in on the cookie-bound server client so the session is set.
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`dev login failed: ${error.message}`);

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
