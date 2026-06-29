# AgentBoard — Session Handoff

_Living snapshot of in-flight state for the next session/tab. Delete or update freely.
Last updated: 2026-06-29 (DB migrations applied — see below)._

Read `CLAUDE.md` + `docs/DECISIONS.md` + `docs/design.md` first — they hold the durable
context (what we're building, the locked stack, every decision). This note only captures
the **loose ends not yet reflected in code/docs**.

## Where things stand

- Repo: https://github.com/ashu017/AgentBoard — branch `main`, last commit `565f7c8`.
- Status: **S0 scaffold** (Next.js app that exists to run the two S0 gates, not the product).
- The app **boots and serves**; build + typecheck pass.

## ✅ DB migrations applied (2026-06-29)

Both done & verified via Supabase MCP (project `ltdyxrfposxejokhikca`). The live DB
turned out to be **empty** (no `tasks`, no recorded migrations) — `0001` had never been
applied — so both ran in order:
1. **`0001_s0_tasks`** — created `public.tasks`, enabled RLS + `s0_anon_read_tasks`
   (anon SELECT) policy, added `tasks` to the `supabase_realtime` publication.
2. **`0002_add_in_review`** — widened `tasks_status_check` to the 5-value set
   (`todo, in_progress, in_review, done, failed`).

Verified: CHECK lists all 5 values; RLS on with 1 policy; `tasks` in realtime
publication; an `in_review` INSERT (the write that previously failed) succeeded, and the
smoke-test row was deleted. `list_migrations` now shows both `0001` and `0002`.

## Environment / gotchas

- **Run the dev server on port 3100, NOT 3000:** `npm run dev -- -p 3100`. An unrelated
  **ssh tunnel occupies localhost:3000** and silently shadows it — wasted a debug cycle.
- `.env.local` exists (gitignored). Uses Supabase's **new key system**, var names:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser),
  `SUPABASE_SECRET_KEY` (server-only), `SUPABASE_JWKS_URL` (parked for S1 auth),
  `AGENT_SPIKE_TOKEN` (MCP bearer).
- `.npmrc` pins the **public npm registry** (machine global points at Amazon CodeArtifact,
  which 401s for public installs — don't remove this file).
- `.mcp.json` (supabase, project scope) is **untracked** — decide whether to commit it.
  Committing publishes the `project_ref` (not a secret, but links the public repo to your
  project). `next-env.d.ts` shows as modified — generated, ignore.

## The two S0 gates (the actual goal — still UNPROVEN)

Neither is proven yet; the scaffold just makes them runnable. Use the `spike-runner`
agent (`.claude/agents/spike-runner.md`) to drive them once a Vercel deploy exists.
- **Gate A — MCP on Vercel:** a real MCP client connects to `/api/mcp` (stateless,
  `mcp-handler`) on a deployed Vercel function. Local 401-auth works; deployed handshake
  untested. Needs a Vercel deployment (account-gated — user does it).
- **Gate B — Realtime under RLS:** a service-role write reaches the board live. The
  silent-failure to hunt: write commits but board never updates if the RLS policy is off.
  Test against the live Supabase project.

## Other open threads (not blocking)

- **Figma MCP is on the Amazon account** (`ashunsah@amazon.com`), not personal — decide if
  AgentBoard design work should move to a personal Figma. A Make design was noted as a
  visual reference (DECISIONS → 4A), **not yet adopted**.
- **Level B approval loop** (human Approve/Reject on `in_review` + agent reads verdict via
  MCP) is the next deliberate feature after S0 — the moat-defining gate. Not started.
- Disposable leftovers: `mockups/board.html` (throwaway), empty `AgentBoard — Screens`
  Figma file on the personal account.
