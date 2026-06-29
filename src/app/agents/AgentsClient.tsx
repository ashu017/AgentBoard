"use client";
import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createAgentAction, revokeAgentAction, type ActionResult } from "@/app/actions";
import type { CreatedAgent } from "@/lib/manager-actions";
import type { AgentRow } from "@/lib/manager-queries";
import { Modal } from "@/app/_components/Modal";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AgentsClient({ agents, mcpEndpoint }: { agents: AgentRow[]; mcpEndpoint: string }) {
  // Board's "Add your first agent" CTA links to /agents?new=1 — auto-open then.
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");

  const [createState, createFormAction, creating] = useActionState<ActionResult<CreatedAgent> | null, FormData>(
    createAgentAction,
    null
  );
  const created = createState?.ok ? createState.data : undefined;

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
        <button onClick={() => setOpen(true)} className="shrink-0 bg-orange px-4 py-2 text-sm font-medium text-paper">
          Add agent
        </button>
      </div>

      {/* Create-agent modal. On success it swaps to the shown-once key panel so
          the key is never lost; dismissing it closes the modal. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={created ? `Key for ${created.name}` : "Add agent"}
        systemTag={created ? "SYS:: KEY — SHOWN ONCE" : "SYS:: NEW AGENT"}
        closeOnBackdrop={!created} // don't let a stray backdrop click drop the key
      >
        {created ? (
          <KeyReveal agent={created} mcpEndpoint={mcpEndpoint} onDone={() => setOpen(false)} />
        ) : (
          <form action={createFormAction}>
            <div className="grid gap-3">
              <input name="name" required placeholder="Agent name" className="border border-line bg-paper px-3 py-2 text-sm" />
              <input name="description" placeholder="Description (optional)" className="border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            {createState && !createState.ok && <p className="mt-2 text-sm text-magenta">{createState.error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={creating} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
                {creating ? "Creating…" : "Create agent"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="border border-line px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Roster */}
      <div className="mt-6 space-y-2">
        {agents.length === 0 && (
          <div className="clip-corner border border-dashed border-line p-8 text-center">
            <p className="text-sm text-ink-soft">No agents yet — add your first to start assigning work.</p>
            <button onClick={() => setOpen(true)} className="mono mt-2 text-sm text-orange">
              → Add your first agent
            </button>
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

function KeyReveal({
  agent,
  mcpEndpoint,
  onDone,
}: {
  agent: CreatedAgent;
  mcpEndpoint: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = JSON.stringify(
    { mcpServers: { agentboard: { url: mcpEndpoint, headers: { Authorization: `Bearer ${agent.token}` } } } },
    null,
    2
  );

  return (
    <div>
      <p className="text-sm text-ink">Copy this now — it won&apos;t be shown again.</p>

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

      <button onClick={onDone} className="mt-4 border border-line px-3 py-1.5 text-xs hover:bg-paper">
        I&apos;ve saved it
      </button>
    </div>
  );
}
