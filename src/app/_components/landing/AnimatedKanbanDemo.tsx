"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Code2, Eye, Compass, TestTube2 } from "lucide-react";

// Hero visual — a self-driving mini board where illustrative task cards flow
// queued → running → review → done, showing the core promise ("assign work,
// watch it live"). Ported from the Figma "Personal tasks dashboard" reference.
// The agents/tasks are illustrative examples, not a claimed built-in roster.
// Respects prefers-reduced-motion via the guarded interval below.

type DemoStatus = "queued" | "running" | "review" | "done";

interface DemoTask {
  id: string;
  title: string;
  agentName: string;
  agentColor: string;
  AgentIcon: React.ElementType;
  status: DemoStatus;
  isApproval?: boolean;
}

const seed: DemoTask[] = [
  { id: "d1", title: "RESEARCH UX PATTERNS", agentName: "ARIA", agentColor: "#e84500", AgentIcon: Search, status: "queued" },
  { id: "d2", title: "DESIGN COMPONENT LIB", agentName: "FLUX", agentColor: "#cc0055", AgentIcon: Code2, status: "queued" },
  { id: "d3", title: "AUDIT API ENDPOINTS", agentName: "NOVA", agentColor: "#0088cc", AgentIcon: Compass, status: "running" },
  { id: "d4", title: "REVIEW AUTH FLOWS", agentName: "SAGE", agentColor: "#7c3aed", AgentIcon: Eye, status: "review", isApproval: true },
  { id: "d5", title: "RUN REGRESSION TESTS", agentName: "CORE", agentColor: "#059669", AgentIcon: TestTube2, status: "done" },
  { id: "d6", title: "WRITE API DOCS", agentName: "NOVA", agentColor: "#0088cc", AgentIcon: Compass, status: "done" },
];

const cycle: DemoStatus[] = ["queued", "running", "review", "done", "queued"];

const cols: { status: DemoStatus; label: string; color: string }[] = [
  { status: "queued", label: "QUEUED", color: "#0088cc" },
  { status: "running", label: "RUNNING", color: "#e84500" },
  { status: "review", label: "!! REVIEW", color: "#7c3aed" },
  { status: "done", label: "DONE", color: "#059669" },
];

export function AnimatedKanbanDemo() {
  const [tasks, setTasks] = useState<DemoTask[]>(seed);
  const [glowId, setGlowId] = useState<string | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ids = seed.map((t) => t.id);
    let pick = 0;
    const interval = setInterval(() => {
      const id = ids[pick % ids.length];
      pick++;
      setGlowId(id);
      setTimeout(() => setGlowId(null), 600);
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = cycle[cycle.indexOf(t.status) + 1] ?? "queued";
          return { ...t, status: next, isApproval: next === "review" };
        })
      );
    }, 1900);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="relative w-full p-4"
      style={{
        background: "#f7f4f0",
        borderTop: "2px solid #e84500",
        borderLeft: "1px solid rgba(200,80,0,0.15)",
        borderRight: "1px solid rgba(200,80,0,0.15)",
        borderBottom: "1px solid rgba(200,80,0,0.15)",
        clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
        boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
      }}
    >
      {/* Top bar */}
      <div className="mb-4 flex items-center gap-2 pb-2.5" style={{ borderBottom: "1px solid rgba(200,80,0,0.1)" }}>
        <div className="flex gap-1.5">
          <div className="h-2 w-2" style={{ background: "#cc0055", boxShadow: "0 0 4px #cc0055" }} />
          <div className="h-2 w-2" style={{ background: "#e84500", boxShadow: "0 0 4px #e84500" }} />
          <div className="h-2 w-2" style={{ background: "#0088cc", boxShadow: "0 0 4px #0088cc" }} />
        </div>
        <span className="mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(28,24,20,0.3)" }}>
          AGENTBOARD // LIVE PREVIEW
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="dot-pulse h-1.5 w-1.5 rounded-full" style={{ background: "#059669" }} />
          <span className="mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(5,150,105,0.7)" }}>
            5 agents active
          </span>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-4 gap-1.5">
        {cols.map((col) => (
          <div key={col.status}>
            <div
              className="mono mb-1.5 flex items-center justify-between px-1.5 py-1 text-[8px] uppercase tracking-widest"
              style={{
                borderTop: `2px solid ${col.color}`,
                borderLeft: `1px solid ${col.color}22`,
                borderRight: `1px solid ${col.color}22`,
                borderBottom: `1px solid ${col.color}22`,
                background: `${col.color}0f`,
                color: col.color,
              }}
            >
              <span className="truncate">{col.label}</span>
              <span style={{ opacity: 0.6 }}>
                {tasks.filter((t) => t.status === col.status).length.toString().padStart(2, "0")}
              </span>
            </div>

            <div className="flex min-h-24 flex-col gap-1">
              <AnimatePresence mode="popLayout">
                {tasks
                  .filter((t) => t.status === col.status)
                  .map((task) => {
                    const isGlowing = glowId === task.id;
                    const isReview = task.status === "review";
                    return (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.93 }}
                        animate={{ opacity: 1, y: 0, scale: isGlowing ? 1.04 : 1 }}
                        exit={{ opacity: 0, x: 12, scale: 0.9 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="border-l-2 bg-white px-1.5 py-1.5"
                        style={{
                          borderLeftColor: isReview ? "#7c3aed" : task.agentColor,
                          borderTop: `1px solid ${isReview ? "rgba(124,58,237,0.2)" : "rgba(200,80,0,0.1)"}`,
                          borderRight: `1px solid ${isReview ? "rgba(124,58,237,0.1)" : "rgba(200,80,0,0.07)"}`,
                          borderBottom: `1px solid ${isReview ? "rgba(124,58,237,0.1)" : "rgba(200,80,0,0.07)"}`,
                          boxShadow: isGlowing ? `0 4px 14px ${task.agentColor}44` : "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                      >
                        <p className="mono mb-1 text-[8px] font-bold leading-tight" style={{ color: "#1c1814" }}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1">
                          <div
                            className="flex h-3.5 w-3.5 items-center justify-center"
                            style={{ background: task.agentColor, clipPath: "polygon(0 0, calc(100% - 2px) 0, 100% 2px, 100% 100%, 2px 100%, 0 calc(100% - 2px))" }}
                          >
                            <task.AgentIcon size={7} style={{ color: "#fff" }} />
                          </div>
                          <span className="mono text-[7px] uppercase" style={{ color: isReview ? "#7c3aed" : task.agentColor }}>
                            {isReview ? "!! needs review" : task.agentName}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
