"use client";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import type { Idea, IdeaRollup } from "@/lib/ideas";
import { Modal } from "@/app/_components/Modal";
import { IdeaCard } from "./IdeaCard";
import { RULE } from "./board-ui";

/**
 * The idea PICKER — a modal board of idea cards that replaces the old header
 * dropdown. Choosing an idea feels like picking from a board: each card shows the
 * same roll-up counts as the all-ideas overview (IdeaCard). "All ideas" sits at
 * the top (the overview), the active idea is ringed, and "+ New idea" is at the
 * bottom. Escape / backdrop / focus-trap are handled by the shared Modal.
 */
export function IdeaPickerModal({
  open,
  onClose,
  ideas,
  overview,
  activeIdeaId,
  onNewIdea,
}: {
  open: boolean;
  onClose: () => void;
  ideas: Idea[];
  overview: IdeaRollup[];
  activeIdeaId: string | null;
  onNewIdea: () => void;
}) {
  const router = useRouter();
  const rollupById = new Map(overview.map((r) => [r.id, r]));

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal open={open} onClose={onClose} title="Switch idea" systemTag="SYS:: IDEAS" variant="figma" size="lg">
      {/* All ideas — the overview option. Marked as the "zoom out" entry. */}
      <button
        onClick={() => go("/board")}
        aria-current={activeIdeaId === null ? "true" : undefined}
        className={`clip-corner mb-5 flex w-full items-center gap-2 border px-4 py-3 text-left transition-colors hover:border-orange hover:bg-paper-2 ${
          activeIdeaId === null ? "ring-1 ring-orange" : ""
        }`}
        style={{ borderColor: activeIdeaId === null ? "#e84500" : RULE }}
      >
        <LayoutGrid size={15} className="text-orange" aria-hidden="true" />
        <span className="display text-sm uppercase tracking-wide">All ideas</span>
        <span className="mono ml-auto text-[10px] uppercase tracking-widest text-ink-soft">Overview</span>
      </button>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ideas.map((i) => {
          const roll = rollupById.get(i.id) ?? {
            id: i.id,
            name: i.name,
            inReview: 0,
            inProgress: 0,
            done: 0,
            prsRaised: 0,
          };
          return (
            <IdeaCard
              key={i.id}
              idea={roll}
              active={i.id === activeIdeaId}
              onOpen={() => go(`/board?idea=${i.id}`)}
            />
          );
        })}
      </div>

      {/* + New idea — opens the existing IdeaModal. */}
      <button
        onClick={() => {
          onClose();
          onNewIdea();
        }}
        className="mono mt-5 flex w-full items-center justify-center gap-2 border border-dashed px-4 py-3 text-sm uppercase tracking-widest text-orange transition-colors hover:bg-paper-2"
        style={{ borderColor: "rgba(200,80,0,0.35)" }}
      >
        <Plus size={14} aria-hidden="true" /> New idea
      </button>
    </Modal>
  );
}
