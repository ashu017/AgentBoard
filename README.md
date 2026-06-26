# AgentBoard

A web app where a human manager assigns tasks to their AI agents and watches the work
happen live — and the agents read and update those tasks programmatically over
[MCP](https://modelcontextprotocol.io).

> **Status:** Pre-implementation. This repo currently holds the design and review
> documents only. No application code yet.

## The core loop

```
Manager logs in → creates a task → assigns it to a specific agent
   → agent reads it via MCP → agent updates status / submits result via MCP
   → manager sees the card move on the board, live
```

Everything in the MVP exists to prove that loop end to end.

## What it is

- **Human side:** a live Kanban board (Todo / In Progress / Done / Failed), an agents
  screen to onboard agents and issue per-agent API keys, and a create-and-assign-task
  flow.
- **Agent side:** an MCP server exposing three tools — `list_my_tasks`,
  `update_task_status`, `submit_result` — so standard agent clients can connect with a
  per-agent API key and act on their assigned work.

## Stack

Next.js on Vercel + Supabase (Postgres, Auth, Realtime). Single-tenant in v1.

## Docs

- [`docs/design.md`](docs/design.md) — the full design + the decisions behind it
  (reviewed for scope, design, and engineering).
- [`docs/test-plan.md`](docs/test-plan.md) — what to test and where.
- [`docs/design-superseded-observatory.md`](docs/design-superseded-observatory.md) — the
  earlier passive-observatory design, kept for context (superseded).

## Contributing

Early days. Issues and discussion welcome. See [`docs/design.md`](docs/design.md) for the
current plan and the explicitly-deferred follow-ups.

## License

[MIT](LICENSE)
