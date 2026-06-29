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

### POSITION — Differentiation, wedge, and moat strategy
**Status:** Active · 2026-06-27
**The product is not a task board. It is the human-in-the-loop control plane for a fleet
of AI agents.** The board is the human's window into it, not the thing itself. One-line
positioning: *assign work to a fleet, watch it live, intervene when an agent stalls —
agent-native over MCP, open-source, self-hostable.*

**Why a board alone loses:** "tasks in columns" is a solved problem; Notion/JIRA win on it
and always will. "Agents hit an API to update tasks" is also not novel — JIRA has had a
REST API for years. If our answer to "why not JIRA?" is "we have a board and an API," we
have no answer.

**Why JIRA/Notion genuinely can't do this well (the wedge):** their assignee model assumes
a *human*.
1. **Agents aren't users.** Assigning work to an agent in JIRA means a license seat + a
   human-shaped account + a permissions model built for people. 30 agents = 30 seats + an
   IT conversation. No concept of a cheap, revocable, per-agent machine credential.
2. **Human-native interface, not machine-native.** JIRA = OAuth + REST + ticket-field
   semantics an agent must be taught, re-integrated each time. Agents speak **MCP** —
   discover tools, call them natively. Onboarding is "paste this config."
3. **No agent liveness.** A project tracker can't tell you "this assignee is a program that
   went silent 4 minutes ago mid-task." Our board is built around working/stuck/dead-now.
4. **Optimized for the wrong reader.** JIRA boards optimize for human sprint collaboration;
   ours optimizes for a 3-second "what broke?" scan of a running fleet.

**Honest limit — the wedge is a head start, not yet a moat.** JIRA could ship an MCP
server next quarter. "JIRA but agents connect over MCP" is copyable. The real moat must
come from things incumbents won't or can't easily do, and is where the roadmap points:
- **Agent-shaped primitives, not human-shaped ones:** tasks carry the agent's actual
  artifacts (result payload, tool-call trace, token cost, retries) and structured results
  — not a free-text comment a human reads. JIRA's data model fights this; ours is built
  for it.
- **The control loop, not just the board:** routing work to a fleet, pull/claim,
  load-balancing, retry-on-failure, and escalation to a human when an agent is stuck — an
  orchestration layer with a human in it, distinct from a project tracker.
- **Open-source + self-host + MCP-native** positioning that a seats-and-cloud-lock-in
  incumbent structurally won't match.

**What this changes:** the MVP loop is unchanged; what we *emphasize* (agent-native control
plane, not "task board") and what we build *next* (approvals, results-as-artifacts,
liveness/escalation — not more board polish) both point at the moat. See the
"Open / unvalidated risks" section for the differentiation risk this is still exposed to.

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
**Status:** Active · 2026-06-26 · **PROVEN 2026-06-29 (S0 Gate A PASS, deployed Vercel)**
The agent interface is real MCP using the official MCP TypeScript SDK in stateless
Streamable-HTTP mode, as Next.js route handlers — not a bespoke JSON endpoint labeled
"MCP". Pin the SDK version. **Spike first** with a real MCP client; **named fallback** is a
non-serverless host (Fly.io/Railway) for the MCP route if serverless can't sustain it.
**Why:** "Plug your MCP agent in" is the product premise; standard agent clients must
connect out of the box. A bespoke endpoint risks not interoperating at all.
**Refined 2026-06-27 (S0 scaffold finding):** the bare MCP SDK's
`StreamableHTTPServerTransport` expects Node `IncomingMessage`/`ServerResponse` and does
**not** drop into a Next.js App-Router route handler (which is Fetch `Request`/`Response`)
— typecheck fails outright. Fix: use Vercel's **`mcp-handler`** adapter, which wraps the
MCP SDK and bridges Fetch↔Node + stateless serverless. Version pin: `mcp-handler@^1.1.0`
peer-requires `@modelcontextprotocol/sdk@1.26.0` (not `^1.29`) — keep them aligned. The
scaffold route (`src/app/api/mcp/route.ts`) builds clean on this combo; full S0 gate (real
MCP client connects on deployed Vercel) still pending a deploy.
**Second scaffold finding:** client code must not read `NEXT_PUBLIC_*` at module load
(build-time prerender has no env → crash). The board page lazily constructs the Supabase
client and is `force-dynamic`.

**Gate A result — 2026-06-29 (deployed `https://jiraagent.vercel.app/api/mcp`): FAIL —
two distinct blockers, both fixable; NOT named-fallback territory (no evidence serverless
cannot sustain MCP).** Drove a real client — official `@modelcontextprotocol/sdk` `Client`
+ `StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: {
Authorization: "Bearer <AGENT_SPIKE_TOKEN from .env.local>" } } })` — and corroborated
with raw `curl`. Repro: `node scripts/gate-a-deployed.mjs` (parses `.env.local`, never
prints the token; `GATE_A_ENDPOINT` env var overrides the URL for local runs).

1. **Blocker #1 — Vercel `AGENT_SPIKE_TOKEN` mismatch (auth, the 401).** The deployed
   handshake fails at `initialize` with HTTP **401 `{"error":"unauthorized"}`** — the
   route's own auth body, returned *before* `mcp-handler` runs. Proven to be an env
   mismatch, not a client/transport bug: the **same** token in `.env.local`, sent in the
   **same** `Authorization: Bearer …` header, is **accepted locally** (reaches the handler
   — see blocker #2) but **rejected on Vercel**. Since `route.ts` returns that body only
   when the header is not `Bearer ` + `process.env.AGENT_SPIKE_TOKEN`, and the header is
   provably present, the deployed `AGENT_SPIKE_TOKEN` either differs from `.env.local` or
   is unset on Vercel (unset → `expected` undefined → `authed()` false).
   **Fix:** set the Vercel `AGENT_SPIKE_TOKEN` env var to exactly the `.env.local` value
   (32 chars here) and **redeploy** (env changes do not apply to existing deployments).
2. **Blocker #2 — `mcp-handler` basePath misconfig (the handler 404), hidden behind the
   401 on deployed but reproduced locally.** With a valid token, the local endpoint returns
   HTTP **404 `Not found`** instead of an MCP response. Cause: `createMcpHandler(...)` in
   `route.ts` is called with **no options**, so `mcp-handler@1.1.0` defaults
   `streamableHttpEndpoint` to `/mcp` and matches it as `url.pathname === streamableHttpEndpoint`
   (dist/index.js:279). Our route lives at **`/api/mcp`**, so the pathname never matches and
   it falls through to the catch-all 404 (dist/index.js:676). Bearer auth passes (404, not
   401, confirms the handler was reached) — this is purely a path-prefix bug.
   **Fix:** tell `mcp-handler` about the `/api` prefix —
   `createMcpHandler(setup, serverOptions, { basePath: "/api" })` (or
   `{ streamableHttpEndpoint: "/api/mcp" }`). One-line scaffold fix, *not* a product feature.
   **Note:** `mcp-handler`'s GET/SSE stream path additionally wants `REDIS_URL`/`KV_URL`
   (dist/index.js:181 throws "redisUrl is required"); the stateless POST handshake does not
   need it, but a client that opens the GET stream would. Confirm during re-test whether the
   target client only POSTs (works statelessly) or also opens the stream (then provision
   KV/Redis on Vercel).

**Sequencing to close Gate A:** fix #2 in `route.ts` and reconcile #1's Vercel env var,
redeploy, then re-run `node scripts/gate-a-deployed.mjs`. Cold-start/streaming behavior
could not yet be assessed — both failures occur at/before `initialize`, so the deployed
function never executed tool logic. No `tasks` rows were created (both calls failed before
the insert; table verified empty via service-role). Artifact left in repo:
`scripts/gate-a-deployed.mjs` (the reusable real-client driver).

**Gate A re-test — 2026-06-29 (deployed `https://jiraagent.vercel.app/api/mcp`): PASS —
full end-to-end through a real MCP client on deployed serverless.** Both prior blockers are
fixed: #2 by `createMcpHandler(setup, {}, { basePath: "/api" })` in `route.ts` (committed
`08fbd1d`); #1 by reconciling the Vercel `AGENT_SPIKE_TOKEN` env var to `.env.local` and
redeploying. Re-ran with a real client (official `@modelcontextprotocol/sdk` `Client` +
`StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization:
"Bearer <AGENT_SPIKE_TOKEN>" } } })`) driving the complete flow + a service-role DB read-back.
Repro: `node scripts/gate-a-deployed-full.mjs` (parses `.env.local`, never prints secrets).
Observed, step by step:
1. **`initialize`** — 200. `serverInfo = {"name":"mcp-typescript server on vercel","version":"0.1.0"}`,
   `capabilities = {"tools":{"listChanged":true}}`. Transport `sessionId` was **none** — the
   client negotiated the stateless path, no session header issued.
2. **`tools/list`** — returns `update_task` with the expected JSON-Schema: `title` (string,
   minLength 1) **required**; `status` enum `["todo","in_progress","in_review","done","failed"]`
   default `in_progress`; `result` optional string maxLength 4000.
3. **`tools/call update_task`** (title "gate-a deployed proof …", status `in_review`,
   result set) — `isError=false`, returned `ok: {"id":"38c84845-…","title":…,"status":"in_review"}`.
4. **Service-role DB read-back** — row present with `status="in_review"`, matching title/result,
   `updated_at` set. The MCP tool's service-role insert genuinely landed in Postgres.
5. **Cleanup** — deleted the row; `tasks` count back to **0**. No artifacts left in the DB.

**Serverless specifics observed:** cold-start first call (`initialize`) ~2.2s on a cold
function; warm second run ~0.9s. `tools/call` (incl. the Supabase insert) ~1.1–1.6s. The
stateless POST/streaming response worked cleanly through the real SDK client; **no retries**
were needed on either run, and behavior was reproducible across two runs.

**Redis/KV question — RESOLVED: not required for the flow real clients use.** No
`REDIS_URL`/`KV_URL`/Upstash var is set on the project, and the full handshake → tool-call
flow above succeeds without one. The real SDK client uses the **stateless POST** path and
never opens a GET stream (confirmed: `transport.sessionId` was none). A direct `GET /api/mcp`
(SSE-stream open) returns a clean **HTTP 405 `{"jsonrpc":"2.0","error":{"code":-32000,
"message":"Method not allowed."}}`** — i.e. `mcp-handler` declines the stream in stateless
mode rather than crashing on the missing `redisUrl`. So Vercel KV/Redis does **not** need to
be provisioned for S0 (or for the v1 agent-write flow). It would only matter if a future
client *requires* the server-initiated GET/SSE stream (e.g. server→client notifications); if
that need arises in S1+, provision Vercel KV then. Not a blocker now.

**Verdict: S0 Gate A PASS.** With Gate B already PROVEN (D9-RT), **both S0 gates are green —
S0 is fully cleared** and feature work (S1) is unblocked. Artifact left in repo:
`scripts/gate-a-deployed-full.mjs` (full end-to-end driver: handshake → tools/list → call →
DB read-back → cleanup); the earlier `scripts/gate-a-deployed.mjs` remains as the minimal driver.

### S1-P1 — Phase 1 foundation built (status module + schema + RLS)
**Status:** Active · 2026-06-29
First S1 implementation phase landed: the shared status module, the real v1 schema, and
human-plane RLS — backend only, no UI/auth yet.
- **`src/lib/task-status.ts`** is the single source of truth (CLAUDE.md convention):
  `STATUSES` (5, incl. `in_review`), `isStatus`/`isTerminal`/`canTransition`/
  `allowedTransitions`/`INITIAL_STATUS`. Per D-STATUS, `in_review` is reachable
  (`in_progress→in_review`) but has **no legal outgoing transition** — that's Level B
  (deferred). 34-case exhaustive matrix test in `task-status.test.ts`.
- **Migration `0003_s1_schema.sql`** drops the S0 spike `tasks` table (empty; design.md
  said the spike schema is not the v1 schema) and creates `workspaces`/`agents`/`tasks`/
  `task_events` per design.md "Data model (MVP)", with D6-INDEX composite indexes, the
  status CHECK mirroring `STATUSES`, and `tasks` re-added to the `supabase_realtime`
  publication. Applied to the live DB; security advisors clean for these tables.
- **Human-plane RLS now** (DECISIONS D13/D15): one `*_owner_all` policy per table, visible
  iff the workspace's `owner_user_id = auth.uid()`. **No agent-plane policies** — the agent
  path uses service-role + app-code scoping (deferred DB RLS = Appendix A). The `tasks`
  policy is the one the live board depends on (D9-RT).
- **Testing:** Vitest installed (`npm test`); `tests/schema-status-check.test.ts` asserts
  every status CHECK in the migration equals `STATUSES` (drift guard). 36 tests green.
- **Pre-existing advisor note (not mine):** a `public.rls_auto_enable()` SECURITY DEFINER
  function (predates these migrations) triggers two security WARNs — left untouched, flagged
  for later review.
**Next phases:** agent MCP plane (`lib/agent-db.ts` scoped wrapper + 3 tools + key
gen/hash + cross-tenant test), then auth/session layer + `getOrCreateWorkspace` (D2), then
the 3 UI screens, then E2E.

### S1-P2 — Phase 2 built: the agent MCP plane (3 tools, scoped, atomic)
**Status:** Active · 2026-06-29
The full agent plane landed and is proven end-to-end through a real MCP client.
- **`src/lib/api-key.ts`** — `ab_<prefix>_<secret>` gen (256-bit secret), SHA-256 hash of
  the full token, prefix extraction, constant-time compare (D12). Unit-tested incl. a
  1000× uniqueness check.
- **`src/lib/agent-db.ts`** — the confined, `server-only` service-role module (3A). D8
  structural scoping: `scopedTasks(ctx)` is private and the ONLY task-query path, and it
  *requires* an `AgentContext` (the sole way to get one is `resolveAgentByKey`), so no
  unscoped query can be written against this surface. Ops: `resolveAgentByKey`,
  `listMyTasks`, `updateTaskStatus`, `submitResult`, throttled `touchLastSeen` (D10, 45s).
- **`src/lib/agent-errors.ts`** — typed `AgentError` mapping the contract (400/401/404/409/
  413); not-your-task is **404 never 403**.
- **Migration `0004_agent_rpcs.sql`** — two Postgres functions resolve the
  "no multi-statement txn in supabase-js" problem: `append_task_event` (the single
  event-construction point) and `agent_apply_transition` (atomic compare-and-swap on
  `status = p_from` = the **lost-update guard**, + event, in one txn). Transition
  *legality* stays in `task-status.ts` (SSOT) — the RPC only does the CAS. RPCs revoked
  from anon/authenticated (service-role only).
- **`src/app/api/mcp/route.ts`** — replaced the S0 spike's single `update_task` with the 3
  real tools. Auth changed from one shared `AGENT_SPIKE_TOKEN` to **per-agent keys** via
  `withMcpAuth` (resolves the key → `AgentContext` in `authInfo.extra`; bad/revoked/unknown
  → 401). Production build passes; `/api/mcp` is a dynamic function.
- **Tests:** 60 green. Unit (status matrix, api-key) + **live-DB integration** incl. the
  **CRITICAL cross-tenant isolation trio** (A can't read/update/submit to B's tasks — sees
  404), revoked-key 401, the full transition/submit/413 contract, and the D10 throttle.
  Plus a runtime smoke (`scripts/phase2-tools-smoke.mjs`) driving all 3 tools through a real
  SDK client: handshake → list → update → submit → illegal-transition-409, DB end state
  verified.
- **Test-hygiene fix:** integration teardown now deletes the workspace explicitly (cascade)
  + the auth user and surfaces errors, instead of relying on `deleteUser` cascade with
  swallowed errors (which left orphaned rows when the process exited early). Full run now
  leaves the DB at 0 rows.
**Auth note:** `AGENT_SPIKE_TOKEN` is no longer used by the route. The deployed endpoint
now expects a real per-agent key — the old spike token will get 401. (S0 gate scripts that
used it are historical.)

### S1-P3 — Phase 3 built: auth foundation + the 3 UI screens (operator console)
**Status:** Active · 2026-06-29
The human half landed and the full MVP loop is proven end-to-end in a real browser.
- **Auth (3a):** `@supabase/ssr` clients (`supabase-server` cookie-bound user session +
  `supabase-browser` for board Realtime); `proxy.ts` (Next 16's renamed middleware)
  refreshes the session and skips `/api/mcp`. `getOrCreateWorkspace` (D2, idempotent +
  race-safe), `session.ts`, and `manager-actions.ts` (createAgent shown-once key /
  revokeAgent / createTask + created event). +5 live-DB tests incl. workspace-bootstrap and
  the human-plane RLS-deny.
- **Design system:** `globals.css` implements the 4A operator-console aesthetic from the
  Figma Make reference — warm paper `#f0ece6` on a faint grid, monospace ids, cut-corner
  cards, color = status signal (Failed magenta the only loud one), `SYS::` system bar.
- **3 screens:** Board (`page.tsx`+`BoardClient` — live Realtime subscribe-then-refetch,
  scan summary line, Failed-loud/Done-quiet 5 columns, aria-live a11y, no-agents/empty
  states, New-task panel = Screen 3); Agents (`agents/` — roster + connected dot +
  **shown-once key panel with paste-ready MCP config**); Login (`login/` — GitHub button
  parked + dev-login shim).
- **Dev login:** `DEV_LOGIN=1`-gated shim (`login/actions.ts` + `dev-flags.ts`) so the board
  is usable before GitHub OAuth is wired. Real flow = GitHub OAuth (Phase 3b).
- **Verified in-browser (gstack /browse):** dev login → workspace bootstrapped → create
  agent → shown-once key + MCP snippet → create+assign task → drove `update_task_status` via
  a REAL MCP client → board reflects the move, summary line updates, connected dot flips
  (D10 last_seen). tsc clean, lint 0, build passes, 65 tests green.
**Still open (Phase 3b — account-gated):** real GitHub OAuth (OAuth App + Supabase provider
+ callback route) replacing the dev shim; then E2E (Playwright) + remaining must-have tests
(concurrent-transition guard, board states).
**Known limitation:** Realtime live-move couldn't be confirmed through the browse CLI (it
snapshots, doesn't keep page JS running); Gate B already PROVED Realtime delivery at the DB
level (D9-RT) and a reload confirms persistence. A Playwright E2E will assert the no-reload
move in Phase 4.

### S1-P3b — Agent delete (guarded) + always-active New-task
**Status:** Active · 2026-06-30
Two UI/behavior refinements on top of S1-P3, both deliberate:
- **Delete an agent ONLY when it has zero tasks** (`deleteAgent` in
  manager-actions; `deleteAgentAction`). The roster shows **Delete** for
  task-free agents and **Revoke** for agents with history. Rationale: revoke
  (set `revoked_at`, next MCP call → 401) preserves the audit trail and is
  required because `tasks.assigned_agent_id` is `on delete restrict` — a hard
  delete of an agent with tasks fails at the DB. Delete is purely for cleaning up
  a mistakenly-created agent. App-level precheck on `task_count` + the FK are both
  in play; an integration test asserts the DB rejects deleting an agent with a
  task and allows one without. `listAgents` now returns `task_count` via the
  embedded `tasks(count)` aggregate to drive the Delete/Revoke choice.
- **"New task" is always active.** Previously disabled when no agents existed;
  now it always opens the modal, and with an empty fleet the modal shows a witty
  "No agents on duty" message ("A task with no one to do it is just a wish…") with
  an "Add an agent" shortcut, instead of a dead button or an assignee-less form.
**Why:** keeps D12 revoke semantics intact (revoke ≠ delete) while allowing
cleanup of empty agents; and a disabled primary action with no explanation is
worse UX than an always-live button that explains itself.

### S1-P3c — GitHub OAuth live (production loginnable)
**Status:** Active · 2026-06-30
Real GitHub OAuth is wired and **verified end-to-end in production**. A real login
(`sahuash017@gmail.com`, provider `github`) created the user and auto-bootstrapped
"My Workspace" (D2 fired on first authenticated request).
- **Code:** `/auth/callback` route (exchangeCodeForSession → board; failure →
  `/login?error=oauth`), `signInWithGitHub` action (signInWithOAuth github,
  redirectTo `${NEXT_PUBLIC_APP_ORIGIN}/auth/callback`), real "Continue with
  GitHub" button. Dev-login shim retained (local only, DEV_LOGIN=1).
- **Config (manual, by owner):** GitHub **OAuth App** (NOT a GitHub App) with
  callback = the Supabase `/auth/v1/callback`; Supabase GitHub provider creds +
  redirect allow-list incl. `/auth/callback`; Vercel `NEXT_PUBLIC_APP_ORIGIN` =
  prod URL. Note: `NEXT_PUBLIC_*` is build-time, so changing it needs a redeploy.
- **Hardening:** migration `0005` pins `search_path` on `append_task_event` and
  `agent_apply_transition` (advisor 0011). Remaining advisor WARNs are
  pre-existing `rls_auto_enable()` (not ours) and leaked-password-protection
  (irrelevant — OAuth only, no passwords).
**Still open:** Phase 4 — Playwright E2E (incl. the no-reload Realtime move) +
the concurrent-transition guard test. Then the Level B approval loop (the moat).

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
**Status:** Active · 2026-06-26 · **Revised 2026-06-29** (added `in_review`)
Statuses: `todo`, `in_progress`, `in_review`, `done`, `failed`. Transitions:
`todo→in_progress`, `todo→failed`, `in_progress→{in_review|done|failed}`,
`in_progress→todo`, and (Level B, later) `in_review→{in_progress|done|failed}` on human
resolution. `done`/`failed` terminal (exit → `409`). The enum + transition map live in one
shared `lib/task-status.ts` imported by the DB `CHECK`, MCP validators, UI, and tests.
**`in_review` added 2026-06-29 (Level A — status only):** an agent can park a task
awaiting human approval; it's visible on the board. This is the approval-gate primitive
from POSITION (a moat piece). The resolution loop (human Approve/Reject + an MCP tool for
the agent to read the verdict and resume) is **Level B**, deferred as the next deliberate
feature — it's the first human write-action on the board, so it gets real design, not a
mid-spike bolt-on. Migration `0002_add_in_review.sql` widens the live CHECK constraint.
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
**Status:** Active · 2026-06-26 · **PROVEN 2026-06-29 (S0 Gate B PASS, local)**
The board only receives an agent's live update if the agent-written (service-role) row
passes the *human* RLS SELECT policy. This is made an explicit sequenced gate with an
isolation test asserting a board client receives an agent-plane write under RLS.
**Why:** If the policy is wrong, writes commit but the board never moves and **nothing
errors** — a silent failure of the most-demoed feature. The gate makes it loud.

**Gate B result — 2026-06-29 (live Supabase `ltdyxrfposxejokhikca`, local subscriber):
PASS.** A real subscribed client (anon/publishable key, `postgres_changes` on
`public.tasks`, `event:"*"` — the exact client shape `src/app/page.tsx` uses) reached
`SUBSCRIBED`, then received every service-role write live under the `s0_anon_read_tasks`
RLS SELECT policy: **INSERT** (todo), **UPDATE** (→in_progress), and the newly-enabled
**in_review** UPDATE. Latencies were ~60–600ms (two runs); no silent drop. The silent-
failure mode D9-RT guards against did **not** occur with this config. What makes it work
in this spike: (1) `tasks` is in the `supabase_realtime` publication (migration 0001);
(2) RLS is enabled with an anon SELECT policy `using (true)` — Realtime authorizes
`postgres_changes` delivery by re-checking the subscriber's RLS read access against each
changed row, so the SELECT policy must admit the row or the event is dropped silently;
(3) the writer uses the service-role key (bypasses RLS to write), the subscriber uses the
anon key (subject to RLS). Repro: `node scripts/spike-gateB-realtime.mjs` (parses
`.env.local`, asserts each event arrives within an 8s timeout, deletes its row; table left
empty). **Caveats / still open:** this is the deliberately-loose S0 spike policy
(`using (true)` admits all rows). The real D9-RT risk lands in **S1** when the SELECT
policy becomes workspace-scoped (`owner_user_id = auth.uid()`) — the failure to hunt then
is: a service-role write must still match the *authenticated* subscriber's scoped policy,
or the board for that owner goes silent. That scoped-policy delivery must be re-proven in
S1 (it is not proven by this spike). Also unproven here: delivery against a **deployed**
Realtime path under serverless conditions — Realtime runs as a Supabase-hosted service
(not a Vercel function), so a Vercel deploy is not required to exercise it, but the
end-to-end board page on Vercel was not run (no deploy yet; Gate A still blocked).

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

**Visual reference (noted 2026-06-27, decide later):** a Figma Make "operator console"
task dashboard —
https://www.figma.com/make/9DyXcOrZRgAlDQvODiot2K/Personal-tasks-dashboard — is a strong
candidate base. It's React + Tailwind v4 + shadcn/ui in a terminal/operator aesthetic that
matches 4A well: monospace throughout, `SYS::`/`LIVE` system bar, stat chips, completion
bar, cut-corner clip-path cards. Palette is warm (paper `#f0ece6`, orange `#e84500`,
accent/destructive `#cc0055`, blue `#0088cc`) on a grid background — a committed direction,
though cooler/darker is also open. **Not yet adopted.** If adopted, required adaptations:
add a 4th **Failed** column (loudest), replace personal-task fields (priority/dueDate/tags)
with **agent fields** (assigned agent + mono key-prefix, last-seen, result/error excerpt),
make the board **read-only for status** (agents drive it via MCP), and apply the
Failed-loud / Done-quiet hierarchy (1A-UI). The Agents screen + key-reveal don't exist in
the reference and would be new.

### 6A — Desktop-first responsive + a11y baseline
**Status:** Active · 2026-06-26
Design for laptop/monitor; board scrolls horizontally and stays usable down to tablet, no
crash on phones (true mobile reflow deferred). A11y is non-negotiable: `aria-live` for
board updates (silent live board is invisible to screen readers), contrast ≥ 4.5:1,
keyboard nav + visible focus, 44px touch targets.
**Why:** It's a dashboard developers watch on big screens; but accessibility (esp. the
live-region trap) isn't viewport-dependent.

---

## Next phase — planned, not built (roadmap)

Captured for a future phase; no code/agent files created yet.

### NEXT-1 — Hierarchical tasks (project → task) + agent decomposition + board filters
**Status:** Spec'd 2026-06-30 · not built. Full design:
`docs/superpowers/specs/2026-06-30-hierarchical-tasks-design.md`. In brief: single
recursive `tasks` table (`parent_id`, depth-capped at 2, recursion-ready); a "project" is
a parent-less task with children; humans **and** agents create child tasks (new
`create_subtask` MCP tool); subagents stay internal to the agent runtime; agent owns parent
status (no rollup, board shows `N/M done`); board gains timeline (2w default / 30d / 90d /
all, on `updated_at`) + status (active default / all) filters.

### NEXT-2 — Recurring tasks
**Status:** Flagged, not designed. Schedule/cron semantics on a project or task (likely a
recurrence rule + a scheduler that clones a template on a cadence). To be designed
separately; noted so NEXT-1's model choices don't box it in (template-vs-instance may
reopen the data model).

### NEXT-3 — Build/launch subagents (Claude Code agents in `.claude/agents/`)
**Status:** Planned, not created (deferred 2026-06-30 at user request). These are **Claude
Code subagents** that help build/test/launch AgentBoard (like the existing `spike-runner`),
NOT AgentBoard product agents — though the dogfooding dream is to eventually run them
*through* the board over MCP. Candidates, roughly by near-term value to this project:
- **Testing agent** — Vitest + Playwright (UI / smoke / synthetic / backend); would own the
  pending Phase 4 E2E work.
- **Development agent** — one dev agent that invokes existing engineering skills
  (`senior-frontend` / `senior-backend` / `senior-security` / architect) rather than
  bundling personas.
- **DB / migration agent** — Supabase migrations, RLS policies, advisor remediation.
- **Deploy / release agent** — Vercel deploys, env vars, deploy health, rollback, release notes.
- **Security / isolation agent** — cross-tenant isolation, RLS-deny tests, service-role
  boundary, advisor scans.
- **Social / launch agent** — drafts posts for Reddit (subreddits), Hacker News, Product
  Hunt, LinkedIn. **Draft-only**; actual posting needs API creds + per-post human approval
  (outward-facing).
- **Design agent** (low priority) — Figma UI designs. Partly blocked: Figma MCP is on the
  Amazon account (IP concern) until a personal Figma is sorted.
- **Docs / decision-log agent** — keeps DECISIONS/design/CLAUDE/HANDOFF consistent + release notes.
- **Demo-seed agent** — seeds realistic agents+tasks for screenshots/demos/launch assets.
- **MCP-integration agent** — owns the agent plane (MCP tools, SDK upgrades, real external
  client testing) beyond `spike-runner`'s S0-only scope.
Open scoping questions to resolve when building: per-agent scope (test-only vs test+fix),
dev-agent-invokes-skills vs separate agents, and whether these later become product agents.

## Deferred (not built in v1)

Multi-user workspaces / invites / roles · DB-enforced agent RLS (Appendix A) · pull/claim
task pool · extra MCP tools (`get_task`, `add_comment`, `heartbeat`) · statuses
`blocked`/`backlog` · **Level B approval loop** (human Approve/Reject on `in_review` + an
MCP verdict-read tool so the agent resumes — the moat-defining human-in-the-loop gate; next
deliberate feature after S0) · priorities/labels/due dates/comments · short-lived/
rotating agent tokens · published agent SDK · true mobile reflow · optimistic UI ·
light+dark theming · rendered visual mockups (needs an OpenAI key; recommended first UI
step) · per-key rate limiting (first follow-up; `last_seen_at` throttle blunts the
runaway-agent write pressure for now).

(`in_review` itself is no longer deferred — pulled into scope 2026-06-29 at Level A;
see D-STATUS.)

## Open / unvalidated risks

- **Remote MCP consumability:** the onboarding assumes the user's agent framework can
  consume a remote bearer-authed Streamable-HTTP MCP server (some clients may need a local
  proxy). The hardest user step; the MCP spike should confirm at least one target client.
- **Demand:** "managers want to hand-assign tasks to agents on a board" is the core bet,
  still unproven. Worth a rough demo in front of a few agent-runners before heavy build.
- **Moat durability (see POSITION):** the agent-native/MCP wedge is a head start, not yet
  defensible — an incumbent could ship an MCP server and copy it. The bet is that
  agent-shaped primitives + the control loop + OSS/self-host positioning compound into a
  moat incumbents won't match. Unproven; the roadmap (approvals, results-as-artifacts,
  liveness/escalation) is what tests it. If those don't differentiate in practice, revisit
  whether this should be a standalone product vs. an MCP layer on an existing tracker.
