"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, LayoutGrid } from "lucide-react";
import type { Idea } from "@/lib/ideas";
import { RULE } from "./board-ui";

export function IdeaSwitcher({
  ideas,
  activeIdeaId,
  onNewIdea,
}: {
  ideas: Idea[];
  activeIdeaId: string | null;
  onNewIdea: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const active = ideas.find((i) => i.id === activeIdeaId);
  const label = active ? active.name : "All ideas";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mono flex items-center gap-1.5 border px-3 py-1.5 text-sm uppercase tracking-wide text-ink hover:text-orange"
        style={{ borderColor: RULE }}
      >
        {label} <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="clip-corner absolute left-0 z-30 mt-1 w-56 border border-line bg-paper text-sm shadow-xl">
          <button role="menuitem" onClick={() => { setOpen(false); router.push("/board"); }}
            className="mono flex w-full items-center gap-2 px-3 py-2 text-left uppercase tracking-wide hover:bg-paper-2">
            <LayoutGrid size={13} /> All ideas
          </button>
          <div className="border-t" style={{ borderColor: RULE }} />
          {ideas.map((i) => (
            <button key={i.id} role="menuitem" onClick={() => { setOpen(false); router.push(`/board?idea=${i.id}`); }}
              className={`block w-full px-3 py-2 text-left hover:bg-paper-2 ${i.id === activeIdeaId ? "text-orange" : ""}`}>
              {i.name}
            </button>
          ))}
          <div className="border-t" style={{ borderColor: RULE }} />
          <button role="menuitem" onClick={() => { setOpen(false); onNewIdea(); }}
            className="mono flex w-full items-center gap-2 px-3 py-2 text-left uppercase tracking-wide text-orange hover:bg-paper-2">
            <Plus size={13} /> New idea
          </button>
        </div>
      )}
    </div>
  );
}
