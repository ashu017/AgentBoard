"use client";
import { useActionState, useState } from "react";
import { createAgentAction, revokeAgentAction, type ActionResult } from "@/app/actions";
import type { CreatedAgent } from "@/lib/manager-actions";
import type { AgentRow } from "@/lib/manager-queries";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AgentsClient({ agents, mcpEndpoint }: { agents: AgentRow[]; mcpEndpoint: string }) {
  const [createState, createFormAction, creating] = useActionState<ActionResult<CreatedAgent> | null, FormData>(
    createAgentAction,
    null
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Agents</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Each agent gets one API key, shown once. Wire it into your agent over MCP, then watch
        the connected dot flip when its first call lands.
      </p>

      {/* Shown-once key panel — the highest-stakes UI moment (design.md). */}
      {createState?.ok && createState.data && (
        <KeyReveal agent={createState.data} mcpEndpoint={mcpEndpoint} />
      )}

      {/* Create agent */}
      <form action={createFormAction} className="clip-corner mt-5 border border-line bg-paper-2 p-5">
        <div className="mono text-[11px] uppercase tracking-widest text-ink-soft">New agent</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            placeholder="Agent name"
            className="border border-line bg-paper px-3 py-2 text-sm"
          />
          <input
            name="description"
            placeholder="Description (optional)"
            className="border border-line bg-paper px-3 py-2 text-sm"
          />
        </div>
        {createState && !createState.ok && (
          <p className="mt-2 text-sm text-magenta">{createState.error}</p>
        )}
        <button
          type="submit"
          disabled={creating}
          className="mt-3 bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
        >
          {creating ? "Creating…" : "Create agent"}
        </button>
      </form>

      {/* Roster */}
      <div className="mt-6 space-y-2">
        {agents.length === 0 && (
          <div className="border border-dashed border-line p-8 text-center text-sm text-ink-soft">
            No agents yet. Create your first to start assigning work.
          </div>
        )}
        {agents.map((a) => (
          <AgentRowView key={a.id} agent={a} />
        ))}
      </div>
    </main>
  );
}

function AgentRowView({ agent }: { agent: AgentRow }) {
  const [revokeState, revokeFormAction, revoking] = useActionState<ActionResult | null, FormData>(
    revokeAgentAction,
    null
  );
  const revoked = Boolean(agent.revoked_at);
  const connected = Boolean(agent.last_seen_at);

  return (
    <div
      className={`clip-corner flex items-center justify-between border border-line bg-paper-2 px-4 py-3 ${
        revoked ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-label={connected ? "connected" : "not yet connected"}
          title={connected ? `connected · last seen ${relativeTime(agent.last_seen_at)}` : "not yet connected"}
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: revoked ? "var(--ink-soft)" : connected ? "var(--st-done)" : "var(--line)" }}
        />
        <div>
          <div className="text-sm font-medium">
            {agent.name}
            {revoked && <span className="mono ml-2 text-[10px] uppercase text-magenta">revoked</span>}
          </div>
          <div className="mono text-[11px] text-ink-soft">
            ab_{agent.api_key_prefix}_•••• · {connected ? `last seen ${relativeTime(agent.last_seen_at)}` : "never connected"}
          </div>
        </div>
      </div>
      {!revoked && (
        <form action={revokeFormAction}>
          <input type="hidden" name="agentId" value={agent.id} />
          <button
            disabled={revoking}
            className="border border-line px-3 py-1.5 text-xs text-magenta hover:bg-paper disabled:opacity-60"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
          {revokeState && !revokeState.ok && (
            <span className="ml-2 text-xs text-magenta">{revokeState.error}</span>
          )}
        </form>
      )}
    </div>
  );
}

function KeyReveal({ agent, mcpEndpoint }: { agent: CreatedAgent; mcpEndpoint: string }) {
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const snippet = JSON.stringify(
    { mcpServers: { agentboard: { url: mcpEndpoint, headers: { Authorization: `Bearer ${agent.token}` } } } },
    null,
    2
  );
  if (dismissed) return null;

  return (
    <div className="clip-corner mt-5 border-2 border-orange bg-paper-2 p-5">
      <div className="mono text-[11px] uppercase tracking-widest text-orange">
        Key for {agent.name} — shown once
      </div>
      <p className="mt-1 text-sm text-ink">Copy this now — it won&apos;t be shown again.</p>

      <div className="mono mt-3 flex items-center gap-2 border border-line bg-paper px-3 py-2 text-xs">
        <span className="truncate">{agent.token}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(agent.token);
            setCopied(true);
          }}
          className="ml-auto shrink-0 bg-orange px-2 py-1 text-[10px] uppercase text-paper"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>

      <div className="mono mt-3 text-[11px] uppercase tracking-widest text-ink-soft">MCP config</div>
      <pre className="mono mt-1 overflow-x-auto border border-line bg-paper p-3 text-[11px] leading-relaxed">
        {snippet}
      </pre>

      <button
        onClick={() => setDismissed(true)}
        className="mt-3 border border-line px-3 py-1.5 text-xs hover:bg-paper"
      >
        I&apos;ve saved it
      </button>
    </div>
  );
}
