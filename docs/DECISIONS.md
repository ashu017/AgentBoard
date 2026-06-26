# AgentBoard — Decision Log

The living record of every design and architecture decision, with rationale. This is the
source of truth for *why* the project is shaped the way it is.

**How to maintain this file (read before editing):**
- Add a new entry whenever a decision is made. Use the next free ID.
- When a decision changes, **amend the entry** with a `Status: Superseded by <ID>` /
  `Revised <date>` note and keep the original reasoning. Never delete history — a reversed
  decision is itself information.
- Keep this consistent with `CLAUDE.md` and `docs/design.md` in the same change.
- Date format: YYYY-MM-DD.

Origin of the `D#` ids: these trace to the review sessions (CEO / design / eng) that
produced them; numbering is not contiguous and that's fine.

---

## Product & scope

### PROBLEM — What we're building
**Status:** Active · 2026-06-26
A human-in-the-loop manager console: a person assigns tasks to a fleet of AI agents and
watches status live; agents read/update their tasks over MCP. This is an **active
coordinator**, a deliberate reversal of an earlier **passive observatory** design (agents
just report, human watches). The observatory design is preserved in
`docs/design-superseded-observatory.md`.
**Why:** Running multiple agents, there's no glanceable console to hand out work and see
what's done/stuck/failed. The active-coordinator framing is the stronger, more
differentiated product.

### MODE — Scope reduction to one loop
**Status:** Active · 2026-06-26
The MVP is cut to the thinnest slice that proves one end-to-end loop (login → create →
assign → agent reads via MCP → agent updates → board moves live). Everything else is a
deferred follow-up.
**Why:** The new direction has three heavy subsystems (auth+tenancy, assignment UI, MCP
agent plane). Proving the loop end-to-end is the real risk; breadth is incremental.

### D11 — Directed assignment, not a pull pool
**Status:** Active · 2026-06-26
Manager assigns each task to one specific agent; agents list/update only their own tasks.
No shared unassigned pool / `claim_task` in v1.
**Why:** Matches the "manager distributes work" model and avoids claim-race concurrency in
the proving slice.

---

## Architecture & stack

### D9 / D-STACK — Next.js on Vercel + Supabase
**Status:** Active · 2026-06-26
Next.js (App Router, TS) on Vercel; Supabase for Postgres + Auth + Realtime + RLS. Human
login is GitHub OAuth (single provider for v1).
**Why:** Multi-tenant isolation is the highest-stakes property; Supabase RLS enforces it
at the database and bundles the auth + realtime the live board needs, and self-hosts
(keeps an OSS path open). Rejected: Neon+Auth.js+Pusher (assemble/secure everything
yourself), Convex+Clerk (two vendors, tenancy still in function code).
**Known trade (eng outside-voice #6):** v1 is single-tenant and defers DB-enforced agent
RLS, so the marquee RLS justification isn't fully exercised in v1. Accepted to set up the
v2 trajectory and avoid a later migration.

### 1A — MCP via the official SDK, stateless Streamable-HTTP
**Status:** Active · 2026-06-26
The agent interface is real MCP using the official MCP TypeScript SDK in stateless
Streamable-HTTP mode, as Next.js route handlers — not a bespoke JSON endpoint labeled
"MCP". Pin the SDK version. **Spike first** with a real MCP client; **named fallback** is a
non-serverless host (Fly.io/Railway) for the MCP route if serverless can't sustain it.
**Why:** "Plug your MCP agent in" is the product premise; standard agent clients must
connect out of the box. A bespoke endpoint risks not interoperating at all.

### D2 — Workspace bootstrap: app-code + UNIQUE (reversed from a DB trigger)
**Status:** Active · 2026-06-26 · **Revised** (originally a DB trigger on `auth.users`)
A new user's single workspace is created by an idempotent app-code `getOrCreateWorkspace()`
in the shared authenticated-session layer, guarded by `UNIQUE(owner_user_id)`.
**Why:** Originally chosen as a Postgres trigger on `auth.users` for a can't-forget
guarantee. The eng outside-voice flagged that a trigger couples signup availability to
trigger correctness (a trigger bug breaks signup) and needs `SECURITY DEFINER` +
`search_path` pinning (a footgun) and is awkward to test. App-code + a UNIQUE constraint
gives the same exactly-one guarantee while keeping signup robust and the logic testable.

---

## Security & data isolation

### D12 — Per-agent API key: shown once, hashed, revocable
**Status:** Active · 2026-06-26
Each agent gets one long-lived API key formatted `ab_<prefix>_<secret>`, shown exactly
once at creation, stored as a plain SHA-256 of the full token in an indexed column,
revocable via `revoked_at`. The `<secret>` segment alone carries ≥256 bits (the prefix is
public/displayed and must not count toward secret strength). Short-lived/rotating tokens
deferred.
**Why:** Standard, minimal agent-plane auth; hashed + revocable means a leak is
containable. No KDF needed (token entropy makes brute force infeasible) and a salted KDF
would break the indexed `WHERE api_key_hash = ?` lookup the MCP path needs every call.

### D13 / D15 — Agent-plane isolation: app-code scoping now, DB-enforced RLS deferred
**Status:** Active · 2026-06-26
v1 enforces agent-plane isolation with an app-code scoped query
(`WHERE workspace_id AND assigned_agent_id`). The full DB-enforced mechanism (SECURITY
DEFINER bootstrap + transaction-local GUC + transaction-mode pooling) is deferred to the
multi-user milestone and preserved in `docs/design.md` Appendix A.
**Why:** v1 is single-tenant — the cross-tenant threat doesn't exist until multi-user
ships (also deferred), so defer the defense to match the threat. The mandatory
cross-tenant test stays in v1 so the predicate can't silently vanish, making the later RLS
retrofit a bounded, test-guarded change. (Cross-model decision: the CEO-stage outside
voice argued for deferral against the inside review's "build it now"; deferral won.)

### 3A — Agent path runs on a confined service-role module
**Status:** Active · 2026-06-26
Because agent requests carry no user JWT (human-plane RLS would hide every row), the agent
path connects via the **service-role** key from one isolated server-only module
(`lib/agent-db.ts`) that exposes only scoped queries. Service-role never touches the human
UI path.
**Why:** Without this the agent's own queries return empty under RLS; stating it prevents
both that bug and over-broad service-role use leaking into the human UI (blast-radius
containment).

### D8 — Structural scope enforcement in the agent module
**Status:** Active · 2026-06-26
Every query in `lib/agent-db.ts` goes through a wrapper that *requires* `(workspace_id,
agent_id)` and injects the `WHERE`; there is no path to issue a raw unscoped query. The
cross-tenant test remains as a second layer.
**Why:** Service-role removes the DB safety net, so app-code scoping is the agent plane's
only boundary in v1. A single test only guards paths it exercises — a future unscoped query
would ship green and leak. Structural enforcement guards all paths (systems over heroes).

---

## Behavior, performance & reliability

### D-STATUS — Statuses + single source of truth
**Status:** Active · 2026-06-26
Statuses: `todo`, `in_progress`, `done`, `failed`. Transitions: `todo→in_progress`,
`todo→failed`, `in_progress→{done|failed}`, `in_progress→todo`. `done`/`failed` terminal
(exit → `409`). The enum + transition map live in one shared `lib/task-status.ts` imported
by the DB `CHECK`, MCP validators, UI, and tests.
**Why:** Cut from a larger set to the minimum the loop needs. Single source prevents the
classic drift where the API allows a move the UI can't render (DRY).

### D-SUBMIT — `submit_result` only on in_progress
**Status:** Active · 2026-06-26
`submit_result(task_id, output, status?)` is valid only on an `in_progress` task (on a
`todo` task → `409`); `output` capped at 256 KB (oversize → `413`). Optional terminal
`status` does result+transition in one transaction.
**Why:** An agent submitting a result implies it started work; the cap protects Realtime
payload size and board render.

### D9-RT — Realtime-RLS delivery is a prove-first gate
**Status:** Active · 2026-06-26
The board only receives an agent's live update if the agent-written (service-role) row
passes the *human* RLS SELECT policy. This is made an explicit sequenced gate with an
isolation test asserting a board client receives an agent-plane write under RLS.
**Why:** If the policy is wrong, writes commit but the board never moves and **nothing
errors** — a silent failure of the most-demoed feature. The gate makes it loud.

### D10 — Throttle `last_seen_at`
**Status:** Active · 2026-06-26
`last_seen_at` updates at most once per 30–60s per agent (skip if recent).
**Why:** `list_my_tasks` is polled in a loop and `agents` is under Realtime for the
connected indicator — writing on every call turns every read into a DB write + a Realtime
event (amplification + flooding on the hottest path). 30–60s is plenty for liveness.

### D6-INDEX — Composite indexes on hot paths
**Status:** Active · 2026-06-26
`tasks(workspace_id, assigned_agent_id)` for `list_my_tasks`; `tasks(workspace_id,
updated_at DESC)` for board load; `agents(api_key_hash)` for key lookup;
`task_events(task_id, created_at)` for the timeline.
**Why:** Keeps the hot read paths off table scans as tasks accumulate in long-running
deployments (the 24/7 case the product targets).

---

## Design & UX (from the design review, 2026-06-26)

### 1A-UI — Board prioritizes signal over symmetry
**Status:** Active · 2026-06-26
Board is a live monitor optimized for the 3-second "is anything wrong?" scan: a top
summary line, Failed loud (red rail/badge), Done quiet (muted, collapsible), Todo between.
A healthy board still reads calm.
**Why:** Equal columns bury the failure signal the tool exists to surface.

### 2A / 2.2A — Loading + write feedback
**Status:** Active · 2026-06-26
Board first-load shows skeleton columns (no false-empty flash). Write actions (create
task/agent, revoke) use the pending pattern: disable + spinner, inline error, success
resolves — locks against double-submit. Not optimistic.
**Why:** Avoids a confusing false-empty flash and prevents double-submit/silent-failure;
optimistic is overkill for low-frequency manager actions.

### 3A-UI — Agent "connected" indicator
**Status:** Active · 2026-06-26
The Agents screen shows each agent's `last_seen_at` + a connected dot that flips green on
the agent's first MCP call.
**Why:** Closes the scariest onboarding gap — confirms a freshly-created key actually works
before the manager assigns real work, instead of debugging in the dark.

### 4A — Developer/terminal visual system
**Status:** Active · 2026-06-26
APP-UI aesthetic: a real distinctive typeface (not Inter/Roboto/system-ui), monospace for
all machine identifiers, calm near-neutral surface (one of light/dark, committed), color =
status signal only (Failed red is the only loud color), CSS variables. Explicitly avoid the
AI-slop blacklist.
**Why:** "Build a Kanban board" defaults to generic AI-slop; naming the system gives the
tool identity and makes status color carry meaning.

### 6A — Desktop-first responsive + a11y baseline
**Status:** Active · 2026-06-26
Design for laptop/monitor; board scrolls horizontally and stays usable down to tablet, no
crash on phones (true mobile reflow deferred). A11y is non-negotiable: `aria-live` for
board updates (silent live board is invisible to screen readers), contrast ≥ 4.5:1,
keyboard nav + visible focus, 44px touch targets.
**Why:** It's a dashboard developers watch on big screens; but accessibility (esp. the
live-region trap) isn't viewport-dependent.

---

## Deferred (not built in v1)

Multi-user workspaces / invites / roles · DB-enforced agent RLS (Appendix A) · pull/claim
task pool · extra MCP tools (`get_task`, `add_comment`, `heartbeat`) · statuses
`blocked`/`in_review`/`backlog` · priorities/labels/due dates/comments · short-lived/
rotating agent tokens · published agent SDK · true mobile reflow · optimistic UI ·
light+dark theming · rendered visual mockups (needs an OpenAI key; recommended first UI
step) · per-key rate limiting (first follow-up; `last_seen_at` throttle blunts the
runaway-agent write pressure for now).

## Open / unvalidated risks

- **Remote MCP consumability:** the onboarding assumes the user's agent framework can
  consume a remote bearer-authed Streamable-HTTP MCP server (some clients may need a local
  proxy). The hardest user step; the MCP spike should confirm at least one target client.
- **Demand:** "managers want to hand-assign tasks to agents on a board" is the core bet,
  still unproven. Worth a rough demo in front of a few agent-runners before heavy build.
