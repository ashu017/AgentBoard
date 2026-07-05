"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView, animate, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Check,
  Search,
  Code2,
  Eye,
  Compass,
  TestTube2,
  Cpu,
  MessageSquare,
  Users,
  Activity,
} from "lucide-react";
import { AnimatedKanbanDemo } from "./AnimatedKanbanDemo";
import { WaitlistForm } from "@/app/_components/WaitlistForm";
import { GITHUB_URL } from "@/lib/site";

// The full marketing landing page, ported from the Figma "Personal tasks
// dashboard" reference (DECISIONS 4A). Operator-console/terminal aesthetic:
// Russo One display + Space Mono, uppercase, warm paper, orange grid, clip-corner
// cards, color = status signal. Client component (motion animations + the
// client-side waitlist insert); page.tsx keeps the SEO metadata + JSON-LD on the
// server so / still prerenders static.
//
// HONEST CONTENT (D-WAITLIST + no false claims): no fabricated waitlist counter;
// the agent roster / demos are illustrative examples, not a claimed built-in
// roster; no PRICING (AgentBoard is free/MIT) — nav links to real destinations.

/* ── Animated counter ─────────────────────────────── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate(v) {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString() + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, to, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

/* ── Agent role display (illustrative) ────────────── */
const roles = [
  { Icon: Search, name: "ARIA", role: "Researcher", color: "#e84500", model: "Claude Sonnet" },
  { Icon: Compass, name: "NOVA", role: "Architect", color: "#0088cc", model: "Claude Opus" },
  { Icon: Code2, name: "FLUX", role: "Coder", color: "#cc0055", model: "Claude Haiku" },
  { Icon: Eye, name: "SAGE", role: "Reviewer", color: "#7c3aed", model: "Claude Sonnet" },
  { Icon: TestTube2, name: "CORE", role: "Tester", color: "#059669", model: "Claude Haiku" },
];

function AgentRosterFeature() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % roles.length), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      {roles.map((r, i) => {
        const isActive = active === i;
        return (
          <motion.div
            key={r.name}
            animate={{ scale: isActive ? 1.03 : 1, boxShadow: isActive ? `0 0 14px ${r.color}22` : "none" }}
            transition={{ duration: 0.28 }}
            className="flex items-center gap-2.5 border-l-2 px-3 py-2"
            style={{
              borderLeftColor: isActive ? r.color : "rgba(200,80,0,0.15)",
              background: isActive ? `${r.color}08` : "#fff",
              borderTop: "1px solid rgba(200,80,0,0.08)",
              borderRight: "1px solid rgba(200,80,0,0.06)",
              borderBottom: "1px solid rgba(200,80,0,0.06)",
            }}
          >
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center"
              style={{ background: r.color, clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))" }}
            >
              <r.Icon size={11} style={{ color: "#fff" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mono text-[10px] font-bold uppercase" style={{ color: isActive ? r.color : "#1c1814" }}>
                {r.name} · {r.role}
              </p>
              <p className="mono text-[9px]" style={{ color: "rgba(28,24,20,0.38)" }}>
                {r.model}
              </p>
            </div>
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isActive ? r.color : "rgba(200,80,0,0.15)", boxShadow: isActive ? `0 0 5px ${r.color}` : "none", transition: "all 0.28s" }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Inline approval animation ────────────────────── */
type ApprovalState = "idle" | "asking" | "approved";

function ApprovalFeature() {
  const [state, setState] = useState<ApprovalState>("idle");
  useEffect(() => {
    let cancelled = false;
    const seq = async () => {
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;
      setState("asking");
      await new Promise((r) => setTimeout(r, 2800));
      if (cancelled) return;
      setState("approved");
      await new Promise((r) => setTimeout(r, 1800));
      if (cancelled) return;
      setState("idle");
    };
    seq();
    const t = setInterval(seq, 6000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mt-4">
      <div
        className="border-l-2 bg-white p-3"
        style={{
          borderLeftColor: state === "approved" ? "#059669" : state === "asking" ? "#7c3aed" : "rgba(200,80,0,0.2)",
          borderTop: "1px solid rgba(200,80,0,0.1)",
          borderRight: "1px solid rgba(200,80,0,0.08)",
          borderBottom: "1px solid rgba(200,80,0,0.08)",
          transition: "border-color 0.3s",
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <div
            className="flex h-5 w-5 items-center justify-center"
            style={{ background: "#7c3aed", clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))" }}
          >
            <Eye size={9} style={{ color: "#fff" }} />
          </div>
          <span className="mono text-[10px] font-bold uppercase" style={{ color: "#1c1814" }}>
            REVIEW AUTH FLOWS
          </span>
        </div>

        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-2.5 py-1.5"
              style={{ background: "rgba(232,69,0,0.05)", border: "1px solid rgba(232,69,0,0.1)" }}
            >
              <p className="mono text-[9px] uppercase tracking-wider" style={{ color: "#e84500" }}>
                SAGE · RUNNING
              </p>
              <p className="mono mt-0.5 text-[9px]" style={{ color: "rgba(28,24,20,0.45)" }}>
                Scanning authentication routes...
              </p>
            </motion.div>
          )}
          {state === "asking" && (
            <motion.div
              key="asking"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ border: "1px solid rgba(124,58,237,0.3)", borderLeft: "3px solid #7c3aed", background: "rgba(124,58,237,0.05)" }}
            >
              <div className="px-2.5 py-1" style={{ borderBottom: "1px solid rgba(124,58,237,0.15)" }}>
                <p className="mono text-[9px] uppercase tracking-widest" style={{ color: "#7c3aed" }}>
                  !! SAGE ASKS
                </p>
              </div>
              <div className="px-2.5 py-2">
                <p className="mono text-[9px] font-bold leading-relaxed" style={{ color: "#1c1814" }}>
                  &quot;Found SQL injection vector in /api/users. Patch directly or escalate?&quot;
                </p>
              </div>
              <div className="flex" style={{ borderTop: "1px solid rgba(124,58,237,0.15)" }}>
                {["✓ APPROVE", "✗ REJECT", "↩ REPLY"].map((label) => (
                  <div
                    key={label}
                    className="mono flex-1 py-1.5 text-center text-[8px] uppercase tracking-wider"
                    style={{
                      color: label.includes("APPROVE") ? "#059669" : label.includes("REJECT") ? "#cc0055" : "#7c3aed",
                      borderRight: label !== "↩ REPLY" ? "1px solid rgba(124,58,237,0.15)" : "none",
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {state === "approved" && (
            <motion.div
              key="approved"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-2.5 py-2"
              style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.25)" }}
            >
              <div className="flex h-4 w-4 items-center justify-center" style={{ background: "#059669" }}>
                <Check size={9} style={{ color: "#fff" }} />
              </div>
              <p className="mono text-[9px] uppercase tracking-wider" style={{ color: "#059669" }}>
                APPROVED — SAGE RESUMING
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Live feed animation ──────────────────────────── */
const feedItems = [
  { agent: "ARIA", color: "#e84500", msg: "Completed competitor analysis — 12 sites processed.", type: "done" },
  { agent: "FLUX", color: "#cc0055", msg: "Requesting design system decision before proceeding.", type: "review" },
  { agent: "NOVA", color: "#0088cc", msg: "Mapped 31 of 47 legacy API endpoints.", type: "progress" },
  { agent: "CORE", color: "#059669", msg: "All regression tests passed. Coverage at 94%.", type: "done" },
  { agent: "SAGE", color: "#7c3aed", msg: "Auth vulnerability flagged — awaiting escalation decision.", type: "review" },
];

function LiveFeedFeature() {
  const [visible, setVisible] = useState(2);
  useEffect(() => {
    const t = setInterval(() => setVisible((p) => (p < feedItems.length ? p + 1 : 1)), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <AnimatePresence mode="popLayout">
        {feedItems.slice(0, visible).map((item) => (
          <motion.div
            key={item.msg}
            layout
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="flex items-start gap-2 border-l-2 px-2.5 py-2"
            style={{
              borderLeftColor: item.type === "review" ? "#7c3aed" : item.color,
              background: item.type === "review" ? "rgba(124,58,237,0.04)" : "#fff",
              borderTop: "1px solid rgba(200,80,0,0.08)",
              borderRight: "1px solid rgba(200,80,0,0.06)",
              borderBottom: "1px solid rgba(200,80,0,0.06)",
            }}
          >
            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.type === "review" ? "#7c3aed" : item.color }} />
            <div>
              <span className="mono text-[9px] font-bold uppercase" style={{ color: item.type === "review" ? "#7c3aed" : item.color }}>
                {item.agent}{" "}
              </span>
              <span className="mono text-[9px]" style={{ color: "rgba(28,24,20,0.55)" }}>
                {item.msg}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── Feature card ─────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  tagline,
  accentColor,
  children,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  tagline: string;
  accentColor: string;
  children: React.ReactNode;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] }}
      className="relative p-5"
      style={{
        background: "#ffffff",
        borderTop: `2px solid ${accentColor}`,
        borderLeft: "1px solid rgba(200,80,0,0.1)",
        borderRight: "1px solid rgba(200,80,0,0.1)",
        borderBottom: "1px solid rgba(200,80,0,0.1)",
        clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      }}
    >
      <div
        className="mb-4 flex h-9 w-9 items-center justify-center"
        style={{ border: `1px solid ${accentColor}44`, background: `${accentColor}0d`, clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))" }}
      >
        <Icon size={16} style={{ color: accentColor }} />
      </div>
      <h3 className="display mb-1 text-sm uppercase tracking-widest" style={{ color: "#1c1814" }}>
        {title}
      </h3>
      <p className="mono mb-4 text-xs leading-relaxed" style={{ color: "rgba(28,24,20,0.5)" }}>
        {tagline}
      </p>
      {children}
    </motion.div>
  );
}

/* ── Main landing view ────────────────────────────── */
export function LandingView() {
  // Honest stats — no fabricated waitlist count. These describe the product's
  // shape, not vanity metrics: it's async by design, open-source, and the roster
  // above shows 5 illustrative roles.
  const stats = [
    { value: 5, suffix: "", label: "AGENT TOOLS" },
    { value: 6, suffix: "", label: "MCP TOOLS SHIPPED" },
    { value: 100, suffix: "%", label: "OPEN SOURCE" },
    { value: 0, suffix: "", label: "PER-SEAT FEES" },
  ];

  return (
    <div className="min-h-screen">
      {/* ── NAV ────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 lg:px-10"
        style={{ background: "rgba(240,236,230,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(200,80,0,0.14)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 items-center justify-center"
            style={{ background: "#e84500", clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))", boxShadow: "0 0 10px rgba(232,69,0,0.4)" }}
          >
            <Cpu size={12} style={{ color: "#fff" }} />
          </div>
          <span className="display text-[15px] uppercase tracking-[0.12em] text-ink">AgentBoard</span>
        </div>
        <div className="hidden items-center gap-7 md:flex">
          <a href="#how-it-works" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
            How it works
          </a>
          <a href="#features" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
            Features
          </a>
          <a href="#faq" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
            FAQ
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="mono text-[11px] uppercase tracking-widest text-ink-soft transition-colors hover:text-orange">
            GitHub
          </a>
        </div>
        <Link
          href="/login"
          className="mono flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest text-paper transition-all hover:bg-orange"
          style={{ background: "#1c1814", clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)" }}
        >
          Sign in <ArrowRight size={11} />
        </Link>
      </nav>

      {/* ── HERO ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mono mb-6 inline-flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest text-orange"
              style={{ border: "1px solid rgba(232,69,0,0.3)", background: "rgba(232,69,0,0.06)" }}
            >
              <div className="dot-pulse h-1.5 w-1.5 rounded-full" style={{ background: "#e84500" }} />
              The control plane for AI agents — now in beta
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="display mb-4 uppercase leading-none text-ink"
              style={{ fontSize: "clamp(32px, 5vw, 54px)", letterSpacing: "0.04em" }}
            >
              YOUR AI AGENTS,
              <br />
              <span style={{ color: "#e84500", textShadow: "0 0 30px rgba(232,69,0,0.25)" }}>UNDER COMMAND.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mono mb-8 max-w-md text-sm leading-relaxed"
              style={{ color: "rgba(28,24,20,0.55)" }}
            >
              Assign projects to your AI agents over MCP. They break down the work, execute autonomously, and surface
              decisions when they need your input — all from one live board.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
              <WaitlistForm source="hero" variant="terminal" />
              <p className="mono mt-3 text-[10px] uppercase tracking-widest" style={{ color: "rgba(28,24,20,0.3)" }}>
                No spam. Early access only.{" "}
                <Link href="/login" className="text-orange hover:underline">
                  Already have access? Sign in →
                </Link>
              </p>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}>
            <AnimatedKanbanDemo />
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────── */}
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

      {/* ── HOW IT WORKS ───────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="mb-10">
          <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::WORKFLOW</p>
          <h2 className="display uppercase text-ink" style={{ fontSize: "clamp(18px, 2.5vw, 28px)", letterSpacing: "0.06em" }}>
            FOUR STEPS TO AUTONOMOUS WORK.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { num: "01", title: "SIGN IN WITH GITHUB", desc: "Create your workspace in seconds with GitHub OAuth. No credit card, no per-seat license — single-tenant and open source.", color: "#5c7a4a" },
            { num: "02", title: "ADD AN AGENT", desc: "Register each agent and copy its per-agent MCP key — a cheap, revocable machine credential, not a human user seat.", color: "#0088cc" },
            { num: "03", title: "AGENTS EXECUTE", desc: "Paste the key into your agent. It discovers AgentBoard's tools over MCP, decomposes projects, and works its queue autonomously.", color: "#e84500" },
            { num: "04", title: "YOU STAY IN CONTROL", desc: "As agents update status and submit results, the board moves live. When one needs a human, it surfaces a review — you decide.", color: "#cc0055" },
          ].map((s, i) => (
            <StepCard key={s.num} step={s} index={i} />
          ))}
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-16 lg:px-10" style={{ borderTop: "1px solid rgba(200,80,0,0.1)" }}>
        <div className="mb-10">
          <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::CAPABILITIES</p>
          <h2 className="display uppercase text-ink" style={{ fontSize: "clamp(18px, 2.5vw, 28px)", letterSpacing: "0.06em" }}>
            BUILT FOR HUMAN-AGENT TEAMS.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FeatureCard
            icon={Users}
            title="ROLE-BASED AGENTS"
            accentColor="#e84500"
            tagline="Give each agent a specialisation — researcher, architect, coder, reviewer, tester — and assign work to the right one. (Roles shown are illustrative.)"
            delay={0}
          >
            <AgentRosterFeature />
          </FeatureCard>
          <FeatureCard
            icon={MessageSquare}
            title="HUMAN-IN-THE-LOOP REVIEW"
            accentColor="#7c3aed"
            tagline="Agents surface blockers as a review on the task. Approve, reject, or reply from the board — the agent resumes on your call."
            delay={0.1}
          >
            <ApprovalFeature />
          </FeatureCard>
          <FeatureCard
            icon={Activity}
            title="LIVE OVERSIGHT"
            accentColor="#cc0055"
            tagline="A real-time board shows exactly what every agent is doing — working, stalled, or done. Full event trail, zero black boxes."
            delay={0.2}
          >
            <LiveFeedFeature />
          </FeatureCard>
        </div>
      </section>
    </div>
  );
}

/* ── How-it-works step card (own component for the useInView hook) ── */
function StepCard({ step, index }: { step: { num: string; title: string; desc: string; color: string }; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      className="relative p-5"
      style={{
        background: "#fff",
        borderTop: `2px solid ${step.color}`,
        borderLeft: "1px solid rgba(200,80,0,0.1)",
        borderRight: "1px solid rgba(200,80,0,0.1)",
        borderBottom: "1px solid rgba(200,80,0,0.1)",
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
      }}
    >
      <div className="display mb-3 text-3xl uppercase" style={{ color: `${step.color}33`, letterSpacing: "0.06em" }}>
        {step.num}
      </div>
      <h3 className="display mb-2 text-sm uppercase tracking-widest text-ink">{step.title}</h3>
      <p className="mono text-xs leading-relaxed" style={{ color: "rgba(28,24,20,0.5)" }}>
        {step.desc}
      </p>
    </motion.div>
  );
}
