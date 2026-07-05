import type { Metadata } from "next";
import Link from "next/link";
import {
  SITE_ORIGIN,
  GITHUB_URL,
  DEFINITION,
  HOW_IT_WORKS,
  FAQ,
} from "@/lib/site";
import { LandingView } from "@/app/_components/landing/LandingView";
import { WaitlistForm } from "@/app/_components/WaitlistForm";

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
    // OG image is generated from brand tokens by app/opengraph-image.tsx (Next
    // auto-detects it); twitter-image.tsx re-exports it for the Twitter card.
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

      {/* Nav + hero + stats + how-it-works + features (operator-console design,
          ported from the Figma reference — client component for the animations
          and the client-side waitlist insert). */}
      <LandingView />

      {/* SEO-critical, content-heavy sections stay server-rendered here so they're
          in the static HTML. Restyled to the terminal aesthetic. */}
      <main className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        {/* ── FAQ (AEO / FAQPage) ────────────────────────────────────────── */}
        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="py-16"
          style={{ borderTop: "1px solid rgba(200,80,0,0.1)" }}
        >
          <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::FAQ</p>
          <h2
            id="faq-heading"
            className="display mb-8 uppercase text-ink"
            style={{ fontSize: "clamp(18px, 2.5vw, 28px)", letterSpacing: "0.06em" }}
          >
            Frequently asked questions
          </h2>
          <div className="mx-auto max-w-3xl divide-y" style={{ borderColor: "rgba(200,80,0,0.12)" }}>
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="mono flex cursor-pointer items-center justify-between gap-4 text-sm font-bold uppercase tracking-wide text-ink marker:content-['']">
                  {item.q}
                  <span aria-hidden="true" className="mono text-orange transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mono mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* ── FINAL CTA ──────────────────────────────── */}
      <section className="px-6 py-20 lg:px-10" style={{ borderTop: "1px solid rgba(200,80,0,0.14)" }}>
        <div
          className="mx-auto max-w-2xl p-10 text-center"
          style={{
            background: "#ffffff",
            borderTop: "2px solid #e84500",
            borderLeft: "1px solid rgba(200,80,0,0.15)",
            borderRight: "1px solid rgba(200,80,0,0.15)",
            borderBottom: "1px solid rgba(200,80,0,0.15)",
            clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
          }}
        >
          <p className="mono mb-3 text-[10px] uppercase tracking-widest text-orange">QUEUE::FINAL_CALL</p>
          <h2 className="display mb-4 uppercase text-ink" style={{ fontSize: "clamp(18px, 3vw, 28px)", letterSpacing: "0.06em" }}>
            Ready to command your agents?
          </h2>
          <p className="mono mx-auto mb-8 max-w-md text-sm leading-relaxed text-ink-soft">
            {DEFINITION} Join the waitlist for early access.
          </p>
          <div className="flex justify-center">
            <WaitlistForm source="final-cta" variant="terminal" />
          </div>
        </div>
      </section>

      {/* ── Footer (SEO internal links + Organization) — the calmer previous
          footer: filled paper band, readable links, wordmark + MIT line. ───── */}
      <footer className="border-t border-line bg-paper-2/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#features" className="hover:text-ink">
              Features
            </a>
            <a href="#faq" className="hover:text-ink">
              FAQ
            </a>
            <a href={GITHUB_URL} className="hover:text-ink" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </nav>
          <p className="mono text-xs text-ink-soft">AgentBoard · open source · MIT</p>
        </div>
      </footer>
    </div>
  );
}
