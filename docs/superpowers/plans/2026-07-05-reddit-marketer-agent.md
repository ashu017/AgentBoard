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
- Modify: `.env.example` — document optional `REDDIT_USER_AGENT` + `REDDIT_BEARER_TOKEN`.

Analysis of the top-100 (themes, title shapes) is done by the agent itself (it's an LLM) — no `analyze.mjs` script (YAGNI).

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
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore(reddit): gitignore drafts, document optional research env vars"
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

Each entry: what the community is, and its self-promo posture. Verify rules against the
sub's current sidebar/wiki before drafting — rules change.

- **r/alphaandbetausers** — early adopters seeking apps to test. Self-promo is the point;
  a clear "looking for beta testers" post fits. Kind: text or link.
- **r/SideProject** — makers sharing projects. Show-and-tell welcome; be genuine, no
  hard-sell. Kind: text (with a link in body). Flair often required.
- **r/SaaS** — SaaS builders/operators. Value-first (lessons, metrics, teardowns) far
  outperforms "check out my app." Self-promo often confined to weekly threads — check.
- **r/artificial** — broad AI audience. Must lead with an idea/insight; naked promo removed.
  Frame AgentBoard as a concrete example within a substantive point.
- **r/mcp** — Model Context Protocol community; highly relevant (AgentBoard is MCP-native).
  Technical, genuine "here's how we used MCP for X" posts land well. Kind: text.

Add subs only when you can state the community + its self-promo rule. If a sub bans
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

## Task 8: Full test sweep + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass, including the new `tests/reddit/lib.test.ts` (14 tests). No live Reddit calls occur in the suite.

- [ ] **Step 2: Confirm no secrets or drafts are tracked**

Run: `git status --short && git check-ignore drafts/x.md`
Expected: clean tree (all work committed); `git check-ignore` prints `drafts/x.md` (confirming the dir is ignored).

- [ ] **Step 3: Confirm the branch is ready for PR**

Run: `git log --oneline main..HEAD`
Expected: the sequence of commits from Tasks 1–7. The feature is complete: research reads work, the agent exists, nothing posts.
```
