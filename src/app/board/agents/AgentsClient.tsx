"use client";
import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { revokeAgentAction, deleteAgentAction, type ActionResult } from "@/app/actions";
import type { AgentRow } from "@/lib/manager-queries";
import { AddAgentFlow } from "@/app/_components/AddAgentFlow";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AgentsClient({ agents, mcpEndpoint }: { agents: AgentRow[]; mcpEndpoint: string }) {
  // The board CTA can deep-link here with ?new=1 to open the flow immediately.
  const params = useSearchParams();
  const [adding, setAdding] = useState(params.get("new") === "1");

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Each agent gets one API key, shown once. Wire it into your agent over MCP, then watch
            the connected dot flip when its first call lands.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="shrink-0 bg-orange px-4 py-2 text-sm font-medium text-paper">
          Add agent
        </button>
      </div>

      {adding && <AddAgentFlow mcpEndpoint={mcpEndpoint} onClose={() => setAdding(false)} />}

      {/* Roster of onboarded agents */}
      <div className="mt-6 space-y-2">
        {agents.length === 0 ? (
          <div className="clip-corner border border-dashed border-line p-8 text-center">
            <p className="text-sm text-ink-soft">No agents yet — add your first to start assigning work.</p>
            <button onClick={() => setAdding(true)} className="mono mt-2 text-sm text-orange">
              → Add your first agent
            </button>
          </div>
        ) : (
          agents.map((a) => <AgentRowView key={a.id} agent={a} />)
        )}
      </div>
    </main>
  );
}

function AgentRowView({ agent }: { agent: AgentRow }) {
  const [revokeState, revokeFormAction, revoking] = useActionState<ActionResult | null, FormData>(
    revokeAgentAction,
    null
  );
  const [deleteState, deleteFormAction, deleting] = useActionState<ActionResult | null, FormData>(
    deleteAgentAction,
    null
  );
  const revoked = Boolean(agent.revoked_at);
  const connected = Boolean(agent.last_seen_at);
  // No tasks reference this agent → it can be cleanly deleted (vs revoked).
  const deletable = agent.task_count === 0;

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
      <div className="flex items-center gap-2">
        {deletable ? (
          // Clean delete — no task history to preserve.
          <form action={deleteFormAction}>
            <input type="hidden" name="agentId" value={agent.id} />
            <button
              disabled={deleting}
              className="border border-line px-3 py-1.5 text-xs text-magenta hover:bg-paper disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            {deleteState && !deleteState.ok && (
              <span className="ml-2 text-xs text-magenta">{deleteState.error}</span>
            )}
          </form>
        ) : (
          !revoked && (
            // Has tasks → revoke (keeps the audit trail) instead of delete.
            <form action={revokeFormAction}>
              <input type="hidden" name="agentId" value={agent.id} />
              <button
                disabled={revoking}
                title="This agent has tasks; revoking disables it while keeping its history."
                className="border border-line px-3 py-1.5 text-xs text-magenta hover:bg-paper disabled:opacity-60"
              >
                {revoking ? "Revoking…" : "Revoke"}
              </button>
              {revokeState && !revokeState.ok && (
                <span className="ml-2 text-xs text-magenta">{revokeState.error}</span>
              )}
            </form>
          )
        )}
      </div>
    </div>
  );
}
