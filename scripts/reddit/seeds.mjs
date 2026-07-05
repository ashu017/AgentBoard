// The curated seed subreddits — the SINGLE SOURCE OF TRUTH for both the
// reddit-marketer agent and the weekly cron. Each entry names the community's
// self-promo posture. Verify against the sub's live rules before drafting.
export const SEEDS = [
  { sub: "alphaandbetausers", kind: "text", promo: "Beta-test recruiting is the point; a clear 'looking for testers' post fits." },
  { sub: "SideProject", kind: "text", promo: "Show-and-tell welcome; be genuine, no hard-sell. Flair often required." },
  { sub: "SaaS", kind: "text", promo: "Value-first (lessons/metrics/teardowns); promo often confined to weekly threads — check." },
  { sub: "artificial", kind: "text", promo: "Lead with an insight; naked promo removed. Frame AgentBoard as a concrete example." },
  { sub: "mcp", kind: "text", promo: "Technical MCP community; genuine 'how we used MCP for X' posts land well." },
];

/** Plain list of sub names, in order. */
export function seedNames() {
  return SEEDS.map((s) => s.sub);
}
