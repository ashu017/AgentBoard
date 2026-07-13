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
- **Default (no auth):** `GET https://www.reddit.com/r/<sub>/top.json?t=month&limit=100`.
- **Optional bearer token:** if `REDDIT_BEARER_TOKEN` is set in the env, use
  `GET https://oauth.reddit.com/r/<sub>/top?t=month&limit=100` with
  `Authorization: bearer <token>` for higher/more reliable rate limits. Purely optional — a
  per-session convenience (tokens expire ~1h); the script works fully without it. We do NOT
  create an OAuth app or store long-lived credentials.
- Header (both paths): a descriptive `User-Agent` (e.g. `agentboard-research/0.1 by u/<name>`)
  — Reddit rejects generic UAs and rate-limits harder without one.
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

## Automation (P0.5 — local 5-min tick → one subreddit → Telegram)

A scheduled job ticks **every 5 minutes** and processes **exactly one subreddit per tick**,
advancing a persisted **watermark** so each tick picks up the next sub. It drips one draft
to Telegram at a time for the human to upload by hand. **Still draft-only**: the job never
posts to Reddit.

### Drip + watermark semantics

- **One sub per tick.** Each 5-min run reads the watermark, drafts for the **next** seed
  subreddit, delivers it to Telegram, then advances the watermark. No batch/burst — gentle on
  Reddit and one draft to review at a time.
- **Watermark file:** `drafts/reddit/.watermark.json` (gitignored) — stores
  `{ week: "<ISO-year-week>", index: <next seed index> }`.
- **Weekly reset, then idle.** The watermark is scoped to the current ISO week. Once the tick
  has processed the last sub in the list (`index` reaches the seed count), subsequent ticks in
  the same week are **no-ops** (nothing to do). When a new ISO week begins, the next tick sees
  a stale `week`, resets `index` to 0, and starts a fresh pass at sub #1. **Net effect: one
  full pass over the seed list per week, drip-fed 5 minutes apart** — matching the original
  "one post per sub per week" intent without a burst.
- **Idempotency within a tick:** advance the watermark only *after* a successful draft+send
  for that sub, so a mid-tick failure re-tries the same sub next tick rather than skipping it.

### Pieces

- **Schedule:** the user's Mac via **`launchd`**, `StartInterval` = 300s (every 5 min).
  launchd (not plain `cron`) also runs a missed tick on next wake. A
  `com.agentboard.reddit-tick.plist` template + install instructions live in the repo.
- **Draft engine:** the tick shell script invokes **Claude Code headless** (`claude -p`)
  pointed at the `reddit-marketer` subagent for the one target sub, so it reuses the exact
  same research + drafting logic (no duplicated prompt).
- **Delivery:** **one Telegram message** (that sub's draft) via Telegram Bot API
  `sendMessage`.

### Components

```
scripts/reddit/
  send-telegram.mjs         # POST sendMessage to Telegram Bot API; one message per call
  telegram-chat-id.mjs      # one-off helper: print your chat_id from getUpdates
  watermark.mjs             # read/advance the {week,index} watermark; pick the next sub (pure + file I/O)
  tick.sh                   # per-tick orchestrator: next sub → claude -p draft → send-telegram → advance

ops/launchd/
  com.agentboard.reddit-tick.plist   # launchd 5-min StartInterval template + install notes
```

### Config (`.env.local`, all optional unless you run the tick job)

- `TELEGRAM_BOT_TOKEN` — from @BotFather.
- `TELEGRAM_CHAT_ID` — your chat id (use `telegram-chat-id.mjs` to fetch it once).

### Safety (same guarantee extends here)

- The tick job **only reads Reddit and writes to Telegram** — there is still no Reddit
  posting code anywhere. The human uploads to Reddit manually.
- Telegram secrets live in `.env.local` (gitignored); never printed or committed.
- `send-telegram.mjs` fails loud on a non-200 from Telegram; on failure the watermark is not
  advanced, so the same sub retries next tick.

## Testing

- Unit-test `lib.mjs` normalization + error paths, `send-telegram.mjs` payload building +
  error handling, and `watermark.mjs` advance/weekly-reset/idle logic (Vitest, mocked fetch +
  a temp file). No live calls in CI.
- Reading and Telegram delivery may be smoke-tested live (low-risk) during development.
- `tick.sh` is verified manually (a couple of dry-run invocations to watch the watermark
  advance), not in CI.

## Out of scope for P0

- Any automated posting to Reddit (prohibited by policy; human posts by hand). The tick job
  automates *drafting + Telegram delivery* only — never Reddit posting.
- OAuth script app / credentials (not needed for read-only public JSON).
- Wiring into AgentBoard's MCP agent plane (separate effort).
- Dynamic subreddit discovery (curated seed list only in P0).
- A Devvit interactive AgentBoard presence on our own subreddit (separate, sanctioned
  initiative Reddit actually steers builders toward — worth its own brainstorm later).
