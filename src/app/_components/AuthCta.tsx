"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

// Session-aware CTA for the force-static landing page. The page can't check the
// session server-side (it must stay static for SEO/LCP), so this client component
// detects a browser session after mount and swaps "Sign in" → "Go to board".
// Pre-mount / no-session render matches the static HTML ("Sign in") so crawlers and
// logged-out visitors see the unchanged marketing page and there's no hydration
// mismatch — we only flip state after the async getSession resolves.

type Variant = "header" | "hero";

const CLASSES: Record<Variant, string> = {
  header:
    "justify-self-end rounded-full bg-orange px-4 py-1.5 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-orange/90",
  hero: "bg-orange px-5 py-2.5 text-sm font-medium text-paper",
};

const SIGN_IN_LABEL: Record<Variant, string> = {
  header: "Sign in",
  hero: "Sign in with GitHub",
};

export function AuthCta({ variant }: { variant: Variant }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) {
        setSignedIn(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const className = CLASSES[variant];

  if (signedIn) {
    return (
      <Link href="/board" className={className}>
        Go to board
      </Link>
    );
  }

  return (
    <Link href="/login" className={className}>
      {SIGN_IN_LABEL[variant]}
    </Link>
  );
}
