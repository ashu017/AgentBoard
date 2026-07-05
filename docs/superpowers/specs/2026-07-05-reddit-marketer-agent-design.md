# Reddit Marketer Agent — Design (P0)

**Date:** 2026-07-05
**Status:** Approved, pre-implementation
**Supersedes:** DECISIONS.md NEXT-3 "Social / launch agent" (was draft-only) — this adds an
approval-gated live-posting path for the Reddit slice.

## Purpose

Grow AgentBoard by researching relevant subreddits, learning what performs there, drafting
on-topic posts about AgentBoard, and — after explicit per-post human approval — publishing
them to Reddit. The first user of this capability is AgentBoard's own launch/marketing.

## Form factor

A Claude Code **subagent** at `.claude/agents/reddit-marketer.md` (sibling of
`seo-optimizer`, `spike-runner`, `test-runner`) — a build/launch-time helper, **not** an
AgentBoard runtime product agent. Approach B ("agent + thin helper scripts"): the agent
holds the judgment (curated subreddit list, community rules, drafting, the approval gate);
small Node scripts do the dumb, testable I/O to Reddit's API.

### Why not Devvit

A Devvit Web app was evaluated (`~/Desktop/reddit/agentboard`) and rejected: Devvit builds
interactive posts that run on Reddit's servers and can only post into subreddits that
*installed the app* (a moderator action). It structurally cannot post promotional content
into third-party communities (r/SideProject, r/SaaS, r/mcp, …) — which is the whole point.
The OAuth2 script-app path posts as our own account to any subreddit our account can post to.

## File layout

```
.claude/agents/
  reddit-marketer.md        # the agent: seed list, per-sub rules, judgment, workflow

scripts/reddit/
  lib.mjs                   # env loading, OAuth token fetch+cache, fetch wrapper w/ User-Agent, normalization
  fetch-top.mjs             # GET /r/<sub>/top?t=month&limit=100 → normalized JSON to stdout
  submit-post.mjs           # POST /api/submit (link|self) → prints permalink; refuses without --confirm
  analyze.mjs (optional)    # summarize top-100 → themes / title patterns / format mix

drafts/reddit/              # gitignored; drafts land here for review
  <sub>-<slug>.md           # frontmatter (subreddit, kind, title, flair) + body

.env.local                  # REDDIT_CLIENT_ID / SECRET / USERNAME / PASSWORD / USER_AGENT
```

Plain Node `.mjs`, no new dependencies (Node 18+ global `fetch`).

## Authentication — OAuth2 script app

Grounded in Reddit's docs (github.com/reddit-archive/reddit/wiki/OAuth2 +
OAuth2-Quick-Start-Example). Isolated in `lib.mjs`:

1. Register a **script** app at reddit.com/prefs/apps → `client_id` + `secret` (script apps
   are confidential clients and DO have a secret).
2. **Token fetch:** `POST https://www.reddit.com/api/v1/access_token`
   - HTTP Basic auth: user = `client_id`, password = `client_secret`.
   - Body (`application/x-www-form-urlencoded`): `grant_type=password&username=<u>&password=<p>`.
   - `User-Agent` header, Reddit's format: `<appname>/<version> by <username>`
     (e.g. `agentboard-marketer/0.1 by u/<name>`). Reddit rejects generic/blank UAs.
   - Response: `{ access_token, expires_in: 3600, token_type: "bearer", scope }`.
3. **Authenticated calls:** base URL `https://oauth.reddit.com` (NOT www). Header
   `Authorization: bearer <token>`, plus the same `User-Agent`. Used for BOTH reading
   (`/r/<sub>/top`) and posting (`/api/submit`).
4. **Scopes:** `read` (top listings), `submit` (posting), `identity` (verify account via
   `/api/v1/me`). Script apps typically return `scope: *`.
5. **Token cache:** cache per process (optionally to a gitignored `.reddit-token.json`) with
   the `expires_in` (1h) so multiple script calls in one run don't re-auth.

Creds come from `.env.local` only — never committed, never printed. `.env.example` documents
the five `REDDIT_*` keys. Missing creds → clear "set these env vars" exit, not a stack trace.

## Workflow (the loop the agent runs)

1. **Select subreddits** — from the embedded curated seed list (e.g. r/alphaandbetausers,
   r/SideProject, r/SaaS, r/artificial, r/mcp), each entry carrying its self-promo rules and
   preferred post kind (link vs text).
2. **Research** — `fetch-top.mjs <sub>` → top 100 of the month, normalized to
   `{title, score, num_comments, flair, is_self, url, permalink}`.
3. **Analyze** — extract what performs: recurring themes, title shapes, self-vs-link ratio,
   comment-driving hooks. Grounds each draft in that community's proven patterns.
4. **Draft** — write one on-topic AgentBoard post per sub to `drafts/reddit/<sub>-<slug>.md`
   (frontmatter: `subreddit`, `kind`, `title`, `flair`; body below). Each draft notes which
   top-post pattern it models and which self-promo rule it satisfies.
5. **Approval gate (hard stop)** — present each draft and WAIT. No `submit-post.mjs` runs
   without explicit approval of that specific draft.
6. **Post** — on approval, `submit-post.mjs --sub <s> --kind <k> --title … --confirm` →
   prints the live permalink. Agent reports back.

## Error handling

Scripts fail loud and clear; never silent:
- Missing/invalid creds → exit 1 naming the missing `REDDIT_*` var.
- 401 → token expired/bad creds; re-auth once, then surface.
- 429 → respect `x-ratelimit-reset` / back off, tell the user. (Reddit's OAuth limit is
  ~60 req/min; the `x-ratelimit-{used,remaining,reset}` headers are on API responses.)
- Submit errors (`SUBREDDIT_NOTALLOWED`, `NO_TEXT`, rule violations) → print Reddit's own
  error JSON so the agent can fix the draft.

## Safety (outward-facing — real posts to real communities)

- `submit-post.mjs` refuses to post without an explicit `--confirm`; the agent passes it only
  after per-draft human approval.
- Never print tokens/passwords to stdout or logs.
- `drafts/` and `.reddit-token.json` gitignored.
- Agent respects each sub's self-promo rules; subs that ban self-promo get no draft.

## Testing

- Unit-test `lib.mjs` normalization + the "missing creds" and "no --confirm" guard paths
  (Vitest, mocked fetch). No live calls in CI.
- Reading (`fetch-top`) may be smoke-tested live (top listings are low-risk).
- Posting is **never** auto-tested against live Reddit; verified once manually on a
  throwaway/test post.

## Out of scope for P0

- Wiring into AgentBoard's MCP agent plane (product feature — separate effort).
- Dynamic subreddit discovery (curated seed list only in P0).
- Comment replies, cross-posting, scheduling, analytics on posted performance.
- A Devvit interactive AgentBoard presence on our own subreddit (separate initiative).
