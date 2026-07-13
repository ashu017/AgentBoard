"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Cpu } from "lucide-react";
import { GITHUB_URL } from "@/lib/site";
import { getBrowserSupabase } from "@/lib/supabase-browser";

// Sticky top nav for the landing page (operator-console aesthetic). Anchor links
// jump to the on-page sections; the wordmark links home. The primary action is
// session-aware: "Sign in" for logged-out visitors, "Open board" once a browser
// session is detected. The page is force-static, so we can't check the session
// server-side — the initial render matches the static HTML ("Sign in") and only
// flips after getSession resolves (no hydration mismatch).
export function Nav() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) setSignedIn(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 lg:px-10"
      style={{ background: "rgba(240,236,230,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(200,80,0,0.14)" }}
    >
      {/* Wordmark → home. */}
      <Link href="/" className="flex items-center gap-2.5" aria-label="AgentBoard home">
        <div
          className="flex h-6 w-6 items-center justify-center"
          style={{ background: "#e84500", clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))", boxShadow: "0 0 10px rgba(232,69,0,0.4)" }}
        >
          <Cpu size={12} style={{ color: "#fff" }} />
        </div>
        <span className="display text-[15px] uppercase tracking-[0.12em] text-ink">AgentBoard</span>
      </Link>
      <div className="hidden items-center gap-7 md:flex">
        <a href="#how-it-works" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
          How it works
        </a>
        <a href="#features" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
          Features
        </a>
        <a href="#faq" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
          FAQ
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
          GitHub
        </a>
      </div>
      {/* Session-aware primary action: Open board when signed in, else Sign in. */}
      <Link
        href={signedIn ? "/board" : "/login"}
        className="mono flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest text-paper transition-all hover:bg-orange"
        style={{ background: "#1c1814", clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)" }}
      >
        {signedIn ? "Open board" : "Sign in"} <ArrowRight size={11} />
      </Link>
    </nav>
  );
}
