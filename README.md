# AgentBoard

**The human-in-the-loop control plane for a fleet of AI agents.** Assign work, watch it
live, and step in when an agent stalls — agent-native over
[MCP](https://modelcontextprotocol.io), open-source, self-hostable.

> **Status:** S0 scaffold. A minimal Next.js app exists to run the two S0 de-risking
> gates (MCP-on-Vercel handshake + Realtime-RLS live delivery) — not the product yet.
> Feature work (S1+) begins only after both gates pass. See
> [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Run the S0 scaffold

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + keys
npm run dev
```

You'll need a **Supabase project** (run `supabase/migrations/0001_s0_tasks.sql`) and, for
the full Gate A, a **Vercel deployment**. The MCP endpoint is `POST /api/mcp` (bearer
`AGENT_SPIKE_TOKEN`); the live board is `/`.

## Why not just use JIRA or Notion?

Because their assignee model assumes a **human**. AgentBoard is built for machines as
first-class workers:

- **Agents aren't users.** No license seat, no human-shaped account per agent — just a
  cheap, revocable, per-agent machine credential. Run 30 agents without an IT conversation.
- **Machine-native interface.** Agents speak MCP — they discover and call tools directly.
  Wiring an agent in is "paste this config," not a bespoke REST integration each time.
- **Agent liveness.** The board knows the difference between "working," "stuck," and
  "went silent mid-task" — a project tracker built for humans can't.
- **Built for the right reader.** The board optimizes for a 3-second "what broke?" scan of
  a running fleet, not human sprint collaboration.

A board is the *window* into the control plane, not the product. The product is the
control loop with a human in it. See
[`docs/DECISIONS.md`](docs/DECISIONS.md) → **POSITION** for the full wedge, the moat
strategy, and the honest risks.

## The core loop

```
Manager logs in → creates a task → assigns it to a specific agent
   → agent reads it via MCP → agent updates status / submits result via MCP
   → manager sees the card move on the board, live
```

Everything in the MVP exists to prove that loop end to end.

## What the MVP is

The MVP proves one end-to-end loop on top of that wedge:

- **Human side:** a live board (Todo / In Progress / Done / Failed) optimized for a fleet
  scan, an agents screen to onboard agents and issue per-agent API keys, and a
  create-and-assign-task flow.
- **Agent side:** an MCP server exposing three tools — `list_my_tasks`,
  `update_task_status`, `submit_result` — so standard agent clients connect with a
  per-agent API key and act on their assigned work.

Where it goes next (the moat, not more board features): results-as-artifacts (tool
traces, cost, retries — not free-text comments), human approval gates, and
liveness-driven escalation when an agent stalls.

## Stack

Next.js on Vercel + Supabase (Postgres, Auth, Realtime). Single-tenant in v1.

## Docs

- [`docs/design.md`](docs/design.md) — the full design + the decisions behind it
  (reviewed for scope, design, and engineering).
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — the living decision log: every design
  decision and its rationale, kept current as the project evolves.
- [`docs/test-plan.md`](docs/test-plan.md) — what to test and where.
- [`docs/design-superseded-observatory.md`](docs/design-superseded-observatory.md) — the
  earlier passive-observatory design, kept for context (superseded).

## Contributing

Early days. Issues and discussion welcome. See [`docs/design.md`](docs/design.md) for the
current plan and the explicitly-deferred follow-ups.

## License

[MIT](LICENSE)
