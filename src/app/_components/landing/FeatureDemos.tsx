"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Search, Code2, Eye, Compass, TestTube2, Check } from "lucide-react";

// The three animated in-card demos for the Features section. Content is
// illustrative (example agents/tasks), not a claimed built-in roster.

/* ── Agent roster (cycles a highlighted role) ─────── */
const roles = [
  { Icon: Search, name: "ARIA", role: "Researcher", color: "#e84500", model: "Claude Sonnet" },
  { Icon: Compass, name: "NOVA", role: "Architect", color: "#0088cc", model: "Claude Opus" },
  { Icon: Code2, name: "FLUX", role: "Coder", color: "#cc0055", model: "Claude Haiku" },
  { Icon: Eye, name: "SAGE", role: "Reviewer", color: "#7c3aed", model: "Claude Sonnet" },
  { Icon: TestTube2, name: "CORE", role: "Tester", color: "#059669", model: "Claude Haiku" },
];

export function AgentRosterFeature() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return; // static: keep the first role highlighted, no cycling
    const t = setInterval(() => setActive((p) => (p + 1) % roles.length), 1100);
    return () => clearInterval(t);
  }, [reduce]);
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

/* ── Inline approval sequence (idle → asks → approved) ── */
type ApprovalState = "idle" | "asking" | "approved";

export function ApprovalFeature() {
  const reduce = useReducedMotion();
  // Reduced-motion: pin to the "asking" frame (the most representative
  // human-in-the-loop state) via the lazy initial value; no looping effect.
  const [state, setState] = useState<ApprovalState>(reduce ? "asking" : "idle");
  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    const seq = async () => {
      if (cancelled) return;
      setState("idle");
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
  }, [reduce]);

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

/* ── Live activity feed (rolls new items in) ──────── */
const feedItems = [
  { agent: "ARIA", color: "#e84500", msg: "Completed competitor analysis — 12 sites processed.", type: "done" },
  { agent: "FLUX", color: "#cc0055", msg: "Requesting design system decision before proceeding.", type: "review" },
  { agent: "NOVA", color: "#0088cc", msg: "Mapped 31 of 47 legacy API endpoints.", type: "progress" },
  { agent: "CORE", color: "#059669", msg: "All regression tests passed. Coverage at 94%.", type: "done" },
  { agent: "SAGE", color: "#7c3aed", msg: "Auth vulnerability flagged — awaiting escalation decision.", type: "review" },
];

export function LiveFeedFeature() {
  const reduce = useReducedMotion();
  // Reduced-motion: show the full feed at once (static, via lazy initial);
  // otherwise start with 2 and roll items in.
  const [visible, setVisible] = useState(reduce ? feedItems.length : 2);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setVisible((p) => (p < feedItems.length ? p + 1 : 1)), 1500);
    return () => clearInterval(t);
  }, [reduce]);
  // Guard against useReducedMotion resolving true only after mount: render the
  // whole feed for reduced-motion regardless of the (frozen) visible count.
  const shown = reduce ? feedItems.length : visible;
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <AnimatePresence mode="popLayout">
        {feedItems.slice(0, shown).map((item) => (
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
