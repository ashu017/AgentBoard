import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

// OAuth callback: Supabase redirects here with `?code=...` after GitHub auth.
// We exchange the code for a session (sets the auth cookies), then send the user
// to the board. On error, back to /login with a flag.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets us return the user where they started; default to the board.
  const next = searchParams.get("next") ?? "/board";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Prefer the forwarded host on Vercel (origin can be the internal URL).
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      const base = isLocal ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
