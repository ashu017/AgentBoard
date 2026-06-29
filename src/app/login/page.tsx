import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { devLoginEnabled } from "@/lib/dev-flags";
import { devLogin } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const devEnabled = devLoginEnabled();

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="clip-corner w-full max-w-md border border-line bg-paper-2 p-8">
        <div className="mono text-xs uppercase tracking-[0.2em] text-ink-soft">SYS:: AGENTBOARD</div>
        <h1 className="mt-3 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The human-in-the-loop control plane for a fleet of AI agents.
        </p>

        <div className="mt-6 space-y-3">
          {/* GitHub OAuth (Phase 3b — wired once the OAuth app exists). */}
          <button
            disabled
            className="w-full cursor-not-allowed border border-line px-4 py-2.5 text-sm text-ink-soft opacity-60"
            title="Configured in Phase 3b"
          >
            Continue with GitHub
            <span className="mono ml-2 text-[10px] uppercase">soon</span>
          </button>

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
      </div>
    </main>
  );
}
