import "server-only";
import { createServerSupabase } from "@/lib/supabase-server";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Idea {
  id: string;
  name: string;
  archived_at: string | null;
}

// ── Pure roll-up (all-ideas overview counts). Kept pure so it's unit-tested and
// reused by the overview view. ───────────────────────────────────────────────
export interface IdeaRollupInput {
  ideas: { id: string; name: string }[];
  projects: { id: string; idea_id: string | null }[];
  tasks: { parent_id: string | null; status: string; pr_url: string | null }[];
}
export interface IdeaRollup {
  id: string;
  name: string;
  inReview: number;
  inProgress: number;
  done: number;
  prsRaised: number;
}

export function rollUpByIdea(input: IdeaRollupInput): IdeaRollup[] {
  const projectIdea = new Map(input.projects.map((p) => [p.id, p.idea_id]));
  const base = new Map<string, IdeaRollup>(
    input.ideas.map((i) => [i.id, { id: i.id, name: i.name, inReview: 0, inProgress: 0, done: 0, prsRaised: 0 }])
  );
  for (const t of input.tasks) {
    const ideaId = t.parent_id ? projectIdea.get(t.parent_id) : null;
    if (!ideaId) continue;
    const row = base.get(ideaId);
    if (!row) continue;
    if (t.status === "in_review") row.inReview++;
    else if (t.status === "in_progress") row.inProgress++;
    else if (t.status === "done") row.done++;
    if (t.pr_url) row.prsRaised++;
  }
  return input.ideas.map((i) => base.get(i.id)!);
}
