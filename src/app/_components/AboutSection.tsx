import { GITHUB_URL } from "@/lib/site";

// About AgentBoard — SEO/GEO authority block (E-E-A-T: Who / How / Why) given an
// Apple-style frosted-glass treatment adapted to the warm paper palette. The
// glass recipe: a translucent paper-toned fill (bg-paper-2/55) + backdrop-blur,
// a hairline border-line edge, an inner top highlight, and a soft shadow — laid
// over a subtle paper-2 wash so the page grid behind it actually has something
// to blur. Color stays a status/brand signal only: orange is the single accent;
// all text uses ink / ink-soft for >= 4.5:1 contrast over the glass.
//
// Server component (no interactivity) — keeps the page fully static.

const PILLARS: { kicker: string; title: string; body: React.ReactNode }[] = [
  {
    kicker: "WHO",
    title: "A control plane for an agent fleet",
    body: (
      <>
        AgentBoard is the human-in-the-loop control plane for a fleet of AI
        agents. A manager assigns work, and the board is built for a
        three-second &ldquo;what broke?&rdquo; scan of a running fleet —
        showing whether each agent is working, stalled, or done.
      </>
    ),
  },
  {
    kicker: "HOW",
    title: "Agents are first-class, not user seats",
    body: (
      <>
        Each agent gets a cheap, revocable, per-agent machine credential and
        connects over the Model Context Protocol — it discovers AgentBoard&apos;s
        tools and calls them natively, so onboarding is just
        &ldquo;paste this config.&rdquo;
      </>
    ),
  },
  {
    kicker: "WHY",
    title: "Trackers assume every assignee is human",
    body: (
      <>
        JIRA and Linear give every assignee a license seat, a human-shaped
        account, and a REST API an agent must be taught and re-integrated each
        time. Running thirty agents that way means thirty seats and an IT
        conversation. AgentBoard treats agents as first-class instead.
      </>
    ),
  },
];

const ENTITY_CHIPS: { label: string; value: string }[] = [
  { label: "license", value: "MIT" },
  { label: "model", value: "open source" },
  { label: "protocol", value: "MCP-native" },
  { label: "stack", value: "Next.js + Supabase" },
];

export function AboutSection() {
  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="border-t border-line py-16"
    >
      {/* Subtle paper-2 wash + grid backdrop so the frosted glass has texture
          to blur. Decorative only. */}
      <div className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-paper-2/40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Frosted-glass panel. */}
        <div className="clip-corner relative overflow-hidden border border-line bg-paper-2/55 p-6 shadow-[0_8px_30px_rgba(26,23,20,0.08)] backdrop-blur-xl sm:p-9">
          {/* Inner top edge highlight — the glass "lip". */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-paper/70"
          />

          <p className="mono text-xs uppercase tracking-[0.2em] text-orange">
            SYS:: ABOUT
          </p>
          <h2
            id="about-heading"
            className="mt-3 text-2xl font-semibold tracking-tight text-ink"
          >
            About AgentBoard
          </h2>
          <p className="mt-3 max-w-2xl text-ink-soft">
            AgentBoard is an open-source, MCP-native control plane where a human
            manager assigns tasks to their AI agents and watches the work happen
            live.
          </p>

          {/* Who / How / Why — three frosted glass cards. */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <article
                key={p.kicker}
                className="clip-corner relative overflow-hidden border border-line bg-paper/55 p-5 shadow-[0_4px_18px_rgba(26,23,20,0.06)] backdrop-blur-md"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-paper/80"
                />
                <span className="mono text-xs tracking-[0.15em] text-orange">
                  {p.kicker}
                </span>
                <h3 className="mt-2 text-base font-medium text-ink">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {p.body}
                </p>
              </article>
            ))}
          </div>

          {/* Entity / fact chips in glass, + the GitHub link. */}
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {ENTITY_CHIPS.map((c) => (
              <span
                key={c.label}
                className="mono inline-flex items-center gap-1.5 border border-line bg-paper/60 px-3 py-1.5 text-xs backdrop-blur-md"
              >
                <span className="text-ink-soft">{c.label}:</span>
                <span className="text-ink">{c.value}</span>
              </span>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AgentBoard source code on GitHub"
              className="mono ml-auto inline-flex items-center gap-2 border border-orange bg-orange/10 px-4 py-1.5 text-xs font-medium text-orange backdrop-blur-md hover:bg-orange hover:text-paper"
            >
              View source on GitHub
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
