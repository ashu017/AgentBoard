"use client";
import { useRouter } from "next/navigation";
import type { IdeaRollup } from "@/lib/ideas";
import { RULE } from "./board-ui";

const REVIEW = "#7c3aed";

/**
 * All-ideas OVERVIEW. Each idea is a card that navigates into its focused board.
 * in_review is the attention signal — when > 0 it reads loud (purple, emphasized);
 * ideas with pending reviews float to the top so "what needs you" is literally
 * first. Counts use the project-header Stat pattern (big number / small label).
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

function IdeaCard({ idea, onOpen }: { idea: IdeaRollup; onOpen: () => void }) {
  const quiet = idea.inReview + idea.inProgress + idea.done + idea.prsRaised === 0;
  const needsYou = idea.inReview > 0;

  return (
    <button
      onClick={onOpen}
      className="clip-corner group relative flex min-h-[9.5rem] flex-col border bg-paper p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-orange hover:bg-paper-2"
      style={{ borderColor: needsYou ? REVIEW : RULE }}
    >
      <div className="display text-base uppercase tracking-wide leading-snug">{idea.name}</div>

      {quiet ? (
        <p className="mono mt-auto pt-4 text-[10px] uppercase tracking-widest text-ink-soft">
          Nothing needs you here
        </p>
      ) : (
        <div className="mt-auto grid grid-cols-4 gap-2 pt-4">
          <Stat label="in review" value={idea.inReview} alert={needsYou} />
          <Stat label="in prog" value={idea.inProgress} />
          <Stat label="done" value={idea.done} />
          <Stat label="PRs" value={idea.prsRaised} />
        </div>
      )}
    </button>
  );
}

/** Big-number / small-label stat, mirroring the project-header Stat. in_review is
 *  the attention signal: loud purple when > 0, muted when 0. */
function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  const emphasize = alert && value > 0;
  return (
    <div>
      <div
        className="display text-lg uppercase leading-none tabular-nums"
        style={{
          color: emphasize ? REVIEW : value > 0 ? "var(--ink)" : "var(--ink-soft)",
          letterSpacing: "0.04em",
        }}
      >
        {value}
      </div>
      <div
        className="mono mt-1 text-[9px] uppercase tracking-widest"
        style={{ color: emphasize ? REVIEW : "var(--ink-soft)" }}
      >
        {label}
      </div>
    </div>
  );
}
