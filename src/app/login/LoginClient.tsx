"use client";
import { useState } from "react";
import { Modal } from "@/app/_components/Modal";
import { devLogin, signInWithGitHub } from "./actions";

// Sign-in presented as a modal over the operator-console backdrop (matches the
// Figma reference's modal pattern). The modal is open by default on /login and
// non-dismissable (closing just reopens) — there's nothing behind it to use.
export function LoginClient({ devEnabled, oauthError }: { devEnabled: boolean; oauthError?: boolean }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      {/* Dim operator backdrop behind the modal. */}
      <div className="flex min-h-full items-center justify-center">
        <div className="mono text-xs uppercase tracking-[0.3em] text-ink-soft/50">SYS:: AGENTBOARD</div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(true)} // sign-in is required; can't dismiss past it
        title="Sign in"
        systemTag="SYS:: AGENTBOARD"
        closeOnBackdrop={false}
        hideClose
      >
        <p className="text-sm text-ink-soft">
          The human-in-the-loop control plane for a fleet of AI agents.
        </p>

        {oauthError && (
          <p className="mt-3 text-sm text-magenta">Sign-in failed. Please try again.</p>
        )}

        <div className="mt-5 space-y-3">
          <form action={signInWithGitHub}>
            <button
              type="submit"
              className="w-full border border-ink bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:opacity-90"
            >
              Continue with GitHub
            </button>
          </form>

          {devEnabled && (
            <form action={devLogin}>
              <button
                type="submit"
                className="w-full bg-orange px-4 py-2.5 text-sm font-medium text-paper"
              >
                Dev sign-in
                <span className="mono ml-2 text-[10px] uppercase opacity-80">local</span>
              </button>
            </form>
          )}
        </div>

        {devEnabled && (
          <p className="mono mt-4 text-[11px] text-ink-soft">
            DEV_LOGIN active — local only. GitHub OAuth replaces this in production.
          </p>
        )}
      </Modal>
    </>
  );
}
