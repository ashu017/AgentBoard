"use client";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/_components/Modal";
import { devLogin, signInWithGitHub } from "./actions";

// Sign-in presented as a dismissable modal in the shared "figma" variant — the
// same operator-console dialog look (warm tan-blur backdrop, near-white panel,
// orange border + corner notches, display-font title) used by every board
// modal, so sign-in reads as part of the same system. The landing page (/) is
// the natural surface behind it, so closing the modal — via the ✕, a backdrop
// click, or Esc — returns the visitor there rather than trapping them on a
// dead-end screen.
export function LoginClient({ devEnabled, oauthError }: { devEnabled: boolean; oauthError?: boolean }) {
  const router = useRouter();
  const dismiss = () => router.push("/");

  return (
    <Modal
      open
      onClose={dismiss} // dismissing returns to the landing page
      title="Sign in"
      systemTag="SYS:: AGENTBOARD"
      variant="figma"
    >
        <p className="text-sm text-ink-soft">
          The human-in-the-loop control plane for a fleet of AI agents.
        </p>

        {oauthError && (
          <p className="mt-3 text-sm text-magenta">Sign-in failed. Please try again.</p>
        )}

        <div className="mt-5 space-y-3">
          <form action={signInWithGitHub}>
            <SubmitButton
              className="w-full border border-ink bg-ink text-paper hover:opacity-90"
              pendingLabel="Connecting to GitHub…"
            >
              Continue with GitHub
            </SubmitButton>
          </form>

          {devEnabled && (
            <form action={devLogin}>
              <SubmitButton
                className="w-full bg-orange text-paper"
                pendingLabel="Signing in…"
              >
                Dev sign-in
                <span className="mono ml-2 text-[10px] uppercase opacity-80">local</span>
              </SubmitButton>
            </form>
          )}
        </div>

        {devEnabled && (
          <p className="mono mt-4 text-[11px] text-ink-soft">
            DEV_LOGIN active — local only. GitHub OAuth replaces this in production.
          </p>
        )}
    </Modal>
  );
}

// Submit button that reflects the form's pending state (useFormStatus): while the
// server action runs (and, for GitHub, the redirect to the provider is in flight)
// it disables, dims, shows a spinner + a shimmer sweep, and swaps to a pending
// label — so the user gets immediate feedback instead of a dead click.
function SubmitButton({
  children,
  className = "",
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`relative flex items-center justify-center overflow-hidden px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-wait disabled:opacity-80 ${className}`}
    >
      {/* Shimmer sweep while pending. */}
      {pending && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.1s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
      )}
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {pendingLabel}
        </span>
      ) : (
        <span className="flex items-center">{children}</span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
