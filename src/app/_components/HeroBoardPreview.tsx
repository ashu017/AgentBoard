"use client";
import { useEffect, useState } from "react";

// HeroBoardPreview — the hero's right column. A miniature, self-driving board that
// loops a few task cards through todo → in_progress → in_review → done, so the
// landing page SHOWS the core promise ("assign tasks and watch them work, live")
// instead of a decorative animation. On-brand operator-console skin: bordered
// paper tiles, monospace ids, color = status signal only. No gradients.
//
// Motion: a single interval advances one card per tick through the pipeline; the
// column re-render + the .enter-fade on each card gives the "card moved" feel.
// Respects prefers-reduced-motion (renders a static, mid-flight arrangement and
// never starts the interval — see the guard in the effect).

const COLUMNS = [
  { key: "todo", label: "Todo", color: "var(--st-todo)" },
  { key: "in_progress", label: "In progress", color: "var(--st-progress)" },
  { key: "in_review", label: "In review", color: "var(--st-review)" },
  { key: "done", label: "Done", color: "var(--st-done)" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

interface Card {
  id: string;
  title: string;
  agent: string;
  col: ColKey;
}

// The pipeline order a card advances through, then wraps back to todo.
const ORDER: ColKey[] = ["todo", "in_progress", "in_review", "done"];

// Seed arrangement — a believable in-flight board (staggered across columns).
const SEED: Card[] = [
  { id: "T-241", title: "Draft release notes", agent: "scribe", col: "in_progress" },
  { id: "T-238", title: "Migrate auth schema", agent: "dbx", col: "in_review" },
  { id: "T-236", title: "Crawl competitor pricing", agent: "scout", col: "done" },
  { id: "T-244", title: "Summarize support tickets", agent: "triage", col: "todo" },
  { id: "T-242", title: "Generate OG images", agent: "pixel", col: "in_progress" },
];

function nextCol(col: ColKey): ColKey {
  const i = ORDER.indexOf(col);
  return ORDER[(i + 1) % ORDER.length];
}

export function HeroBoardPreview() {
  const [cards, setCards] = useState<Card[]>(SEED);
  // A monotonically increasing key per card so React remounts the moved card and
  // its .enter-fade replays (keying on id alone wouldn't re-trigger the animation).
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static arrangement, no loop

    let idx = 0;
    const iv = setInterval(() => {
      setCards((prev) => {
        // Advance the oldest-eligible card round-robin so motion spreads across cards.
        const target = prev[idx % prev.length];
        idx += 1;
        setMoved(target.id);
        return prev.map((c) =>
          c.id === target.id ? { ...c, col: nextCol(c.col) } : c
        );
      });
    }, 1900);
    return () => clearInterval(iv);
  }, []);

  const counts = COLUMNS.map((col) => cards.filter((c) => c.col === col.key).length);
  const inProgress = counts[1];
  const inReview = counts[2];
  const done = counts[3];

  return (
    <div className="clip-corner w-full border border-line bg-paper-2 p-3 sm:p-4">
      {/* Status bar — mirrors the real board header. */}
      <div className="mono flex items-center gap-3 text-[11px] text-ink-soft sm:text-xs">
        <span className="flex items-center gap-1.5">
          <span className="dot-pulse inline-block h-2 w-2 rounded-full" style={{ background: "var(--st-done)" }} />
          LIVE
        </span>
        <span>all healthy</span>
        <span className="ml-auto tabular-nums">
          {inProgress} in progress · {inReview} in review · {done} done
        </span>
      </div>

      {/* Four status columns. */}
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.col === col.key);
          return (
            <div key={col.key} className="min-h-[168px] border border-line bg-paper/60 p-2">
              <div className="mono flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: col.color }} />
                  {col.label}
                </span>
                <span className="tabular-nums">{colCards.length}</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {colCards.map((c) => (
                  <div
                    key={`${c.id}-${c.col}`}
                    className={`border border-line bg-paper p-2 ${c.id === moved ? "enter-fade" : ""}`}
                    style={{ borderLeft: `2px solid ${col.color}` }}
                  >
                    <div className="truncate text-[11px] font-medium text-ink">{c.title}</div>
                    <div className="mono mt-1 flex items-center justify-between text-[9px] text-ink-soft">
                      <span>{c.id}</span>
                      <span>@{c.agent}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
