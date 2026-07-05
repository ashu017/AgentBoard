# Reddit Marketer Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Reddit research tool (`scripts/reddit/`) plus a `reddit-marketer` Claude Code subagent that pulls top-100/month posts from curated subreddits and drafts value-first, per-community posts for a human to post by hand.

**Architecture:** A pure-function library (`lib.mjs`) does URL building + response normalization and is unit-tested with a mocked `fetch`. A thin CLI (`fetch-top.mjs`) wraps it for command-line use, reading optional config from `.env.local`. The agent markdown holds the seed subreddit list, per-sub self-promo rules, and the drafting workflow. **No OAuth app, no posting code** — posting is a manual human action, per Reddit's Responsible Builder Policy.

**Tech Stack:** Node 18+ ESM (`.mjs`, global `fetch`), Vitest (mocked fetch, no live calls in CI). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-reddit-marketer-agent-design.md`

---

## File Structure

- Create: `scripts/reddit/lib.mjs` — pure helpers: `userAgent()`, `buildTopUrl()`, `normalizePost()`, `normalizeListing()`, and `fetchTop()` (takes an injectable `fetchImpl` for testability).
- Create: `scripts/reddit/fetch-top.mjs` — CLI wrapper: parse argv, load `.env.local`, call `fetchTop`, print JSON, map errors to exit codes.
- Create: `tests/reddit/lib.test.ts` — unit tests for all `lib.mjs` functions (mocked fetch).
- Create: `.claude/agents/reddit-marketer.md` — the subagent: seed list, rules, drafting workflow.
- Modify: `.gitignore` — ignore `drafts/`.
- Modify: `.env.example` — document optional `REDDIT_USER_AGENT` + `REDDIT_BEARER_TOKEN` + Telegram vars.

Automation files (Tasks 8–12) — a 5-min tick that drafts ONE sub per run and advances a watermark:
- Create: `scripts/reddit/send-telegram.mjs` — POST one message to the Telegram Bot API.
- Create: `scripts/reddit/telegram-chat-id.mjs` — one-off helper to print your chat id.
- Create: `scripts/reddit/watermark.mjs` — read/advance the `{week,index}` watermark; pick the next sub; ISO-week reset + idle-when-done.
- Create: `scripts/reddit/tick.sh` — per-tick orchestrator: next sub → `claude -p` draft → send-telegram → advance watermark.
- Create: `ops/launchd/com.agentboard.reddit-tick.plist` — launchd 5-min `StartInterval` template.
- Create: `tests/reddit/send-telegram.test.ts` — unit tests for the Telegram sender (mocked fetch).
- Create: `tests/reddit/watermark.test.ts` — unit tests for watermark advance / weekly reset / idle-when-done.

Analysis of the top-100 (themes, title shapes) is done by the agent itself (it's an LLM) — no `analyze.mjs` script (YAGNI). The tick reuses the `reddit-marketer` agent via `claude -p` rather than duplicating the drafting prompt.

The **seed subreddit list is the single source of truth** and lives in one place — `scripts/reddit/seeds.mjs` (Task 1b) — imported by both the agent's guidance and the tick job, so automation and the interactive agent target the same subs. The tick drips **one sub per 5-min tick** and idles after a full weekly pass (watermark scoped to the ISO week), so the net effect is one pass over the seed list per week.

---

## Task 1: Scaffold — gitignore drafts + document env

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Ignore the drafts directory**

Add to `.gitignore` under the existing "Env / secrets" or a new section. Append these lines to the end of the file:

```gitignore

# Reddit marketer agent — generated drafts (post by hand; never committed)
drafts/
```

- [ ] **Step 2: Document optional Reddit env vars**

Append to the end of `.env.example`:

```gitignore

# --- Reddit marketer agent (read-only research; OPTIONAL) ---
# The research reads PUBLIC JSON and needs NO auth by default. These are optional.
# A descriptive User-Agent (Reddit rejects generic ones). Falls back to a default.
REDDIT_USER_AGENT=agentboard-research/0.1 by u/YOUR_USERNAME
# Optional short-lived bearer token — if set, reads use oauth.reddit.com for higher
# rate limits. Tokens expire ~1h; purely a convenience. We do NOT create an OAuth app.
# REDDIT_BEARER_TOKEN=

# --- Telegram delivery (weekly cron only; OPTIONAL) ---
# Create a bot via @BotFather to get the token; run telegram-chat-id.mjs for the chat id.
# Used by the weekly launchd job to DM you drafts. No Reddit posting — you upload by hand.
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore(reddit): gitignore drafts, document optional research env vars"
```

---

## Task 1b: Seed subreddit list (single source of truth)

**Files:**
- Create: `scripts/reddit/seeds.mjs`
- Test: `tests/reddit/seeds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reddit/seeds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SEEDS, seedNames } from "../../scripts/reddit/seeds.mjs";

describe("SEEDS", () => {
  it("is a non-empty array of well-formed entries", () => {
    expect(Array.isArray(SEEDS)).toBe(true);
    expect(SEEDS.length).toBeGreaterThan(0);
    for (const s of SEEDS) {
      expect(typeof s.sub).toBe("string");
      expect(s.sub.length).toBeGreaterThan(0);
      expect(s.kind === "text" || s.kind === "link").toBe(true);
      expect(typeof s.promo).toBe("string"); // the self-promo rule note
    }
  });

  it("has no duplicate subs", () => {
    const names = SEEDS.map((s) => s.sub.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("seedNames returns the plain sub names", () => {
    expect(seedNames()).toEqual(SEEDS.map((s) => s.sub));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reddit/seeds.test.ts`
Expected: FAIL — cannot resolve `seeds.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/reddit/seeds.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reddit/seeds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/seeds.mjs tests/reddit/seeds.test.ts
git commit -m "feat(reddit): curated seed subreddit list (single source of truth)"
```

---

## Task 2: `lib.mjs` — `userAgent()` and `buildTopUrl()`

**Files:**
- Create: `scripts/reddit/lib.mjs`
- Test: `tests/reddit/lib.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/reddit/lib.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { userAgent, buildTopUrl } from "../../scripts/reddit/lib.mjs";

describe("userAgent", () => {
  it("uses REDDIT_USER_AGENT when set", () => {
    expect(userAgent({ REDDIT_USER_AGENT: "myapp/1.0 by u/me" })).toBe("myapp/1.0 by u/me");
  });

  it("falls back to a descriptive default when unset", () => {
    expect(userAgent({})).toBe("agentboard-research/0.1");
  });
});

describe("buildTopUrl", () => {
  it("uses public www host with .json when no token", () => {
    expect(buildTopUrl("SideProject", { token: undefined })).toBe(
      "https://www.reddit.com/r/SideProject/top.json?t=month&limit=100&raw_json=1"
    );
  });

  it("uses oauth host when a token is provided", () => {
    expect(buildTopUrl("SideProject", { token: "abc" })).toBe(
      "https://oauth.reddit.com/r/SideProject/top?t=month&limit=100&raw_json=1"
    );
  });

  it("strips a leading r/ prefix from the subreddit", () => {
    expect(buildTopUrl("r/SaaS", { token: undefined })).toBe(
      "https://www.reddit.com/r/SaaS/top.json?t=month&limit=100&raw_json=1"
    );
  });

  it("throws on an empty subreddit", () => {
    expect(() => buildTopUrl("", { token: undefined })).toThrow(/subreddit/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: FAIL — cannot resolve `../../scripts/reddit/lib.mjs` (module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/reddit/lib.mjs`:

```js
// Read-only helpers for pulling a subreddit's top posts. Pure functions +
// an injectable fetch so the logic is unit-testable without hitting Reddit.
// NO posting, NO OAuth app — research reads only (public JSON by default).

const DEFAULT_USER_AGENT = "agentboard-research/0.1";

/** Descriptive User-Agent (Reddit rejects generic/blank UAs). */
export function userAgent(env = process.env) {
  return env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
}

/** Normalize a subreddit name: strip an optional leading "r/". */
function cleanSub(subreddit) {
  const sub = String(subreddit || "").trim().replace(/^\/?r\//i, "");
  if (!sub) throw new Error("subreddit is required (e.g. 'SideProject')");
  return sub;
}

/**
 * Build the top-of-month listing URL. With a bearer token, use the authed
 * oauth host (higher rate limits); otherwise the public www .json endpoint.
 */
export function buildTopUrl(subreddit, { token } = {}) {
  const sub = cleanSub(subreddit);
  const qs = "t=month&limit=100&raw_json=1";
  return token
    ? `https://oauth.reddit.com/r/${sub}/top?${qs}`
    : `https://www.reddit.com/r/${sub}/top.json?${qs}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/lib.mjs tests/reddit/lib.test.ts
git commit -m "feat(reddit): userAgent + buildTopUrl helpers (public vs oauth host)"
```

---

## Task 3: `lib.mjs` — `normalizePost()` and `normalizeListing()`

**Files:**
- Modify: `scripts/reddit/lib.mjs`
- Test: `tests/reddit/lib.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/reddit/lib.test.ts` (add the two functions to the existing import at the top: `import { userAgent, buildTopUrl, normalizePost, normalizeListing } from "../../scripts/reddit/lib.mjs";`):

```ts
describe("normalizePost", () => {
  it("maps a t3 child's data to the normalized shape", () => {
    const child = {
      kind: "t3",
      data: {
        title: "I built a thing",
        score: 412,
        num_comments: 37,
        link_flair_text: "Show & Tell",
        is_self: true,
        url: "https://redd.it/abc",
        permalink: "/r/SideProject/comments/abc/i_built_a_thing/",
      },
    };
    expect(normalizePost(child)).toEqual({
      title: "I built a thing",
      score: 412,
      num_comments: 37,
      flair: "Show & Tell",
      is_self: true,
      url: "https://redd.it/abc",
      permalink: "https://www.reddit.com/r/SideProject/comments/abc/i_built_a_thing/",
    });
  });

  it("defaults missing flair to null and coerces missing counts to 0", () => {
    const out = normalizePost({ data: { title: "t", is_self: false, url: "u", permalink: "/p" } });
    expect(out.flair).toBeNull();
    expect(out.score).toBe(0);
    expect(out.num_comments).toBe(0);
  });
});

describe("normalizeListing", () => {
  it("extracts and normalizes every child from a listing", () => {
    const listing = {
      kind: "Listing",
      data: {
        children: [
          { data: { title: "a", score: 1, num_comments: 0, is_self: true, url: "u1", permalink: "/a" } },
          { data: { title: "b", score: 2, num_comments: 3, is_self: false, url: "u2", permalink: "/b" } },
        ],
      },
    };
    const out = normalizeListing(listing);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("a");
    expect(out[1].score).toBe(2);
  });

  it("throws a clear error when the payload isn't a listing", () => {
    expect(() => normalizeListing({ error: 404, message: "Not Found" })).toThrow(/listing/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: FAIL — `normalizePost` / `normalizeListing` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/reddit/lib.mjs`:

```js
/** Full https permalink from Reddit's site-relative permalink. */
function absolutePermalink(permalink) {
  const p = String(permalink || "");
  return p.startsWith("http") ? p : `https://www.reddit.com${p}`;
}

/** Map one listing child (t3 post) to the normalized shape we draft from. */
export function normalizePost(child) {
  const d = (child && child.data) || {};
  return {
    title: d.title,
    score: Number(d.score) || 0,
    num_comments: Number(d.num_comments) || 0,
    flair: d.link_flair_text ?? null,
    is_self: Boolean(d.is_self),
    url: d.url,
    permalink: absolutePermalink(d.permalink),
  };
}

/** Extract + normalize every post from a Reddit listing payload. */
export function normalizeListing(listing) {
  const children = listing && listing.data && listing.data.children;
  if (!Array.isArray(children)) {
    const msg = listing && listing.message ? `: ${listing.message}` : "";
    throw new Error(`Response is not a Reddit listing${msg}`);
  }
  return children.map(normalizePost);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/lib.mjs tests/reddit/lib.test.ts
git commit -m "feat(reddit): normalizePost + normalizeListing"
```

---

## Task 4: `lib.mjs` — `fetchTop()` with injectable fetch + error handling

**Files:**
- Modify: `scripts/reddit/lib.mjs`
- Test: `tests/reddit/lib.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `fetchTop` to the import at the top of `tests/reddit/lib.test.ts`, then append:

```ts
describe("fetchTop", () => {
  const okListing = {
    kind: "Listing",
    data: { children: [{ data: { title: "hello", score: 5, num_comments: 1, is_self: true, url: "u", permalink: "/x" } }] },
  };

  it("fetches, sends the User-Agent, and returns normalized posts", async () => {
    let seenUrl, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url;
      seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => okListing };
    };
    const posts = await fetchTop("SideProject", { fetchImpl, env: { REDDIT_USER_AGENT: "ua/1 by u/me" } });
    expect(seenUrl).toContain("https://www.reddit.com/r/SideProject/top.json");
    expect(seenHeaders["User-Agent"]).toBe("ua/1 by u/me");
    expect(posts).toEqual([
      { title: "hello", score: 5, num_comments: 1, flair: null, is_self: true, url: "u", permalink: "https://www.reddit.com/x" },
    ]);
  });

  it("sends the Authorization header and uses the oauth host when a token is set", async () => {
    let seenUrl, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url; seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => okListing };
    };
    await fetchTop("SaaS", { fetchImpl, env: { REDDIT_BEARER_TOKEN: "tok123" } });
    expect(seenUrl).toContain("https://oauth.reddit.com/r/SaaS/top");
    expect(seenHeaders["Authorization"]).toBe("bearer tok123");
  });

  it("throws a clear error on a 429 rate limit", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "slow down" });
    await expect(fetchTop("SaaS", { fetchImpl, env: {} })).rejects.toThrow(/429|rate limit/i);
  });

  it("throws a clear error on a non-200 (e.g. private/banned sub)", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "Forbidden" });
    await expect(fetchTop("some_private_sub", { fetchImpl, env: {} })).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: FAIL — `fetchTop` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/reddit/lib.mjs`:

```js
/**
 * Fetch a subreddit's top-100 of the month and return normalized posts.
 * fetchImpl is injectable for tests; defaults to global fetch. env is
 * injectable too so tests don't touch process.env.
 */
export async function fetchTop(subreddit, { fetchImpl = fetch, env = process.env } = {}) {
  const token = env.REDDIT_BEARER_TOKEN || undefined;
  const url = buildTopUrl(subreddit, { token });
  const headers = { "User-Agent": userAgent(env) };
  if (token) headers["Authorization"] = `bearer ${token}`;

  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    const hint = res.status === 429 ? " (rate limit — back off and retry later)" : "";
    throw new Error(`Reddit request failed: ${res.status}${hint} for ${url}\n${body.slice(0, 300)}`);
  }
  return normalizeListing(await res.json());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reddit/lib.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/lib.mjs tests/reddit/lib.test.ts
git commit -m "feat(reddit): fetchTop with injectable fetch + loud error handling"
```

---

## Task 5: `fetch-top.mjs` — CLI wrapper

**Files:**
- Create: `scripts/reddit/fetch-top.mjs`

- [ ] **Step 1: Write the CLI**

Create `scripts/reddit/fetch-top.mjs`:

```js
#!/usr/bin/env node
// CLI: pull a subreddit's top-100 of the month as normalized JSON on stdout.
// Read-only research. Public JSON by default; optional REDDIT_BEARER_TOKEN in
// .env.local switches to the authed host for higher rate limits.
//
// Usage:  node scripts/reddit/fetch-top.mjs <subreddit>
// Example: node scripts/reddit/fetch-top.mjs SideProject > /tmp/sideproject.json
import { readFileSync } from "node:fs";
import { fetchTop } from "./lib.mjs";

// Merge .env.local (if present) over process.env — same pattern as other scripts.
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (env[key] === undefined) env[key] = line.slice(i + 1).trim();
    }
  } catch {
    // .env.local is optional for this read-only tool; ignore if missing.
  }
  return env;
}

async function main() {
  const sub = process.argv[2];
  if (!sub) {
    console.error("Usage: node scripts/reddit/fetch-top.mjs <subreddit>");
    process.exit(2);
  }
  const env = loadEnv();
  const posts = await fetchTop(sub, { env });
  process.stdout.write(JSON.stringify(posts, null, 2) + "\n");
  console.error(`✓ ${posts.length} posts from r/${sub.replace(/^\/?r\//i, "")}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it fails loudly with no argument**

Run: `node scripts/reddit/fetch-top.mjs`
Expected: prints the usage line to stderr and exits with code 2. Verify: `echo $?` → `2`.

- [ ] **Step 3: Commit**

```bash
git add scripts/reddit/fetch-top.mjs
git commit -m "feat(reddit): fetch-top CLI wrapper (reads .env.local, JSON to stdout)"
```

---

## Task 6: Live smoke test (manual — NOT in CI)

**Files:** none (verification only)

> **⚠️ DEFERRED to the user's own machine (2026-07-05).** The dev environment this was
> built in has its egress IP blocked by Reddit — `fetch-top.mjs` correctly returns a loud
> 403 for *every* request (all subs, both hosts, even reddit.com's homepage), regardless of
> User-Agent. This is a network/IP block, NOT a code defect: the code + error handling are
> verified via the 14 mocked-fetch unit tests, and the CLI's error path was observed live
> (403 → clear message → exit 1). Run the three steps below on a residential IP (your Mac) —
> which is also where the `launchd` tick runs in production, so the real use case is
> unaffected. Reddit may return a `Blocked`/403 to datacenter IPs specifically.

- [ ] **Step 1: Pull a real subreddit's top posts**

Run: `node scripts/reddit/fetch-top.mjs SideProject | head -40`
Expected: valid JSON array of normalized posts; stderr shows `✓ 100 posts from r/SideProject` (count may be <100 for smaller subs).

- [ ] **Step 2: Confirm a smaller/niche sub works**

Run: `node scripts/reddit/fetch-top.mjs mcp`
Expected: JSON array (possibly fewer than 100 items). No crash.

- [ ] **Step 3: Confirm graceful failure on a bad sub**

Run: `node scripts/reddit/fetch-top.mjs this_sub_does_not_exist_zzz; echo "exit=$?"`
Expected: a `✗ Reddit request failed: <status> …` line on stderr and `exit=1`.

If a smoke step fails because of Reddit rate limits (HTTP 429), wait a minute and retry, or set `REDDIT_BEARER_TOKEN` in `.env.local`. Do not add live calls to the test suite.

---

## Task 7: The `reddit-marketer` subagent

**Files:**
- Create: `.claude/agents/reddit-marketer.md`

- [ ] **Step 1: Write the agent definition**

Create `.claude/agents/reddit-marketer.md`:

```markdown
---
name: reddit-marketer
description: AgentBoard's read-only Reddit research + drafting agent. Pulls the top-100/month posts from curated subreddits, learns what performs, and drafts tailored, value-first posts about AgentBoard for a HUMAN to review and post by hand. Never posts to Reddit itself — posting is a manual human action (Reddit's Responsible Builder Policy bars automated cross-subreddit promo).
tools: Bash, Read, Write, Grep, Glob
---

# reddit-marketer — AgentBoard Reddit research & drafting agent

You grow AgentBoard on Reddit by doing the research a thoughtful founder would do before
posting: read what actually performs in a community, then draft a genuinely useful,
community-specific post. You are a build/launch-time helper (sibling of `seo-optimizer`),
**not** an AgentBoard runtime product agent. Read `CLAUDE.md` and
`docs/superpowers/specs/2026-07-05-reddit-marketer-agent-design.md` before working.

## Hard boundary — you never post to Reddit

Reddit's Responsible Builder Policy prohibits automated posting of "identical or
substantially similar content across subreddits." There is deliberately **no posting code**
in this repo. Your output is drafts in `drafts/reddit/`. **A human reviews and posts them by
hand.** Never attempt to post, and never draft the same content for multiple subs.

## Workflow

1. **Pick target subreddits** from the seed list below (or a subset the user names).
2. **Research** each: `node scripts/reddit/fetch-top.mjs <sub>` → normalized top-100/month
   JSON. (Public JSON, no auth. If you hit a 429, tell the user they can set an optional
   `REDDIT_BEARER_TOKEN` in `.env.local`.)
3. **Analyze** the results yourself: recurring themes, title shapes (question? show-and-tell?
   "I built…"?), self-post vs link ratio, what drives comments. Note the community's voice.
4. **Draft, value-first and distinct per sub.** Write one post to
   `drafts/reddit/<sub>-<slug>.md` with frontmatter (`subreddit`, `kind`, `title`, `flair`)
   then the body, then a short "**Why this fits:**" note naming the top-post pattern it
   models and the self-promo rule it respects. The post must help the community first;
   reference AgentBoard only as much as that sub's rules allow. Never reuse boilerplate
   across subs.
5. **Hand off.** Present the drafts and STOP. Remind the user to post manually, as themselves,
   respecting the 9:1 self-promo norm (roughly one promo post per nine genuine contributions).

## Seed subreddits (curated)

The canonical seed list lives in `scripts/reddit/seeds.mjs` (the single source of truth,
shared with the weekly cron). Read it at the start of a run: `cat scripts/reddit/seeds.mjs`.
Each entry has `sub`, `kind` (text|link), and `promo` (its self-promo posture). Current subs:

- **r/alphaandbetausers** — early adopters seeking apps to test. Self-promo is the point;
  a clear "looking for beta testers" post fits.
- **r/SideProject** — makers sharing projects. Show-and-tell welcome; be genuine, no
  hard-sell. Flair often required.
- **r/SaaS** — SaaS builders/operators. Value-first (lessons, metrics, teardowns) far
  outperforms "check out my app." Self-promo often confined to weekly threads — check.
- **r/artificial** — broad AI audience. Must lead with an idea/insight; naked promo removed.
  Frame AgentBoard as a concrete example within a substantive point.
- **r/mcp** — Model Context Protocol community; highly relevant (AgentBoard is MCP-native).
  Technical, genuine "here's how we used MCP for X" posts land well.

Always verify rules against the sub's current sidebar/wiki before drafting — rules change.
To add a sub, edit `seeds.mjs` and state the community + its self-promo rule. If a sub bans
self-promo outright, draft a value-only post (no product pitch) or skip it.

## Output format for a draft file

```markdown
---
subreddit: SideProject
kind: text            # text | link
title: <the post title>
flair: <flair or "">
---

<post body — genuinely useful to this community first>

---
**Why this fits:** models <observed top-post pattern>; respects <the sub's self-promo rule>.
**Post manually** — do not automate.
```
```

- [ ] **Step 2: Verify the frontmatter parses**

Run: `head -5 .claude/agents/reddit-marketer.md`
Expected: valid YAML frontmatter with `name: reddit-marketer` and a `tools:` line (no `Edit` — this agent researches and writes drafts, it doesn't modify app code).

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/reddit-marketer.md
git commit -m "feat(reddit): reddit-marketer research+draft subagent (read-only, draft-only)"
```

---

## Task 8: `send-telegram.mjs` — Telegram sender (one message per call)

**Files:**
- Create: `scripts/reddit/send-telegram.mjs`
- Test: `tests/reddit/send-telegram.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/reddit/send-telegram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSendUrl, sendMessage } from "../../scripts/reddit/send-telegram.mjs";

describe("buildSendUrl", () => {
  it("builds the Bot API sendMessage URL from the token", () => {
    expect(buildSendUrl("123:ABC")).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
  });
  it("throws when the token is missing", () => {
    expect(() => buildSendUrl("")).toThrow(/token/i);
  });
});

describe("sendMessage", () => {
  it("POSTs chat_id + text as JSON and resolves on ok", async () => {
    let seenUrl, seenBody, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url; seenBody = JSON.parse(opts.body); seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    await sendMessage({ token: "123:ABC", chatId: "999", text: "hello" }, { fetchImpl });
    expect(seenUrl).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(seenHeaders["Content-Type"]).toBe("application/json");
    expect(seenBody).toEqual({ chat_id: "999", text: "hello", disable_web_page_preview: true });
  });

  it("throws a clear error when Telegram returns non-ok", async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => '{"description":"chat not found"}' });
    await expect(
      sendMessage({ token: "123:ABC", chatId: "bad", text: "x" }, { fetchImpl })
    ).rejects.toThrow(/400|chat not found/i);
  });

  it("throws when chatId or text is missing", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await expect(sendMessage({ token: "t", chatId: "", text: "x" }, { fetchImpl })).rejects.toThrow(/chat/i);
    await expect(sendMessage({ token: "t", chatId: "1", text: "" }, { fetchImpl })).rejects.toThrow(/text/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit/send-telegram.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/reddit/send-telegram.mjs`:

```js
// Send a single message to a Telegram chat via the Bot API. One message per
// call (the weekly job calls this once per subreddit, sequentially). Injectable
// fetch for tests. Read-only w.r.t. Reddit — this only writes to Telegram.
import { readFileSync } from "node:fs";

export function buildSendUrl(token) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

export async function sendMessage({ token, chatId, text }, { fetchImpl = fetch } = {}) {
  if (!chatId) throw new Error("chat_id is required (set TELEGRAM_CHAT_ID)");
  if (!text) throw new Error("text is required (nothing to send)");
  const res = await fetchImpl(buildSendUrl(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// --- CLI: node send-telegram.mjs "message text" ---
// Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from env or .env.local.
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (env[key] === undefined) env[key] = line.slice(i + 1).trim();
    }
  } catch { /* .env.local optional */ }
  return env;
}

// Run as CLI only when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("send-telegram.mjs")) {
  const text = process.argv[2];
  const env = loadEnv();
  sendMessage({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, text })
    .then(() => console.error("✓ sent to Telegram"))
    .catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reddit/send-telegram.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/send-telegram.mjs tests/reddit/send-telegram.test.ts
git commit -m "feat(reddit): send-telegram — one Bot API message per call"
```

---

## Task 9: `telegram-chat-id.mjs` — one-off chat-id helper

**Files:**
- Create: `scripts/reddit/telegram-chat-id.mjs`

- [ ] **Step 1: Write the helper**

Create `scripts/reddit/telegram-chat-id.mjs`:

```js
#!/usr/bin/env node
// One-off helper: after you create the bot and send it any message, run this to
// print your chat_id. Put it in .env.local as TELEGRAM_CHAT_ID.
//   1. Create a bot with @BotFather, copy its token into .env.local
//   2. Open the bot in Telegram and send it "hi"
//   3. node scripts/reddit/telegram-chat-id.mjs
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (env[key] === undefined) env[key] = line.slice(i + 1).trim();
    }
  } catch { /* optional */ }
  return env;
}

const env = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error("✗ set TELEGRAM_BOT_TOKEN in .env.local first"); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
const chats = new Map();
for (const u of data.result || []) {
  const chat = u.message?.chat || u.channel_post?.chat;
  if (chat) chats.set(chat.id, chat.username || chat.title || chat.first_name || "");
}
if (chats.size === 0) {
  console.error("✗ no updates yet — open the bot in Telegram, send it a message, then re-run.");
  process.exit(1);
}
for (const [id, name] of chats) console.log(`chat_id=${id}  (${name})`);
```

- [ ] **Step 2: Verify it errors cleanly without a token**

Run: `TELEGRAM_BOT_TOKEN= node scripts/reddit/telegram-chat-id.mjs 2>&1 | head -1` (from a dir with no `.env.local`, or temporarily unset)
Expected: `✗ set TELEGRAM_BOT_TOKEN in .env.local first`. (Live behavior needs a real bot — verified in Task 12 setup.)

- [ ] **Step 3: Commit**

```bash
git add scripts/reddit/telegram-chat-id.mjs
git commit -m "feat(reddit): telegram-chat-id helper (fetch chat id from getUpdates)"
```

---

## Task 10: `watermark.mjs` — the per-tick position tracker

**Files:**
- Create: `scripts/reddit/watermark.mjs`
- Test: `tests/reddit/watermark.test.ts`

The watermark decides which sub a tick handles. It stores `{week, index}` in a JSON file.
`nextSub` returns the sub for the current tick (or `null` when the week's pass is done);
`advance` bumps the index after a successful send; a stale `week` resets the pass to index 0.
`isoWeek` is injected (not computed from the clock) so tests are deterministic.

- [ ] **Step 1: Write the failing tests**

Create `tests/reddit/watermark.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextSub, advance } from "../../scripts/reddit/watermark.mjs";

const SUBS = ["a", "b", "c"];
let dir, file;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "wm-")); file = join(dir, ".watermark.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("nextSub", () => {
  it("returns the first sub and initializes the file when none exists", () => {
    const r = nextSub({ file, subs: SUBS, week: "2026-W27" });
    expect(r).toEqual({ sub: "a", index: 0 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W27", index: 0 });
  });

  it("returns the sub at the current index mid-week", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 1 }));
    expect(nextSub({ file, subs: SUBS, week: "2026-W27" })).toEqual({ sub: "b", index: 1 });
  });

  it("returns null when the week's pass is complete (idle)", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 3 }));
    expect(nextSub({ file, subs: SUBS, week: "2026-W27" })).toBeNull();
  });

  it("resets to the first sub when a new ISO week starts", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 3 }));
    const r = nextSub({ file, subs: SUBS, week: "2026-W28" });
    expect(r).toEqual({ sub: "a", index: 0 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W28", index: 0 });
  });
});

describe("advance", () => {
  it("increments the stored index for the given week", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 1 }));
    advance({ file, week: "2026-W27" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W27", index: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit/watermark.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/reddit/watermark.mjs`:

```js
// Tracks which subreddit the next 5-min tick should handle. State is a small
// JSON file: { week: "<ISO-year-week>", index: <next seed index> }. The pass is
// scoped to an ISO week — a new week resets to index 0; when index reaches the
// seed count the week's pass is done and nextSub returns null (idle). isoWeek is
// injected so tests are deterministic. Read + file I/O only; no network.
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_FILE = "drafts/reddit/.watermark.json";

function read(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { return null; }
}

function write(file, state) {
  writeFileSync(file, JSON.stringify(state));
}

/** Compute the current ISO week string, e.g. "2026-W27". */
export function isoWeek(date = new Date()) {
  // Copy to UTC midnight Thursday of this week (ISO-8601 week rule).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The sub this tick should handle, plus its index — or null if the current
 * week's pass is already complete. Initializes / weekly-resets the file as a
 * side effect so the caller always sees a consistent state.
 */
export function nextSub({ file = DEFAULT_FILE, subs, week = isoWeek() } = {}) {
  let state = read(file);
  if (!state || state.week !== week) {
    state = { week, index: 0 };
    write(file, state);
  }
  if (state.index >= subs.length) return null; // pass done — idle until next week
  return { sub: subs[state.index], index: state.index };
}

/** Bump the index after a successful draft+send for the current sub. */
export function advance({ file = DEFAULT_FILE, week = isoWeek() } = {}) {
  const state = read(file) || { week, index: 0 };
  write(file, { week: state.week, index: (state.index || 0) + 1 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reddit/watermark.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/watermark.mjs tests/reddit/watermark.test.ts
git commit -m "feat(reddit): watermark — one sub per tick, ISO-week reset, idle when done"
```

---

## Task 11: `tick.sh` — the 5-minute per-tick orchestrator

**Files:**
- Create: `scripts/reddit/tick.sh`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/reddit/tick.sh`:

```bash
#!/usr/bin/env bash
# One tick (runs every 5 min via launchd): handle EXACTLY ONE subreddit — the one
# the watermark points at — then advance the watermark. Once the week's pass is
# done, ticks are no-ops until a new ISO week. Reads Reddit + writes Telegram
# only; never posts to Reddit. The human uploads by hand.
#
# Invoked by launchd (ops/launchd/com.agentboard.reddit-tick.plist).
set -euo pipefail

# Resolve repo root (this script lives in scripts/reddit/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

LOG="${ROOT}/drafts/reddit/tick-$(date +%Y%m%d).log"
mkdir -p "${ROOT}/drafts/reddit"

# Ask the watermark for this tick's sub (JSON: {"sub":"...","index":N} or "null").
PICK=$(node -e "import('./scripts/reddit/seeds.mjs').then(async (s) => { const { nextSub } = await import('./scripts/reddit/watermark.mjs'); const r = nextSub({ subs: s.seedNames() }); process.stdout.write(JSON.stringify(r)); })")

if [ "$PICK" = "null" ]; then
  echo "[tick] $(date) — week's pass complete; idling." | tee -a "$LOG"
  exit 0
fi

SUB=$(printf '%s' "$PICK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).sub))")
echo "[tick] $(date) — drafting for r/${SUB}…" | tee -a "$LOG"

# Headless Claude Code: reuse the reddit-marketer agent to produce ONE draft.
PROMPT="Use the reddit-marketer agent. Research r/${SUB} (run fetch-top.mjs ${SUB}), then write ONE value-first draft post to drafts/reddit/${SUB}-weekly.md following the agent's draft format. Do not post to Reddit. After writing, print ONLY the final draft file's contents to stdout."

if DRAFT=$(claude -p "$PROMPT" 2>>"$LOG"); then
  if node scripts/reddit/send-telegram.mjs "r/${SUB} — weekly draft:

${DRAFT}" >>"$LOG" 2>&1; then
    # Advance ONLY after a successful draft+send, so a failed tick retries this sub.
    node -e "import('./scripts/reddit/watermark.mjs').then(m => m.advance())"
    echo "[tick] ✓ sent r/${SUB} and advanced watermark" | tee -a "$LOG"
  else
    echo "[tick] ✗ telegram send failed for r/${SUB} — watermark NOT advanced (retry next tick)" | tee -a "$LOG"
    exit 1
  fi
else
  echo "[tick] ✗ draft failed for r/${SUB} — watermark NOT advanced (retry next tick)" | tee -a "$LOG"
  exit 1
fi
```

- [ ] **Step 2: Make it executable + syntax-check**

Run:
```bash
chmod +x scripts/reddit/tick.sh
bash -n scripts/reddit/tick.sh && echo "syntax ok"
```
Expected: `syntax ok`. `bash -n` only parses; it does not run the tick.

- [ ] **Step 3: Commit**

```bash
git add scripts/reddit/tick.sh
git commit -m "feat(reddit): tick.sh — one sub per 5-min tick, advance watermark on success"
```

---

## Task 12: `launchd` 5-min schedule + setup docs

**Files:**
- Create: `ops/launchd/com.agentboard.reddit-tick.plist`

- [ ] **Step 1: Write the launchd plist template**

Create `ops/launchd/com.agentboard.reddit-tick.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  Reddit draft → Telegram tick. Runs every 5 minutes; handles ONE subreddit per
  tick (watermark-driven) and idles once the week's pass is done.
  SETUP:
    1. Replace __REPO__ with the absolute path to this repo, and __NODE_BIN_DIR__
       with the dir containing your `node` + `claude` (run: dirname "$(which node)").
    2. Copy to ~/Library/LaunchAgents/com.agentboard.reddit-tick.plist
    3. Load it:   launchctl load ~/Library/LaunchAgents/com.agentboard.reddit-tick.plist
       Unload:    launchctl unload ~/Library/LaunchAgents/com.agentboard.reddit-tick.plist
       Run now:   launchctl start com.agentboard.reddit-tick
  launchd (not cron) runs a missed tick on the next wake if the Mac was asleep.
-->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentboard.reddit-tick</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>__REPO__/scripts/reddit/tick.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>__NODE_BIN_DIR__:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>__REPO__</string>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>__REPO__/drafts/reddit/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>__REPO__/drafts/reddit/launchd.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Verify the plist is well-formed XML**

Run: `plutil -lint ops/launchd/com.agentboard.reddit-tick.plist`
Expected: `ops/launchd/com.agentboard.reddit-tick.plist: OK`

- [ ] **Step 3: Commit**

```bash
git add ops/launchd/com.agentboard.reddit-tick.plist
git commit -m "feat(reddit): launchd 5-min tick schedule template + setup notes"
```

---

## Task 13: Manual end-to-end verification (NOT in CI)

**Files:** none (verification only). Requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `.env.local`.

- [ ] **Step 1: Get your chat id**

Create a bot via @BotFather, put its token in `.env.local`, message the bot once, then run:
`node scripts/reddit/telegram-chat-id.mjs`
Expected: prints `chat_id=…`. Put that value in `.env.local` as `TELEGRAM_CHAT_ID`.

- [ ] **Step 2: Send a test Telegram message**

Run: `node scripts/reddit/send-telegram.mjs "AgentBoard tick test ✅"`
Expected: `✓ sent to Telegram` and the message arrives in your Telegram.

- [ ] **Step 3: Dry-run two ticks and watch the watermark advance**

Run: `bash scripts/reddit/tick.sh && cat drafts/reddit/.watermark.json && echo && bash scripts/reddit/tick.sh && cat drafts/reddit/.watermark.json`
Expected: the first tick drafts sub #0 and sends ONE Telegram message; `.watermark.json` shows `index: 1`. The second tick drafts sub #1 and sends one message; `index: 2`. If `claude` isn't on PATH, install/point to it and retry.

- [ ] **Step 4: Confirm idle after a full pass**

Fast-forward the watermark past the last sub (uses the real current ISO week), then tick:
```bash
WEEK=$(node -e "import('./scripts/reddit/watermark.mjs').then(m=>console.log(m.isoWeek()))")
printf '{"week":"%s","index":99}' "$WEEK" > drafts/reddit/.watermark.json
bash scripts/reddit/tick.sh
```
Expected: `[tick] … week's pass complete; idling.` and NO Telegram message sent. Re-arm by deleting the file: `rm drafts/reddit/.watermark.json` (or wait for the next ISO week).

---

## Task 14: Full test sweep + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass, including `tests/reddit/seeds.test.ts` (3), `tests/reddit/lib.test.ts` (14), `tests/reddit/send-telegram.test.ts` (6), and `tests/reddit/watermark.test.ts` (6). No live Reddit or Telegram calls occur in the suite.

- [ ] **Step 2: Confirm no secrets or drafts are tracked**

Run: `git status --short && git check-ignore drafts/x.md`
Expected: clean tree (all work committed); `git check-ignore` prints `drafts/x.md` (confirming the dir is ignored — this also covers `.watermark.json`).

- [ ] **Step 3: Confirm the branch is ready for PR**

Run: `git log --oneline main..HEAD`
Expected: the sequence of commits from Tasks 1–14. The feature is complete: research reads work, the agent exists, the 5-min tick drafts one sub per tick + delivers to Telegram + advances a weekly watermark, and nothing posts to Reddit.
```
