# AgentBoard — Project Instructions

## What this is

A web app where a human **manager** assigns tasks to their **AI agents** and watches the
work happen live. Agents read and update their tasks programmatically over
[MCP](https://modelcontextprotocol.io). Open source (MIT).

**The core loop the MVP must prove:**
```
Manager logs in → creates a task → assigns it to a specific agent
   → agent reads it via MCP → agent updates status / submits result via MCP
   → manager sees the card move on the board, live
```

## Status

Pre-implementation. The repo currently holds design + review docs only. No app code yet.

## Stack (locked — see docs/DECISIONS.md D-STACK)

- **Next.js on Vercel** (App Router, TypeScript).
- **Supabase** — Postgres, Auth (GitHub OAuth), Realtime, Row-Level Security.
- **MCP server** via the official MCP TypeScript SDK, stateless Streamable-HTTP transport,
  mounted as Next.js route handlers.
- **Tests:** Vitest (unit/integration), Playwright (E2E).
- Single-tenant in v1 (one user = one workspace).

## Hard gate before building features (S0)

Two integrations can fail silently or strand the whole agent plane. **Prove them first,
in isolation, before any feature code:**
1. A **real MCP client** connects to the stateless endpoint on Vercel and calls a tool.
   (Named fallback if it fails: host the MCP route on a non-serverless target.)
2. **Realtime-RLS delivery** — an agent-plane (service-role) write to `tasks` is actually
   *received* by a subscribed board client under the human RLS policy. If the policy is
   wrong, writes commit but the board never updates, with no error.

## Key conventions

- **Single source of truth for task status:** the status enum + legal-transition map live
  in one shared module (`lib/task-status.ts`); the DB `CHECK`, MCP validators, UI, and
  tests all import it. Never redefine transitions per-layer.
- **Agent DB access is confined:** all agent-plane queries go through one server-only
  module (`lib/agent-db.ts`) on the service-role connection, via **named scoped accessors**
  only — the per-agent `scopedTasks()` (requires `(workspace_id, agent_id)`) and, for a
  project lead, `scopedProjectSubtree()` (gated on lead-ownership; docs/DECISIONS.md P6). No
  raw/unscoped agent queries anywhere else. Service-role never touches the human UI path.
- **Human plane uses RLS** (`owner_user_id = auth.uid()`); agent plane uses app-code
  scoping in v1 (DB-enforced RLS for agents is deferred — docs/DECISIONS.md D-RLS-DEFER).
- **Task writes are transactional** with their `task_events` append (one
  `appendTaskEvent()` helper, not hand-built per path).
- **Errors:** `400` bad input, `401` bad/revoked key, `404` not-your-task (never `403`),
  `409` illegal transition, `413` oversize result.
- **Visual system:** APP-UI aesthetic — a real typeface (not Inter/system-ui), monospace
  for machine ids/keys/timestamps, color = status signal only, Failed is the only loud
  color. No AI-slop (no 3-col icon-circle grid, no purple gradients, no centered-everything).

## Testing

Target 100% coverage of the paths in `docs/design.md` → "Must-have tests". Security-
critical tests (cross-tenant isolation, human-plane RLS deny, Realtime delivery under RLS)
are non-negotiable. Write tests alongside the feature, not as a follow-up.

## Decision log — keep it current (IMPORTANT)

`docs/DECISIONS.md` is the living record of every design decision and its rationale.

**Whenever a design or architecture decision is made, changed, or reversed, update
`docs/DECISIONS.md` in the same change** — add a new entry (or amend an existing one with
a "Superseded" / "Revised" note; never silently delete the old reasoning). Each entry: an
ID, the decision, the why, and the date. Keep `docs/design.md` and this file consistent
with it. A decision that isn't written down didn't happen.

## Out of scope for v1 (don't build — see docs/DECISIONS.md + docs/design.md)

Multi-user workspaces, DB-enforced agent RLS, pull/claim task pool, *further* MCP tools
beyond the current set (`list_my_tasks`, `update_task_status`, `submit_result`,
`create_subtask`, `list_agents`), extra statuses, rate-limiting, published SDK, true mobile
layout, optimistic UI, light+dark theming.

(Note: agents creating tasks and assigning across the fleet, and first-class projects, are
**in scope and built** — see docs/DECISIONS.md → FIRST-CLASS PROJECTS P1–P7 and NEXT-1.)
