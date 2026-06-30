"use client";
import { useActionState, useState } from "react";
import { createAgentAction, type ActionResult } from "@/app/actions";
import type { CreatedAgent } from "@/lib/manager-actions";
import { Modal } from "@/app/_components/Modal";

// Three-step agent onboarding wizard, each step its own modal:
//   1) "Add agent"   → name + description form (submitting CREATES the agent).
//   2) "Key"         → the one-time key + paste-ready MCP config. Loud: copy now,
//                      it won't be shown again. Forward-only (creation already
//                      happened — there's nothing to go "back" to, and re-submitting
//                      step 1 would mint a second agent/key).
//   3) "Instructions"→ how to tell the agent to USE the tools. Has a (witty) Back
//                      button to step 2 in case you forgot to copy the key.
// Mount this only while active; it starts on step 1 and calls onClose when the
// user cancels step 1 or finishes step 3.
export function AddAgentFlow({ mcpEndpoint, onClose }: { mcpEndpoint: string; onClose: () => void }) {
  const [createState, formAction, creating] = useActionState<ActionResult<CreatedAgent> | null, FormData>(
    createAgentAction,
    null
  );
  const created = createState?.ok ? createState.data : undefined;
  // Once the agent exists, the wizard advances to "key", then the user can move
  // to "instructions" and back. Before creation we're always on the form.
  const [step, setStep] = useState<"key" | "instructions">("key");
  const phase: "form" | "key" | "instructions" = !created ? "form" : step;

  return (
    <>
      {/* Step 1 — name + description */}
      <Modal open={phase === "form"} onClose={onClose} title="Add agent" systemTag="SYS:: NEW AGENT — STEP 1 OF 3">
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

      {/* Step 2 — the key + MCP config (shown once). Forward-only. */}
      <Modal
        open={phase === "key"}
        onClose={onClose}
        title={created ? `Key for ${created.name}` : "Key"}
        systemTag="SYS:: KEY — SHOWN ONCE — STEP 2 OF 3"
        closeOnBackdrop={false}
        size="lg"
      >
        {created && (
          <KeyReveal agent={created} mcpEndpoint={mcpEndpoint} onNext={() => setStep("instructions")} />
        )}
      </Modal>

      {/* Step 3 — wire the agent to actually USE the tools. */}
      <Modal
        open={phase === "instructions"}
        onClose={onClose}
        title="Tell your agent what to do"
        systemTag="SYS:: INSTRUCTIONS — STEP 3 OF 3"
        closeOnBackdrop={false}
        size="lg"
      >
        <Instructions onBack={() => setStep("key")} onDone={onClose} />
      </Modal>
    </>
  );
}

function KeyReveal({
  agent,
  mcpEndpoint,
  onNext,
}: {
  agent: CreatedAgent;
  mcpEndpoint: string;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // `type: "http"` is REQUIRED — without it MCP clients (Claude Code, etc.) don't
  // know the transport and silently skip the server, so it never connects.
  const snippet = JSON.stringify(
    {
      mcpServers: {
        agentboard: {
          type: "http",
          url: mcpEndpoint,
          headers: { Authorization: `Bearer ${agent.token}` },
        },
      },
    },
    null,
    2
  );

  return (
    <div>
      <p className="text-sm font-medium text-magenta">
        Copy this now — it won&apos;t be shown again.
      </p>
      <p className="mt-1 text-[13px] text-ink-soft">
        This is the only time AgentBoard will ever show this key. We store a hash, not the key
        itself — if you lose it, you&apos;ll have to revoke this agent and create a new one.
      </p>

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

      <div className="mt-4 flex items-center gap-2">
        <button onClick={onNext} className="bg-orange px-4 py-2 text-sm font-medium text-paper">
          Next: tell your agent →
        </button>
        {copied && <span className="mono text-[11px] text-st-done">key copied ✓</span>}
      </div>
    </div>
  );
}

function Instructions({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div>
      {/* Behavioral nudge: connecting exposes the tools, but the agent must be
          told to USE them. The MCP server also sends this guidance on connect. */}
      <p className="text-sm text-ink">
        Connecting exposes the board tools, but your agent decides when to use them. In your
        agent&apos;s instructions, add something like:
      </p>
      <blockquote className="mono mt-3 border-l-2 border-orange bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink">
        You&apos;re an AgentBoard worker. Use <code>list_my_tasks</code> to find your work, mark it{" "}
        <code>in_progress</code> when you start, <code>create_subtask</code> to break a project into
        tasks (and <code>list_agents</code> to hand one off), and <code>submit_result</code> with{" "}
        <code>done</code>/<code>failed</code> when you finish.
      </blockquote>

      <div className="mt-5 flex items-center gap-2">
        <button onClick={onBack} className="border border-line px-3 py-1.5 text-sm hover:bg-paper">
          ← Forgot to copy the key? I won&apos;t judge — go back
        </button>
        <button onClick={onDone} className="ml-auto bg-orange px-4 py-2 text-sm font-medium text-paper">
          Done — my agent&apos;s on duty
        </button>
      </div>
    </div>
  );
}
