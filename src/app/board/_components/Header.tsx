"use client";
// Operator-console top bar (the board's single header — replaces the generic
// Shell chrome for /board): AgentBoard wordmark → home, workspace name, an
// "N AWAITING REVIEW" badge (only when count>0; toggles the live feed), the
// "+ New" dropdown menu, the Board/Agents nav, and sign out.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown, AlertTriangle } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { RULE } from "./board-ui";

export function Header({
  workspaceName,
  awaitingReview,
  onToggleFeed,
  feedOpen,
  onNewProject,
  onNewTask,
  onNewAgent,
}: {
  workspaceName: string;
  awaitingReview: number;
  onToggleFeed: () => void;
  feedOpen: boolean;
  onNewProject: () => void;
  onNewTask: () => void;
  onNewAgent: () => void;
}) {
  return (
    <header
      className="flex items-center gap-4 border-b bg-paper-2 px-4 py-3"
      style={{ borderColor: RULE }}
    >
      <Link href="/" className="display text-lg uppercase tracking-[0.18em] text-ink hover:text-orange">
        Agent<span className="text-orange">Board</span>
      </Link>
      <span className="mono hidden text-[11px] text-ink-soft sm:inline">{workspaceName}</span>

      <div className="ml-auto flex items-center gap-3">
        {awaitingReview > 0 && (
          <button
            onClick={onToggleFeed}
            aria-pressed={feedOpen}
            className={`mono flex items-center gap-1.5 border px-2.5 py-1 text-[11px] uppercase tracking-widest ${
              feedOpen ? "border-orange text-orange" : "border-line text-ink-soft hover:text-orange"
            }`}
            style={{ borderColor: feedOpen ? undefined : RULE }}
            title="Toggle activity feed"
          >
            <AlertTriangle size={12} style={{ color: "#7c3aed" }} />
            {awaitingReview} awaiting review
          </button>
        )}
        <NewMenu onProject={onNewProject} onTask={onNewTask} onAgent={onNewAgent} />
        <nav className="mono flex items-center gap-3 text-[11px] uppercase tracking-widest text-ink-soft" aria-label="Console">
          <span className="text-ink">Board</span>
          <Link href="/board/agents" className="hover:text-orange">Agents</Link>
          <form action={signOut}>
            <button className="uppercase text-ink-soft hover:text-ink">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}

function NewMenu({
  onProject,
  onTask,
  onAgent,
}: {
  onProject: () => void;
  onTask: () => void;
  onAgent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mono flex items-center gap-1 bg-orange px-3 py-1.5 text-sm font-medium uppercase tracking-wide text-paper"
      >
        <Plus size={14} /> New <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="clip-corner absolute right-0 z-20 mt-1 w-40 border border-line bg-paper text-sm shadow-xl">
          <button role="menuitem" onClick={() => { setOpen(false); onProject(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Project</button>
          <button role="menuitem" onClick={() => { setOpen(false); onTask(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Task</button>
          <button role="menuitem" onClick={() => { setOpen(false); onAgent(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Agent</button>
        </div>
      )}
    </div>
  );
}
