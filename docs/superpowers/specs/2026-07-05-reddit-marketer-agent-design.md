# Reddit Marketer Agent — Design (P0)

**Date:** 2026-07-05 (revised same day after reading Reddit's Responsible Builder Policy)
**Status:** Approved, pre-implementation
**Relation to DECISIONS.md NEXT-3 "Social / launch agent":** stays **draft-only**, as
NEXT-3 originally scoped. An earlier draft of this spec added an approval-gated live-posting
path; that was **removed** — see "Why not automated posting" below.

## Purpose

Grow AgentBoard by researching relevant subreddits, learning what performs there, and
drafting tailored, value-first posts about AgentBoard **for a human to review and post by
hand**. The agent never posts to Reddit itself.

## Why not automated posting (the constraint that shapes this)

Reddit's **Responsible Builder Policy** (read 2026-07-05,
support.reddithelp.com/hc/en-us/articles/42728983564564) prohibits exactly the pattern an
auto-poster would use:

- *"Apps must not engage in spamming activity through automated posts… **This includes
  posting identical or substantially similar content across subreddits.**"*
- *"App accounts should solely be used to perform app functions (no mixed use accounts)."*
- *"Approval is required: You must request access and get explicit approval before accessing
  any Reddit data through our API"* — app creation is gated behind
  developers.reddit.com/app-registration, and non-commercial builders are steered to Devvit.

An automated cross-subreddit promo poster is therefore offside regardless of a human
approval gate — the *automation of posting* is the liability. So P0 is **read + draft only**:
the agent produces distinct, community-specific drafts; **the human posts manually**, as a
normal Redditor, respecting each community's rules and the 9:1 self-promo norm. This also
unblocks us immediately — no app registration, no OAuth, no approval wait.

## Form factor

A Claude Code **subagent** at `.claude/agents/reddit-marketer.md` (sibling of
`seo-optimizer`, `spike-runner`, `test-runner`) — a build/launch-time helper, **not** an
AgentBoard runtime product agent. The agent holds the judgment (curated subreddit list,
community rules, drafting); one small Node script does the read-only fetch.

## File layout

```
.claude/agents/
  reddit-marketer.md        # the agent: seed list, per-sub rules, judgment, drafting workflow

scripts/reddit/
  fetch-top.mjs             # GET https://www.reddit.com/r/<sub>/top.json?t=month&limit=100
                            #   (public JSON, descriptive User-Agent, no auth) → normalized JSON
  analyze.mjs (optional)    # summarize top-100 → themes / title patterns / format mix

drafts/reddit/              # gitignored; drafts land here for the human to post by hand
  <sub>-<slug>.md           # frontmatter (subreddit, kind, title, flair) + body + "why this fits"
```

Plain Node `.mjs`, no new dependencies (Node 18+ global `fetch`). **No OAuth, no
credentials, no posting script.**

## Reading — public JSON (no auth)

`fetch-top.mjs <sub>`:
- `GET https://www.reddit.com/r/<sub>/top.json?t=month&limit=100`
- Header: a descriptive `User-Agent` (e.g. `agentboard-research/0.1 by u/<name>`) — Reddit
  rejects generic UAs and rate-limits harder without one.
- Low volume (a handful of reads per run), well within unauthenticated limits; respect
  `429` / back off if it ever occurs.
- Normalize each post to `{title, score, num_comments, flair, is_self, url, permalink}`;
  print JSON to stdout.

> Note: public JSON is fine for light research reads. If Reddit ever tightens this, the
> fallback is manual export — not an OAuth app (which reintroduces the approval gate).

## Workflow (the loop the agent runs)

1. **Select subreddits** — from the embedded curated seed list (e.g. r/alphaandbetausers,
   r/SideProject, r/SaaS, r/artificial, r/mcp), each entry carrying its self-promo rules and
   preferred post kind (link vs text).
2. **Research** — `fetch-top.mjs <sub>` → top 100 of the month, normalized.
3. **Analyze** — extract what performs: recurring themes, title shapes, self-vs-link ratio,
   comment-driving hooks.
4. **Draft (value-first, distinct per sub)** — write one post per sub to
   `drafts/reddit/<sub>-<slug>.md`. Drafts are **genuinely useful to that community first**,
   lightly referencing AgentBoard only where the sub's rules allow. Each draft is **tailored
   and distinct** — never boilerplate reused across subs (that would be the prohibited
   pattern if it were ever posted in bulk). Frontmatter: `subreddit`, `kind`, `title`,
   `flair`; body below; plus a "why this fits + which rule it respects" note.
5. **Hand off to the human** — the agent presents the drafts and **stops**. The human edits
   as they see fit and **posts manually** through the normal Reddit UI, as themselves.

## Error handling

`fetch-top.mjs` fails loud and clear:
- Non-200 (e.g. sub private/banned/typo) → print status + Reddit's body, exit non-zero.
- `429` → note the rate limit, back off, tell the user; never hammer.
- Network error → clear message, exit non-zero.

## Safety & compliance

- **No posting path exists in the code** — the agent cannot post even if asked; posting is a
  human action. This is the core compliance guarantee.
- Drafts are distinct per community and value-first (respects the 9:1 self-promo norm and the
  "no substantially similar content across subreddits" rule *by construction*).
- Agent respects each sub's self-promo rules from the seed list; subs that ban self-promo get
  a value-only draft or none.
- `drafts/` gitignored. No secrets involved.

## Testing

- Unit-test `fetch-top.mjs` normalization + error paths (Vitest, mocked fetch). No live calls
  in CI.
- Reading may be smoke-tested live (public JSON, low-risk) during development.

## Out of scope for P0

- Any automated posting to Reddit (prohibited by policy; human posts by hand).
- OAuth script app / credentials (not needed for read-only public JSON).
- Wiring into AgentBoard's MCP agent plane (separate effort).
- Dynamic subreddit discovery (curated seed list only in P0).
- A Devvit interactive AgentBoard presence on our own subreddit (separate, sanctioned
  initiative Reddit actually steers builders toward — worth its own brainstorm later).
