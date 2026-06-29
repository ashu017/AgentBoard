"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { STATUSES, type TaskStatus } from "@/lib/task-status";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import { createTaskAction, type ActionResult } from "@/app/actions";
import type { BoardTask, AgentRow } from "@/lib/manager-queries";
import { Modal } from "@/app/_components/Modal";

function relative(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function BoardClient({
  initialTasks,
  agents,
  capped,
}: {
  initialTasks: BoardTask[];
  agents: AgentRow[];
  capped: boolean;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [live, setLive] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [showNew, setShowNew] = useState(false);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Live board: subscribe to tasks changes, refetch snapshot on each (D9 pattern).
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    async function refetch() {
      const { data } = await supabase!
        .from("tasks")
        .select("id, title, description, status, result, assigned_agent_id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (data) setTasks(data as BoardTask[]);
    }

    const channel = supabase
      .channel("board-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        const row = payload.new as Partial<BoardTask> | undefined;
        if (row?.title && row.status) setAnnounce(`Task ${row.title} moved to ${STATUS_UI[row.status as TaskStatus].label}`);
        void refetch();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));

    return () => void supabase.removeChannel(channel);
  }, []);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length])) as Record<TaskStatus, number>;
  const hasFailed = counts.failed > 0;
  const noAgents = agents.length === 0;

  return (
    <main className="p-5">
      {/* aria-live region for screen readers (a11y baseline — silent live board trap). */}
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* Scan summary line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="mono flex items-center gap-3 text-xs">
          <span className={live ? "text-st-done" : "text-ink-soft"}>{live ? "● LIVE" : "○ connecting"}</span>
          {hasFailed ? (
            <span className="font-semibold text-magenta">⚠ {counts.failed} failed</span>
          ) : (
            <span className="text-ink-soft">all healthy</span>
          )}
          <span className="text-ink-soft">{counts.in_progress} in progress · {counts.in_review} in review · {counts.done} done</span>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          disabled={noAgents}
          title={noAgents ? "Add an agent first" : undefined}
          className="bg-orange px-3 py-1.5 text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          New task
        </button>
      </div>

      {noAgents && (
        <div className="clip-corner mt-4 border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-soft">No agents yet — you can&apos;t assign work to nobody.</p>
          <a href="/agents" className="mono mt-2 inline-block text-sm text-orange">→ Add your first agent</a>
        </div>
      )}

      <Modal open={showNew && !noAgents} onClose={() => setShowNew(false)} title="New task" systemTag="SYS:: ASSIGN">
        <NewTaskPanel agents={agents} onDone={() => setShowNew(false)} />
      </Modal>

      {capped && <p className="mono mt-3 text-[11px] text-ink-soft">Showing most recent 200 tasks.</p>}

      {/* Columns: Failed loud, Done quiet (1A-UI hierarchy) */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            agents={agentMap}
            noAgents={noAgents}
          />
        ))}
      </div>
    </main>
  );
}

function Column({
  status,
  tasks,
  agents,
  noAgents,
}: {
  status: TaskStatus;
  tasks: BoardTask[];
  agents: Map<string, AgentRow>;
  noAgents: boolean;
}) {
  const meta = STATUS_UI[status];
  const quiet = status === "done";
  return (
    <section
      aria-label={`${meta.label} column`}
      className={`border bg-paper-2 ${meta.loud && tasks.length > 0 ? "border-magenta" : "border-line"} ${quiet ? "opacity-80" : ""}`}
    >
      <h2 className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor(status) }} />
          {meta.label}
        </span>
        <span className="mono text-xs text-ink-soft">{tasks.length}</span>
      </h2>
      <div className="space-y-2 p-2">
        {tasks.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-ink-soft">
            {status === "todo" && !noAgents ? "Assign a task" : "—"}
          </p>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} agent={agents.get(t.assigned_agent_id)} loud={meta.loud} />
        ))}
      </div>
    </section>
  );
}

function TaskCard({ task, agent, loud }: { task: BoardTask; agent?: AgentRow; loud?: boolean }) {
  const terminal = task.status === "done" || task.status === "failed";
  return (
    <article className="clip-corner border border-line bg-paper p-2.5">
      <div className="text-sm">{task.title}</div>
      <div className="mono mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
        <span>{agent ? `${agent.name} · ab_${agent.api_key_prefix}` : "—"}</span>
        <span className="ml-auto">{relative(task.updated_at)}</span>
      </div>
      {terminal && task.result && (
        <div className={`mono mt-1.5 truncate text-[11px] ${loud ? "text-magenta" : "text-ink-soft"}`}>
          → {task.result}
        </div>
      )}
    </article>
  );
}

function NewTaskPanel({ agents, onDone }: { agents: AgentRow[]; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createTaskAction, null);

  // Close on success.
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <div className="grid gap-3">
        <input name="title" required placeholder="Task title" className="border border-line bg-paper px-3 py-2 text-sm" />
        <select name="assignedAgentId" required defaultValue="" className="border border-line bg-paper px-3 py-2 text-sm">
          <option value="" disabled>Assign to…</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>
          ))}
        </select>
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Creating…" : "Create + assign"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
