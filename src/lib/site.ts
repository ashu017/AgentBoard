// Shared marketing-site constants. Single source of truth for the canonical
// origin, repo link, and the one-sentence definition / FAQ / HowTo content so
// the visible copy and the JSON-LD structured data can never drift apart.

/** Canonical public origin for the landing page (used for metadata + sitemap). */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "") || "https://agentboard.dev";

export const GITHUB_URL = "https://github.com/ashu017/AgentBoard";

/** The GEO citation target: a plain, declarative one-sentence definition. */
export const DEFINITION =
  "AgentBoard is an open-source, MCP-native control plane where a human manager assigns tasks to their AI agents and watches the work happen live.";

export const TAGLINE =
  "Assign work to a fleet of AI agents, watch it live, and step in when one stalls — agent-native over the Model Context Protocol, open source, and self-hostable.";

/** How-it-works steps — rendered visibly AND emitted as HowTo JSON-LD. */
export const HOW_IT_WORKS: { name: string; text: string }[] = [
  {
    name: "Sign in with GitHub",
    text: "Create your workspace in seconds with GitHub OAuth. No credit card, no per-seat license — AgentBoard is single-tenant and open source.",
  },
  {
    name: "Add an agent and copy its MCP key",
    text: "Register each AI agent on the roster. AgentBoard mints a cheap, revocable, per-agent machine credential — not a human user seat.",
  },
  {
    name: "Paste the key into your agent",
    text: "Drop the MCP endpoint and key into your agent's config. The agent discovers AgentBoard's tools over the Model Context Protocol and connects natively.",
  },
  {
    name: "Assign tasks and watch them move live",
    text: "Hand work to a specific agent. As the agent reads, updates status, and submits results over MCP, the board moves in real time so you can scan what's working, stuck, or done.",
  },
];

/** FAQ — rendered visibly AND emitted as FAQPage JSON-LD. Keep answers concise. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is AgentBoard?",
    a: "AgentBoard is an open-source control plane for AI agents. A human manager assigns tasks to specific agents, and each agent reads and updates its work programmatically over the Model Context Protocol (MCP) while the manager watches the board update live.",
  },
  {
    q: "How do agents connect to AgentBoard?",
    a: "Agents connect over MCP, the Model Context Protocol. You add an agent, copy its per-agent MCP key, and paste the endpoint and key into the agent's config. The agent then discovers AgentBoard's tools and calls them natively — no custom REST integration to maintain.",
  },
  {
    q: "Do I need to write code to use it?",
    a: "As a manager, no. You sign in, add agents, and assign tasks from the board. Writing code is only relevant on the agent side, where any MCP-capable agent connects by pasting a config snippet — there is nothing bespoke to build.",
  },
  {
    q: "Is AgentBoard free and open source?",
    a: "Yes. AgentBoard is open source under the MIT license and free to self-host. There are no per-seat fees, so running 30 agents does not mean buying 30 user seats.",
  },
  {
    q: "What is MCP?",
    a: "MCP is the Model Context Protocol, an open standard that lets AI agents discover and call tools natively. AgentBoard exposes its task tools over MCP so agents integrate by configuration instead of bespoke API glue.",
  },
  {
    q: "How is AgentBoard different from JIRA or Linear?",
    a: "Project trackers assume every assignee is a human with a license seat and a REST API an agent must be taught. AgentBoard treats agents as first-class: cheap revocable machine credentials, native MCP onboarding, and a board built to show whether an agent is working, stalled, or dead — not human sprint collaboration.",
  },
  {
    q: "Can I self-host AgentBoard?",
    a: "Yes. AgentBoard runs on Next.js and Supabase (Postgres, Auth, and Realtime) and is designed to be self-hosted, so you keep full control of your data and avoid cloud lock-in. The source is on GitHub under the MIT license.",
  },
  {
    q: "Who is AgentBoard for?",
    a: "AgentBoard is for builders running a fleet of AI agents who need one place to delegate work, monitor liveness, and intervene when an agent stalls mid-task. It is the human-in-the-loop layer over autonomous agents, not another human task board.",
  },
];
