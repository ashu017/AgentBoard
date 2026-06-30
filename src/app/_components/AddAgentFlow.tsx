"use client";
import { useActionState, useState } from "react";
import { createAgentAction, type ActionResult } from "@/app/actions";
import type { CreatedAgent } from "@/lib/manager-actions";
import { Modal } from "@/app/_components/Modal";

// Two-step agent onboarding, both steps as separate modals:
//   1) "Add agent"  → name + description form
//   2) the form modal closes, the "Key — shown once" modal opens with the
//      one-time key + paste-ready MCP config (the integration step).
// Mount this only while active; it starts on step 1 and calls onClose when the
// user cancels step 1 or dismisses step 2.
export function AddAgentFlow({ mcpEndpoint, onClose }: { mcpEndpoint: string; onClose: () => void }) {
  const [createState, formAction, creating] = useActionState<ActionResult<CreatedAgent> | null, FormData>(
    createAgentAction,
    null
  );
  // Derive the step from the action result — no effect, no extra state.
  const created = createState?.ok ? createState.data : undefined;
  const step: "form" | "key" = created ? "key" : "form";

  return (
    <>
      {/* Step 1 — name + description */}
      <Modal open={step === "form"} onClose={onClose} title="Add agent" systemTag="SYS:: NEW AGENT">
        <form action={formAction}>
          <div className="grid gap-3">
            <input name="name" required placeholder="Agent name" className="border border-line bg-paper px-3 py-2 text-sm" />
            <input name="description" placeholder="Description (optional)" className="border border-line bg-paper px-3 py-2 text-sm" />
          </div>
          {createState && !createState.ok && <p className="mt-2 text-sm text-magenta">{createState.error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={creating} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
              {creating ? "Creating…" : "Create agent"}
            </button>
            <button type="button" onClick={onClose} className="border border-line px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Step 2 — the integration (shown-once key + MCP config). Wider panel:
          the MCP config is the content the user actually copies. */}
      <Modal
        open={step === "key"}
        onClose={onClose}
        title={created ? `Key for ${created.name}` : "Key"}
        systemTag="SYS:: KEY — SHOWN ONCE"
        closeOnBackdrop={false}
        size="lg"
      >
        {created && <KeyReveal agent={created} mcpEndpoint={mcpEndpoint} onDone={onClose} />}
      </Modal>
    </>
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

      <div className="mono mt-4 text-[11px] uppercase tracking-widest text-ink-soft">MCP config</div>
      <pre className="mono mt-1 max-h-72 overflow-auto border border-line bg-paper p-4 text-[12px] leading-relaxed">
        {snippet}
      </pre>

      {/* Behavioral nudge: connecting exposes the tools, but the agent must be
          told to USE them. The server also sends this guidance on connect. */}
      <div className="mt-4 border-l-2 border-orange bg-paper px-3 py-2 text-[12px] text-ink">
        <div className="mono text-[10px] uppercase tracking-widest text-ink-soft">Tell your agent</div>
        <p className="mt-1">
          Connecting exposes the board tools, but your agent decides when to use them. In your
          agent&apos;s instructions, add something like:
        </p>
        <p className="mono mt-1.5 text-[11px] text-ink-soft">
          &ldquo;You&apos;re an AgentBoard worker. Use <code>list_my_tasks</code> to find your work,
          mark it <code>in_progress</code> when you start, <code>create_subtask</code> to break down
          big tasks, and <code>submit_result</code> + <code>done</code>/<code>failed</code> when you
          finish.&rdquo;
        </p>
      </div>

      <button onClick={onDone} className="mt-4 border border-line px-3 py-1.5 text-xs hover:bg-paper">
        I&apos;ve saved it
      </button>
    </div>
  );
}
