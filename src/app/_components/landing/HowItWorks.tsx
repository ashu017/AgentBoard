"use client";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { LogIn, KeyRound, Cpu, ShieldCheck } from "lucide-react";

// Four-step "how it works" — mirrors the real onboarding flow (sign in → add
// agent → agents execute → you stay in control). Each tile is a square with a
// large faint icon watermark (minimal, on-brand — no stock imagery), rises in on
// scroll, gently drifts at idle, and lifts + glows on hover. All motion is
// reduced-motion aware.
const steps = [
  { num: "01", title: "SIGN IN WITH GITHUB", desc: "Create your workspace in seconds with GitHub OAuth. No credit card, no per-seat license — single-tenant and open source.", color: "#5c7a4a", Icon: LogIn },
  { num: "02", title: "ADD AN AGENT", desc: "Register each agent and copy its per-agent MCP key — a cheap, revocable machine credential, not a human user seat.", color: "#0088cc", Icon: KeyRound },
  { num: "03", title: "AGENTS EXECUTE", desc: "Paste the key into your agent. It discovers AgentBoard's tools over MCP, decomposes projects, and works its queue autonomously.", color: "#e84500", Icon: Cpu },
  { num: "04", title: "YOU STAY IN CONTROL", desc: "As agents update status and submit results, the board moves live. When one needs a human, it surfaces a review — you decide.", color: "#cc0055", Icon: ShieldCheck },
];

function StepCard({ step, index }: { step: (typeof steps)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const Icon = step.Icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      whileHover={reduce ? undefined : { y: -6 }}
      className="group relative flex flex-col overflow-hidden p-6 sm:aspect-square lg:p-8"
      style={{
        background: "#fff",
        borderTop: `2px solid ${step.color}`,
        borderLeft: "1px solid rgba(200,80,0,0.1)",
        borderRight: "1px solid rgba(200,80,0,0.1)",
        borderBottom: "1px solid rgba(200,80,0,0.1)",
        clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
        // Accent-tinted lift shadow on hover (CSS transition, cheap + smooth).
        transition: "box-shadow 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 12px 30px ${step.color}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Faint accent-tinted grid wash — a minimal "background image" that echoes
          the operator-console grid, brightening slightly on hover. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.4] transition-opacity duration-300 group-hover:opacity-70"
        style={{
          backgroundImage: `linear-gradient(${step.color}0c 1px, transparent 1px), linear-gradient(90deg, ${step.color}0c 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
        }}
      />

      {/* Large icon watermark, bottom-right. Idle float + hover scale/brighten. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 -right-3 transition-opacity duration-300 group-hover:opacity-100"
        style={{ color: step.color, opacity: 0.08 }}
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
      >
        <Icon strokeWidth={1.25} className="h-32 w-32 lg:h-40 lg:w-40" />
      </motion.div>

      {/* Step number (above the watermark). */}
      <div className="display relative text-5xl uppercase lg:text-6xl" style={{ color: step.color, opacity: 0.9, letterSpacing: "0.06em" }}>
        {step.num}
      </div>
      {/* Title + description pinned to the bottom of the square tile. */}
      <div className="relative mt-auto pt-6">
        <h3 className="display mb-2 text-base uppercase tracking-widest text-ink">{step.title}</h3>
        <p className="mono text-xs leading-relaxed lg:text-sm" style={{ color: "rgba(28,24,20,0.5)" }}>
          {step.desc}
        </p>
      </div>
    </motion.div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="flex flex-col justify-center px-6 py-16 lg:min-h-screen lg:px-10 lg:py-24"
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8">
          <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::WORKFLOW</p>
          <h2 className="display uppercase text-ink" style={{ fontSize: "clamp(18px, 2.5vw, 28px)", letterSpacing: "0.06em" }}>
            FOUR STEPS TO AUTONOMOUS WORK.
          </h2>
        </div>
        {/* 2×2 square tiles. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {steps.map((s, i) => (
            <StepCard key={s.num} step={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
