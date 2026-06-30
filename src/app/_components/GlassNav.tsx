import Link from "next/link";

// Floating pill-shaped glassmorphism nav (warm/light tokens). A single
// rounded-full translucent glass container that lays out its items horizontally;
// the ACTIVE item renders inside a lighter rounded-full "pill" highlight.
//
// Presentational + server-safe: active state is passed per-item (`current`), not
// derived from client routing, so this stays a server component everywhere.
//
// Glass recipe (matches the How-it-works/About glass this round):
//   container: bg-paper-2/60 backdrop-blur-md border border-line/70
//              ring-1 ring-white/40 shadow
//   active pill: bg-paper/85 + soft inset white specular highlight + text-ink
//   inactive: text-ink-soft → hover:text-ink

// Shared glass-container classes. Use on the <nav> (or wrapper) that holds items.
export const glassPillContainer =
  "inline-flex items-center gap-1 rounded-full border border-line/70 bg-paper-2/60 p-1 ring-1 ring-white/40 shadow-sm backdrop-blur-md";

// Active "raised" pill: lighter fill + a soft inset specular highlight.
const activePillClasses =
  "rounded-full bg-paper/85 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.06)]";

// Inactive item: plain, calm, hover lifts ink.
const inactiveClasses = "rounded-full text-ink-soft hover:text-ink";

const itemBase =
  "px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1 focus-visible:ring-offset-paper-2";

function itemClasses(current: boolean): string {
  return `${itemBase} ${current ? activePillClasses : inactiveClasses}`;
}

// A Next <Link> nav item with active-pill support.
export function GlassNavLink({
  href,
  label,
  current = false,
}: {
  href: string;
  label: string;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={itemClasses(current)}
    >
      {label}
    </Link>
  );
}

// A plain anchor nav item (landing in-page anchors). No active route concept.
export function GlassNavAnchor({
  href,
  label,
  current = false,
}: {
  href: string;
  label: string;
  current?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      className={itemClasses(current)}
    >
      {label}
    </a>
  );
}

// The floating glass pill container. Pass nav items (links/anchors/buttons) as
// children. Renders a real <nav> with an accessible label.
export function GlassNav({
  ariaLabel,
  children,
  className = "",
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={`${glassPillContainer} ${className}`}>
      {children}
    </nav>
  );
}
