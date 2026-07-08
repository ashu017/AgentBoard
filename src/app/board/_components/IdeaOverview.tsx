"use client";
import { useRouter } from "next/navigation";
import type { IdeaRollup } from "@/lib/ideas";
import { RULE } from "./board-ui";
import { IdeaCard } from "./IdeaCard";

/**
 * All-ideas OVERVIEW. Each idea is a card that navigates into its focused board.
 * in_review is the attention signal — when > 0 it reads loud (purple, emphasized);
 * ideas with pending reviews float to the top so "what needs you" is literally
 * first. Cards are shared with the header idea-picker modal (IdeaCard).
 */
export function IdeaOverview({ rows }: { rows: IdeaRollup[] }) {
  const router = useRouter();

  // Attention-first order: pending reviews float up, then active work. Copy the
  // array so we never mutate the prop.
  const ordered = [...rows].sort(
    (a, b) => b.inReview - a.inReview || b.inProgress - a.inProgress
  );

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::ALL IDEAS</p>
        <h1 className="display mb-8 text-xl uppercase tracking-wide">What needs you</h1>

        {ordered.length === 0 ? (
          <div
            className="clip-corner mx-auto max-w-md border border-dashed p-10 text-center"
            style={{ borderColor: RULE }}
          >
            <p className="display text-base uppercase tracking-wide text-ink-soft">No ideas yet</p>
            <p className="mono mt-2 text-[11px] text-ink-soft">
              Create an idea to start assigning work to your agents.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((r) => (
              <IdeaCard key={r.id} idea={r} onOpen={() => router.push(`/board?idea=${r.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
