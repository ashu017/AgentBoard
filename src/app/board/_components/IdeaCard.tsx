"use client";
import type { IdeaRollup } from "@/lib/ideas";
import { RULE } from "./board-ui";

const REVIEW = "#7c3aed";

/**
 * Idea CARD — the roll-up tile shared by the all-ideas overview and the header
 * idea-picker modal. Display name + a 4-up big-number stat row. in_review is the
 * attention signal (loud purple when > 0, and it colors the card border so
 * "what needs you" reads first). `active` highlights the currently-focused idea
 * (orange ring) in the picker.
 */
export function IdeaCard({
  idea,
  onOpen,
  active = false,
}: {
  idea: IdeaRollup;
  onOpen: () => void;
  active?: boolean;
}) {
  const quiet = idea.inReview + idea.inProgress + idea.done + idea.prsRaised === 0;
  const needsYou = idea.inReview > 0;

  return (
    <button
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={`clip-corner group relative flex min-h-[9.5rem] flex-col border bg-paper p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-orange hover:bg-paper-2 ${
        active ? "ring-1 ring-orange" : ""
      }`}
      style={{ borderColor: active ? "#e84500" : needsYou ? REVIEW : RULE }}
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
