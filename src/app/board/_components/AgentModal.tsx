"use client";
// Agent detail modal — opened by clicking an agent in the sidebar. Shows the
// agent's key prefix + connection status, lets the manager edit name/description,
// and offers the right teardown action: DELETE when the agent has no tasks (clean
// removal), else REVOKE (disables the key but keeps the audit trail). Mirrors the
// revoke-vs-delete logic from the standalone Agents page.
import { useActionState, useEffect, useState } from "react";
import {
  updateAgentAction,
  revokeAgentAction,
  deleteAgentAction,
  type ActionResult,
} from "@/app/actions";
import type { AgentRow } from "@/lib/manager-queries";
import { Modal } from "@/app/_components/Modal";
import { relative } from "./board-ui";

export function AgentModal({ agent, onClose }: { agent: AgentRow | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(agent)}
      onClose={onClose}
      title={agent ? agent.name : "Agent"}
      systemTag="SYS:: AGENT"
      variant="figma"
    >
      {agent && <AgentPanel agent={agent} onDone={onClose} />}
    </Modal>
  );
}

function AgentPanel({ agent, onDone }: { agent: AgentRow; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmTeardown, setConfirmTeardown] = useState(false);

  const [editState, editForm, saving] = useActionState<ActionResult | null, FormData>(updateAgentAction, null);
  const [revokeState, revokeForm, revoking] = useActionState<ActionResult | null, FormData>(revokeAgentAction, null);
  const [deleteState, deleteForm, deleting] = useActionState<ActionResult | null, FormData>(deleteAgentAction, null);

  // Close on a successful edit/revoke/delete (the board revalidates + re-syncs).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (editState?.ok) setEditing(false); }, [editState]);
  useEffect(() => { if (deleteState?.ok || revokeState?.ok) onDone(); }, [deleteState, revokeState]); // eslint-disable-line react-hooks/exhaustive-deps

  const revoked = Boolean(agent.revoked_at);
  const connected = Boolean(agent.last_seen_at);
  const deletable = agent.task_count === 0; // no task history → clean delete, else revoke

  return (
    <div>
      {/* Status line */}
      <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: revoked ? "var(--ink-soft)" : connected ? "var(--st-done)" : "var(--line)" }}
          />
          {revoked ? "revoked" : connected ? "connected" : "never connected"}
        </span>
        <span>ab_{agent.api_key_prefix}_••••</span>
        <span>·</span>
        <span>{connected ? `last seen ${relative(agent.last_seen_at!)} ago` : "no calls yet"}</span>
        <span>·</span>
        <span>{agent.task_count} task{agent.task_count === 1 ? "" : "s"}</span>
      </div>

      {agent.description && !editing && (
        <p className="mt-3 text-sm text-ink-soft">{agent.description}</p>
      )}

      {/* Edit form */}
      {editing ? (
        <form action={editForm} className="mt-4">
          <input type="hidden" name="agentId" value={agent.id} />
          <div className="grid w-full gap-3">
            <input
              name="name"
              required
              defaultValue={agent.name}
              placeholder="Agent name"
              className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              defaultValue={agent.description ?? ""}
              placeholder="Description (optional)"
              rows={2}
              className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm"
            />
          </div>
          {editState && !editState.ok && <p className="mt-2 text-sm text-magenta">{editState.error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="border border-line px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!revoked && (
            <button onClick={() => setEditing(true)} className="border border-line px-4 py-2 text-sm hover:text-orange">
              Edit
            </button>
          )}

          {/* Teardown: delete (no tasks) or revoke (has tasks), with a confirm step. */}
          {!confirmTeardown ? (
            !revoked && (
              <button
                onClick={() => setConfirmTeardown(true)}
                className="border border-line px-4 py-2 text-sm text-magenta hover:bg-paper"
                title={deletable ? "Delete this agent" : "This agent has tasks; revoking disables it while keeping history."}
              >
                {deletable ? "Delete" : "Revoke"}
              </button>
            )
          ) : deletable ? (
            <form action={deleteForm} className="flex items-center gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              <span className="text-sm text-ink">Delete {agent.name}?</span>
              <button type="submit" disabled={deleting} className="bg-magenta px-3 py-2 text-sm font-medium text-paper disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button type="button" onClick={() => setConfirmTeardown(false)} className="border border-line px-3 py-2 text-sm">Cancel</button>
            </form>
          ) : (
            <form action={revokeForm} className="flex items-center gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              <span className="text-sm text-ink">Revoke {agent.name}&apos;s key?</span>
              <button type="submit" disabled={revoking} className="bg-magenta px-3 py-2 text-sm font-medium text-paper disabled:opacity-60">
                {revoking ? "Revoking…" : "Revoke"}
              </button>
              <button type="button" onClick={() => setConfirmTeardown(false)} className="border border-line px-3 py-2 text-sm">Cancel</button>
            </form>
          )}
        </div>
      )}

      {(deleteState && !deleteState.ok) && <p className="mt-2 text-sm text-magenta">{deleteState.error}</p>}
      {(revokeState && !revokeState.ok) && <p className="mt-2 text-sm text-magenta">{revokeState.error}</p>}

      {revoked && (
        <p className="mono mt-4 text-[11px] uppercase tracking-widest text-magenta">
          Revoked — this agent&apos;s key no longer works.
        </p>
      )}
    </div>
  );
}
