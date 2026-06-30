# Design: Marketing landing page (SEO / AEO / GEO) + optimization agent

_Status: APPROVED (brainstorm) · 2026-06-30 · spec only, not yet built._

## Problem

AgentBoard has no public front door. `/` is the board and redirects logged-out
visitors straight to `/login`, so a first-time visitor never learns **what this
is, who it's for, or how to use it** — they just hit a login wall. We need a
public landing page that:

1. Explains the product (hero → how it works → about → FAQ → footer).
2. Is optimized for three discovery channels, by design:
   - **SEO** — classic search (Google/Bing): semantic HTML, meta + Open Graph,
     JSON-LD, sitemap/robots, fast load, E-E-A-T authority signals.
   - **AEO** — answer engines / featured snippets / voice: concise
     question→answer blocks, `FAQPage` + `HowTo` schema.
   - **GEO** — generative engines (ChatGPT, Perplexity, Google AI Overviews):
     crisp factual one-liners, extractable structured claims, clear entity
     identity so the page is *citable*.
3. Has a clear path to **log in → dashboard**.

## Decisions (brainstorm, 2026-06-30)

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | **Aesthetic: extend the operator-console look** (warm paper, mono ids, `SYS::` system bar, cut-corner cards), scaled up for marketing. | One cohesive brand; the landing *feels like* the product. Reuses `globals.css` tokens — no second design system. |
| L2 | **Routing: landing at `/`, app moves to `/board`.** Agents → `/board/agents`. Logged-in visitors hitting `/` get a "Go to board" affordance (not a forced redirect — they may want the marketing page). | SEO needs the root indexable as the marketing page. Clean separation of public vs app. |
| L3 | **Sections: Hero · How it works · About Us · FAQ · Footer** (as requested), each mapped to a standard so optimization is structural, not bolted on. | The five sections naturally carry SEO/AEO/GEO payloads. |
| L4 | **SEO/AEO/GEO agent = a build-time Claude Code subagent** (`.claude/agents/`), like `test-runner`. Audits + optimizes the page, generates sitemap/robots, scores snippet/citation readiness. NOT a runtime product agent. | Matches the other build/launch agents; helps *us* ship a well-optimized page. The runtime "optimize content" capability stays with the deferred social/launch agent. |
| L5 | **Login unchanged** (GitHub OAuth). Landing CTAs point to `/login`; post-login lands on `/board`. | Auth already works; this is purely additive. |

## Routing changes (L2)

```
/                → public landing (NEW, indexable, force-static where possible)
/board           → the board (MOVED from /)
/board/agents    → agents roster (MOVED from /agents)
/login           → unchanged
/auth/callback   → unchanged; post-login redirect target becomes /board
```
- `getSession()`/redirects in `/board/*` unchanged except path.
- `NEXT_PUBLIC_APP_ORIGIN` and the OAuth `redirectTo` stay; the callback's
  default `next` becomes `/board`.
- The board's MCP-config snippet still points at `/api/mcp` (unchanged).
- Update internal links (`Shell` nav, "Add your first agent" → `/board/agents`,
  filter bar hrefs `/board?...`).

## Sections (content + which standard each carries)

### 1. Hero  — *GEO + SEO value prop*
- **One-sentence definition** (the GEO citation target), e.g.:
  *"AgentBoard is an open-source, MCP-native control plane where you assign tasks
  to your AI agents and watch them work live."*
- H1 with the primary keyword phrase ("control plane for AI agents" / "assign
  tasks to AI agents over MCP"). Subhead = the wedge (agents aren't users; they
  connect over MCP). Primary CTA **"Sign in with GitHub"** → `/login`; secondary
  "How it works" anchor. A calm operator-console visual (a static board preview /
  `SYS:: LIVE` bar), not a screenshot dump.
- **GEO note:** lead with the plain factual definition in the first 100 words —
  generative engines extract early, declarative sentences.

### 2. How it works  — *AEO (`HowTo` schema)*
- 3–4 numbered steps mirroring the core loop: **(1)** Sign in → **(2)** Add an
  agent, get its MCP key → **(3)** Paste the key into your agent → **(4)** Assign
  tasks and watch them move live. Each step = a short imperative line + one
  sentence. Emit **`HowTo` JSON-LD** so answer engines can lift the steps.

### 3. About Us  — *SEO/GEO authority (E-E-A-T + entity)*
- What AgentBoard is, who builds it, why it exists (the "agents aren't users"
  thesis), open-source/MIT + self-hostable. Link to the GitHub repo. This is the
  authority/trust signal SEO rewards and the entity-clarity GEO needs. Emit
  **`Organization`** JSON-LD (name, url, logo, sameAs → GitHub).

### 4. FAQ  — *AEO (`FAQPage` schema)*
- 6–8 real question→answer pairs in the user's voice: "What is AgentBoard?",
  "How do agents connect?", "Do I need to write code?", "Is it free / open
  source?", "What's MCP?", "How is this different from JIRA/Linear?", "Can I
  self-host?". Concise answers (40–60 words) — the snippet/voice sweet spot. Emit
  **`FAQPage` JSON-LD**. Native `<details>`/`<summary>` for accordion (works
  without JS, a11y-friendly).

### 5. Footer  — *SEO sitemap + Organization*
- Nav links (How it works, About, FAQ, GitHub, Sign in), copyright, "open source
  · MIT", repo link. Reinforces internal linking + the Organization entity.

## Technical SEO/AEO/GEO baseline (cross-cutting)

- **Metadata:** Next `metadata` export — title, description, canonical, Open
  Graph + Twitter card, an OG image. Per-page (landing gets the marketing copy).
- **Structured data (JSON-LD):** `Organization` + `WebSite` (with
  `SearchAction` if ever relevant), `HowTo` (How it works), `FAQPage` (FAQ).
  One `<script type="application/ld+json">` block per schema.
- **`sitemap.xml` + `robots.txt`:** via Next's `app/sitemap.ts` + `app/robots.ts`.
  Landing indexable; `/board/*`, `/login`, `/api/*` disallowed from indexing.
- **Semantics + a11y:** one `<h1>`, logical heading order, `<section>` landmarks,
  `<nav>`, alt text, contrast ≥ 4.5:1 (reuse the design system's a11y baseline).
- **Performance (SEO ranking + GEO crawlability):** the landing is **static**
  (no auth, no DB) — `force-static`, minimal JS, system/Geist fonts already
  loaded. Fast LCP. This is the big SEO win the app pages can't have.
- **GEO specifics:** declarative factual sentences, a definition the model can
  quote verbatim, consistent entity naming ("AgentBoard"), and the FAQ/HowTo
  structured data doubling as extractable claims.

## The SEO/AEO/GEO agent (L4) — build-time

A Claude Code subagent `.claude/agents/seo-optimizer.md` (sibling of
`spike-runner`, `test-runner`). Scope: **audit + improve the marketing page's
discoverability**, not build features. Competencies:
- **SEO:** verify metadata/canonical/OG, heading structure, internal links,
  sitemap/robots correctness, image alt/sizing, Lighthouse SEO score (via the
  `/browse` lighthouse audit).
- **AEO:** validate `FAQPage`/`HowTo` JSON-LD (schema.org-valid, matches visible
  content), check answers are concise/snippet-shaped, question phrasing matches
  real queries.
- **GEO:** check the page leads with an extractable definition, factual
  declarative claims, entity consistency; flag vague marketing fluff that
  generative engines can't cite.
- **Output:** a scored report + concrete edits. Runs on the landing page;
  re-runnable after copy changes.

## Out of scope (v1 of the landing)

- Blog / content marketing system, pricing page, multiple marketing pages
  (one landing only).
- A/B testing, analytics beyond basic (add later).
- Light/dark toggle on the landing (commit to the one warm surface).
- The runtime "optimize my content for GEO" product agent (that's the deferred
  social/launch agent's territory).
- Actual copywriting polish — the spec defines structure + the optimization
  agent; final words can iterate.

## Testing (with implementation)

- **Static render:** landing renders without a session (no redirect to /login);
  all five sections + footer present.
- **Routing:** `/board` and `/board/agents` work behind auth; logged-out `/board`
  → `/login`; `/` is public; post-login → `/board`.
- **Structured data:** JSON-LD blocks are present and schema-valid (Organization,
  HowTo, FAQPage); they match the visible content.
- **SEO surface:** `sitemap.xml` and `robots.txt` resolve; `/board/*` disallowed.
- **a11y:** one h1, landmarks, `<details>` FAQ keyboard-operable, contrast.
- **No regressions:** existing board/agents/auth tests pass on the new paths.

## Open questions / risks

- **Moving `/` → `/board` touches every internal link + the OAuth post-login
  target.** Bounded but cross-cutting; do it in one pass and grep for hardcoded
  `/agents`, `href="/"`.
- **Real copy + an OG image** are needed for the page to be genuinely effective;
  the spec gives structure, not final words/art.
- **GEO is an emerging, fuzzy target** — best-effort (extractable claims +
  schema) rather than a measurable standard; revisit as the space matures.
