import Link from "next/link";
import { signOut } from "@/app/login/actions";

// Operator-console shell: SYS:: system bar + nav. Reused by all human screens.
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
      <header className="border-b border-line bg-paper-2/70">
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-4">
            <span className="mono text-xs uppercase tracking-[0.2em] text-orange">SYS:: AGENTBOARD</span>
            <span className="mono text-[11px] text-ink-soft">{workspaceName}</span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/board" label="Board" current={active === "board"} />
            <NavLink href="/board/agents" label="Agents" current={active === "agents"} />
            <form action={signOut} className="ml-2">
              <button className="mono text-[11px] uppercase text-ink-soft hover:text-ink">
                sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NavLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`px-3 py-1.5 text-sm ${
        current ? "border-b-2 border-orange font-medium text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
