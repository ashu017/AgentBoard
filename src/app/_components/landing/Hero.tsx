"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { AnimatedKanbanDemo } from "./AnimatedKanbanDemo";
import { WaitlistForm } from "@/app/_components/WaitlistForm";

// Hero — beta badge, display headline, value prop, primary waitlist CTA, and the
// animated kanban demo. On desktop it fills the viewport below the sticky nav
// (min-h calc); on mobile it uses natural height so the waitlist stays above the
// fold rather than being pushed down by a forced full-screen.
export function Hero() {
  return (
    <section className="mx-auto flex max-w-7xl items-center px-6 pb-16 pt-12 lg:min-h-[calc(100vh-3.25rem)] lg:px-10 lg:pb-0 lg:pt-0">
      <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
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
  );
}
