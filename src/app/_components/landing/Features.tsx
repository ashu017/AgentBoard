"use client";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { Users, MessageSquare, Activity } from "lucide-react";
import { AgentRosterFeature, ApprovalFeature, LiveFeedFeature } from "./FeatureDemos";

// A single feature card: icon + title + tagline + an animated demo (children).
// Rises in on scroll.
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

export function Features() {
  return (
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
  );
}
