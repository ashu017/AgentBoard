"use client";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { classifySubmission, isInsertSuccess } from "@/lib/waitlist";

// Pre-launch demand capture (DECISIONS D-WAITLIST). Client-side insert so the
// landing page stays force-static — no server action, no dynamic boundary. The
// insert-only RLS policy on waitlist_signups lets the anon/publishable key write
// but never read, so this is safe to run in the browser.
//
// States: idle → submitting → done | error. A duplicate email (unique violation,
// 23505) is treated as success ("already on the list") — re-signing up is a no-op,
// not a failure the visitor should see. A filled honeypot field is silently
// dropped (bots fill hidden inputs; humans can't see it) and reports success so
// the bot gets no signal.

type Status = "idle" | "submitting" | "done" | "error";

export function WaitlistForm({ source = "hero" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    const trimmed = email.trim();
    const kind = classifySubmission(trimmed, honeypot);
    if (kind === "invalid") {
      setError("Enter a valid email address.");
      setStatus("error");
      return;
    }
    // Honeypot: a real user never fills this hidden field. Pretend success.
    if (kind === "honeypot") {
      setStatus("done");
      return;
    }

    setStatus("submitting");
    setError(null);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Sign-up is unavailable right now — please try again later.");
      setStatus("error");
      return;
    }

    const { error: insertError } = await supabase
      .from("waitlist_signups")
      .insert({ email: trimmed, source });

    // 23505 = unique_violation → already on the list. That's a success, not an error.
    if (!isInsertSuccess(insertError?.code)) {
      setError("Something went wrong — please try again.");
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <p className="mono text-sm text-st-done" role="status">
        ● You&apos;re on the list — we&apos;ll email you when it opens.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`waitlist-email-${source}`} className="sr-only">
          Email address
        </label>
        <input
          id={`waitlist-email-${source}`}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          className="min-w-0 flex-1 border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-orange focus:outline-none"
        />
        {/* Honeypot — hidden from humans, tempting to bots. aria-hidden + off-screen. */}
        <input
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="shrink-0 bg-orange px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-orange/90 disabled:opacity-60"
        >
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      {status === "error" && error && (
        <p className="text-sm text-magenta" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
