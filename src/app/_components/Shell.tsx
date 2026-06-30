import { signOut } from "@/app/login/actions";
import { GlassNav, GlassNavLink } from "@/app/_components/GlassNav";

// Operator-console shell: SYS:: system bar + floating glass-pill nav. Reused by
// all human screens. Calm by design — same pill component as the landing page.
export function Shell({
  children,
  active,
  workspaceName,
}: {
  children: React.ReactNode;
  active: "board" | "agents";
  workspaceName: string;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-4">
            <span className="mono text-xs uppercase tracking-[0.2em] text-orange">SYS:: AGENTBOARD</span>
            <span className="mono text-[11px] text-ink-soft">{workspaceName}</span>
          </div>
          <div className="flex items-center gap-2">
            <GlassNav ariaLabel="Console">
              <GlassNavLink href="/board" label="Board" current={active === "board"} />
              <GlassNavLink href="/board/agents" label="Agents" current={active === "agents"} />
            </GlassNav>
            {/* Sign-out sits just outside the pill as a calm trailing action. */}
            <form action={signOut}>
              <button className="mono rounded-full px-3 py-1.5 text-[11px] uppercase text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1 focus-visible:ring-offset-paper">
                sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
