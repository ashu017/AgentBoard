"use client";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/_components/Modal";
import { devLogin, signInWithGitHub } from "./actions";

// Sign-in presented as a dismissable modal floating over a blurred snapshot of
// the operator console (matches the Figma reference's modal pattern). The
// landing page (/) is the natural surface behind it, so closing the modal —
// via the ✕, a backdrop click, or Esc — returns the visitor there rather than
// trapping them on a dead-end screen.
export function LoginClient({ devEnabled, oauthError }: { devEnabled: boolean; oauthError?: boolean }) {
  const router = useRouter();
  const dismiss = () => router.push("/");

  return (
    <>
      {/* Blurred operator-console backdrop so the modal reads as floating over
          the page, not as a standalone screen. The Modal's own frosted backdrop
          (blurBackdrop) dims + blurs this further. */}
      <div aria-hidden="true" className="pointer-events-none flex min-h-full items-center justify-center blur-sm">
        <div className="mono text-xs uppercase tracking-[0.3em] text-ink-soft/50">SYS:: AGENTBOARD</div>
      </div>

      <Modal
        open
        onClose={dismiss} // dismissing returns to the landing page
        title="Sign in"
        systemTag="SYS:: AGENTBOARD"
        blurBackdrop
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
