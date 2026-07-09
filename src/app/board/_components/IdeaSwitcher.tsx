"use client";
import { LayoutGrid } from "lucide-react";
import type { Idea } from "@/lib/ideas";
import { RULE } from "./board-ui";

/**
 * The idea-switcher TRIGGER: shows the current idea (or "All ideas") and opens the
 * IdeaPickerModal — a full card board of ideas with roll-up counts — on click. The
 * picker itself (and its open-state) lives in Header; this is just the button.
 */
export function IdeaSwitcher({
  ideas,
  activeIdeaId,
  onOpen,
}: {
  ideas: Idea[];
  activeIdeaId: string | null;
  onOpen: () => void;
}) {
  const active = ideas.find((i) => i.id === activeIdeaId);
  const label = active ? active.name : "All ideas";

  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className="mono flex items-center gap-1.5 border px-3 py-1.5 text-sm uppercase tracking-wide text-ink hover:text-orange"
      style={{ borderColor: RULE }}
    >
      <LayoutGrid size={13} aria-hidden="true" /> {label}
    </button>
  );
}
