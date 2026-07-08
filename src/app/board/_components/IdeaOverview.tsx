"use client";
import { useRouter } from "next/navigation";
import type { IdeaRollup } from "@/lib/ideas";
import { RULE } from "./board-ui";

export function IdeaOverview({ rows }: { rows: IdeaRollup[] }) {
  const router = useRouter();
  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <p className="mono mb-2 text-[10px] uppercase tracking-widest text-orange">SYS::ALL IDEAS</p>
      <h1 className="display mb-6 text-xl uppercase tracking-wide">What needs you</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(`/board?idea=${r.id}`)}
            className="clip-corner border bg-paper p-4 text-left hover:border-orange"
            style={{ borderColor: RULE }}
          >
            <div className="display text-base uppercase tracking-wide">{r.name}</div>
            <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span style={{ color: r.inReview > 0 ? "#7c3aed" : "var(--ink-soft)" }}>{r.inReview} in review</span>
              <span className="text-ink-soft">{r.inProgress} in progress</span>
              <span className="text-ink-soft">{r.done} done</span>
              <span className="text-ink-soft">{r.prsRaised} PRs</span>
            </div>
          </button>
        ))}
        {rows.length === 0 && <p className="mono text-sm text-ink-soft">No ideas yet.</p>}
      </div>
    </div>
  );
}
