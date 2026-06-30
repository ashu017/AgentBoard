import { HOW_IT_WORKS } from "@/lib/site";

// "How it works" section — frosted-glass (Apple "liquid glass") treatment adapted
// to the warm/light operator-console palette. The glass reads as frosted *paper*,
// not dark chrome: a translucent paper-toned fill, a backdrop blur over the page
// grid + a faint token-colored wash behind the cards, a hairline border, a soft
// top highlight, and a soft drop shadow. Color stays a status signal — the only
// accent is --orange (the brand marker), used for the numbered badge + STEP tag.
//
// Content + ordering come straight from HOW_IT_WORKS (the same source the HowTo
// JSON-LD is built from) — do not fork the copy here.
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="relative overflow-hidden border-t border-line py-16"
    >
      {/* Something to blur: a subtle, token-colored radial wash behind the glass.
          Decorative only — kept faint so text contrast below the cards is safe. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 20% 0%, color-mix(in srgb, var(--orange) 9%, transparent), transparent 70%), radial-gradient(55% 55% at 100% 100%, color-mix(in srgb, var(--paper-2) 90%, transparent), transparent 65%)",
        }}
      />

      <div className="relative">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          AgentBoard proves one loop end to end: a manager assigns a task, the agent
          does it over MCP, and the board moves the moment it changes. Four steps:
        </p>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {HOW_IT_WORKS.map((step, i) => (
            <li
              key={step.name}
              // Frosted-glass card recipe:
              //  • bg-paper-2/55           translucent paper fill (lets bg show through)
              //  • backdrop-blur-md + saturate  the actual "frosted glass" blur
              //  • border border-line/70   hairline edge
              //  • ring-1 ring-white/40    crisp white-ish glass rim
              //  • shadow + inset top highlight (inline boxShadow below)
              //  • clip-corner             on-brand cut-corner operator card
              className="clip-corner group relative border border-line/70 bg-paper-2/55 p-5 ring-1 ring-white/40 backdrop-blur-md backdrop-saturate-150 transition-shadow"
              style={{
                // Soft drop shadow for lift + a thin inner highlight along the top
                // edge (the classic "light catching the glass" cue).
                boxShadow:
                  "0 1px 0 0 color-mix(in srgb, #ffffff 55%, transparent) inset, 0 10px 30px -12px color-mix(in srgb, var(--ink) 28%, transparent)",
              }}
            >
              <div className="flex items-center gap-3">
                {/* Numbered badge: solid orange circle with paper-colored numerals. */}
                <span
                  aria-hidden="true"
                  className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-semibold text-paper"
                >
                  {i + 1}
                </span>
                <span className="mono text-xs uppercase tracking-[0.15em] text-orange">
                  STEP {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <h3 className="mt-3 text-lg font-medium text-ink">{step.name}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
