import type { Metadata } from "next";
import Link from "next/link";
import {
  SITE_ORIGIN,
  GITHUB_URL,
  DEFINITION,
  TAGLINE,
  HOW_IT_WORKS,
  FAQ,
} from "@/lib/site";
import { AgentBoardPixelHero } from "@/components/ui/animated-hero-section";
import { HowItWorks } from "@/app/_components/HowItWorks";
import { AboutSection } from "@/app/_components/AboutSection";
import { GlassNav, GlassNavAnchor, GlassNavLink } from "@/app/_components/GlassNav";

// Public marketing landing. Fully static — no session, no DB — so it renders for
// logged-out visitors without redirecting and gets the fast-LCP SEO win the app
// pages can't have. Logged-in visitors see the same page plus a "Go to board"
// affordance (not a forced redirect — they may want the marketing page).
export const dynamic = "force-static";

const TITLE = "AgentBoard — Open-source MCP control plane for AI agents";
const DESCRIPTION =
  "AgentBoard is an open-source, MCP-native control plane where you assign tasks to your AI agents and watch them work live. Free, self-hostable, agent-native.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_ORIGIN,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "AgentBoard",
    // TODO: replace with a real branded OG image (1200x630). Until then Next
    // falls back to no image; the card still renders with title + description.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// ── JSON-LD structured data (content MUST match the visible copy) ─────────────
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AgentBoard",
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/favicon.ico`,
  description: DEFINITION,
  sameAs: [GITHUB_URL],
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "AgentBoard",
  url: SITE_ORIGIN,
  description: DESCRIPTION,
};

const howToLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to assign tasks to AI agents with AgentBoard",
  description:
    "Connect your AI agents to AgentBoard over MCP and watch them work the tasks you assign, live.",
  step: HOW_IT_WORKS.map((s, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: s.name,
    text: s.text,
  })),
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Structured data is static, built from our own constants — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <JsonLd data={organizationLd} />
      <JsonLd data={websiteLd} />
      <JsonLd data={howToLd} />
      <JsonLd data={faqLd} />

      {/* ── System bar / floating glass-pill nav ─────────────────────────── */}
      <header className="sticky top-0 z-20">
        {/* Three-zone header: wordmark hard-left, glass nav truly centered
            (grid 1fr/auto/1fr so the center cell is centered relative to the
            whole header, not just "between" the side widths), Sign in hard-right. */}
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-3 sm:px-8 lg:px-12">
          <span className="mono justify-self-start text-xs uppercase tracking-[0.2em] text-orange">
            SYS:: AGENTBOARD
          </span>
          {/* On narrow screens the center nav is hidden to avoid a cramped
              3-col squeeze; the wordmark + Sign in still anchor the header. */}
          <div className="hidden justify-self-center md:block">
            <GlassNav ariaLabel="Primary">
              <GlassNavAnchor href="#how-it-works" label="How it works" />
              <GlassNavAnchor href="#about" label="About" />
              <GlassNavAnchor href="#faq" label="FAQ" />
              <GlassNavLink href="/board" label="Go to board" />
            </GlassNav>
          </div>
          {/* Primary action stays a solid orange CTA, anchored to the right. */}
          <Link
            href="/login"
            className="justify-self-end rounded-full bg-orange px-4 py-1.5 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-orange/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 sm:px-8 lg:px-12">
        {/* ── Hero (GEO + SEO value prop) ────────────────────────────────── */}
        <section aria-labelledby="hero-heading" className="py-16 sm:py-24">
          <p className="mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            SYS:: LIVE · agent-native control plane
          </p>
          <h1
            id="hero-heading"
            className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
          >
            Assign tasks to your AI agents over MCP and watch them work, live.
          </h1>
          {/* GEO: lead with the plain, declarative definition in the first 100 words. */}
          <p className="mt-5 max-w-2xl text-lg text-ink">{DEFINITION}</p>
          <p className="mt-3 max-w-2xl text-base text-ink-soft">{TAGLINE}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="bg-orange px-5 py-2.5 text-sm font-medium text-paper"
            >
              Sign in with GitHub
            </Link>
            <a
              href="#how-it-works"
              className="mono border border-line px-5 py-2.5 text-sm text-ink-soft hover:text-ink"
            >
              How it works ↓
            </a>
          </div>

          {/* Animated operator-console hero: a contained, decorative pixel-Pong
              canvas spelling AGENTBOARD on the paper surface. Decorative only —
              the real <h1> above is the accessible/SEO heading. */}
          <div className="clip-corner mt-12 border border-line bg-paper p-1.5">
            <div className="relative h-[360px] w-full sm:h-[440px]">
              <AgentBoardPixelHero />
            </div>
          </div>

          {/* Calm operator-console visual: a static board-preview strip. */}
          <div
            aria-hidden="true"
            className="clip-corner mt-4 border border-line bg-paper-2 p-4"
          >
            <div className="mono flex items-center gap-3 text-xs text-ink-soft">
              <span className="text-st-done">● LIVE</span>
              <span>all healthy</span>
              <span className="ml-auto">3 in progress · 1 in review · 12 done</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Todo", color: "var(--st-todo)", n: 4 },
                { label: "In progress", color: "var(--st-progress)", n: 3 },
                { label: "In review", color: "var(--st-review)", n: 1 },
                { label: "Done", color: "var(--st-done)", n: 12 },
              ].map((c) => (
                <div key={c.label} className="border border-line bg-paper p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: c.color }}
                      />
                      {c.label}
                    </span>
                    <span className="mono text-xs text-ink-soft">{c.n}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works (AEO / HowTo) ─────────────────────────────────── */}
        <HowItWorks />

        {/* ── About (SEO/GEO authority — E-E-A-T + entity) ───────────────── */}
        <AboutSection />

        {/* ── FAQ (AEO / FAQPage) ────────────────────────────────────────── */}
        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="border-t border-line py-16"
        >
          <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
          <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium marker:content-['']">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="mono text-ink-soft transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-2xl text-sm text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer (SEO internal links + Organization) ───────────────────── */}
      <footer className="border-t border-line bg-paper-2/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 sm:px-8 lg:px-12 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft"
          >
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#about" className="hover:text-ink">
              About
            </a>
            <a href="#faq" className="hover:text-ink">
              FAQ
            </a>
            <a
              href={GITHUB_URL}
              className="hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </nav>
          <p className="mono text-xs text-ink-soft">
            AgentBoard · open source · MIT
          </p>
        </div>
      </footer>
    </div>
  );
}
