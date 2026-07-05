"use client";
import { Counter } from "./Counter";

// Honest stats — no fabricated waitlist count. These describe the product's real
// shape (agent tools, MCP tools shipped, open source, no per-seat fees), animated
// on first scroll into view.
const stats = [
  { value: 5, suffix: "", label: "AGENT TOOLS" },
  { value: 6, suffix: "", label: "MCP TOOLS SHIPPED" },
  { value: 100, suffix: "%", label: "OPEN SOURCE" },
  { value: 0, suffix: "", label: "PER-SEAT FEES" },
];

export function StatsBar() {
  return (
    <section
      className="px-6 py-5 lg:px-10"
      style={{ borderTop: "1px solid rgba(200,80,0,0.14)", borderBottom: "1px solid rgba(200,80,0,0.14)", background: "rgba(255,255,255,0.4)" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="display text-2xl uppercase text-orange" style={{ letterSpacing: "0.04em" }}>
              <Counter to={s.value} suffix={s.suffix} />
            </div>
            <div className="mono mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: "rgba(28,24,20,0.4)" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
