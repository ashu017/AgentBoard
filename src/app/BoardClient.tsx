"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { STATUSES, type TaskStatus } from "@/lib/task-status";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import { createTaskAction, createChildTaskAction, type ActionResult } from "@/app/actions";
import type { BoardTask, AgentRow, BoardFilters, TimeWindow, StatusFilter } from "@/lib/manager-queries";
import { Modal } from "@/app/_components/Modal";
import { AddAgentFlow } from "@/app/_components/AddAgentFlow";

function relative(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const WINDOW_LABELS: Record<TimeWindow, string> = { "2w": "Last 2 weeks", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };
const STATUS_LABELS: Record<StatusFilter, string> = { active: "Active", all: "All" };

export function BoardClient({
  initialTasks,
  agents,
  capped,
  mcpEndpoint,
  filters,
}: {
  initialTasks: BoardTask[];
  agents: AgentRow[];
  capped: boolean;
  mcpEndpoint: string;
  filters: BoardFilters;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [live, setLive] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [addAgent, setAddAgent] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<BoardTask | null>(null);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Live board: subscribe to tasks changes, refetch snapshot on each (D9 pattern).
  // Note: the live refetch pulls recent tasks (incl. parent_id for grouping); the
  // server render is the source of truth for the filtered view on load/navigation.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    async function refetch() {
      const { data } = await supabase!
        .from("tasks")
        .select("id, title, description, status, result, assigned_agent_id, parent_id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(400);
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

  // Partition into top-level items and children grouped by parent.
  const { topLevel, childrenByParent } = useMemo(() => {
    const children = new Map<string, BoardTask[]>();
    const top: BoardTask[] = [];
    for (const t of tasks) {
      if (t.parent_id) {
        const arr = children.get(t.parent_id) ?? [];
        arr.push(t);
        children.set(t.parent_id, arr);
      } else {
        top.push(t);
      }
    }
    return { topLevel: top, childrenByParent: children };
  }, [tasks]);

  // Column counts + summary are over TOP-LEVEL items (what renders in columns).
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, topLevel.filter((t) => t.status === s).length])
  ) as Record<TaskStatus, number>;
  const hasFailed = counts.failed > 0;
  const noAgents = agents.length === 0;

  return (
    <main className="p-5">
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* Scan summary line + New task */}
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
        <button onClick={() => setShowNew(true)} className="bg-orange px-3 py-1.5 text-sm font-medium text-paper">
          New task
        </button>
      </div>

      {/* Filter bar (URL params, shareable). Anchors → server re-renders filtered. */}
      <FilterBar filters={filters} />

      {noAgents && (
        <div className="clip-corner mt-4 border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-soft">No agents yet — you can&apos;t assign work to nobody.</p>
          <button onClick={() => setAddAgent(true)} className="mono mt-2 inline-block text-sm text-orange">
            → Add your first agent
          </button>
        </div>
      )}

      {addAgent && <AddAgentFlow mcpEndpoint={mcpEndpoint} onClose={() => setAddAgent(false)} />}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title={noAgents ? "No agents on duty" : "New task"}
        systemTag={noAgents ? "SYS:: NOBODY HOME" : "SYS:: ASSIGN"}
      >
        {noAgents ? (
          <div>
            <p className="text-sm text-ink">
              A task with no one to do it is just a wish. Your fleet is empty — hire an agent
              before handing out work.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setShowNew(false); setAddAgent(true); }} className="bg-orange px-4 py-2 text-sm font-medium text-paper">
                Add an agent
              </button>
              <button onClick={() => setShowNew(false)} className="border border-line px-4 py-2 text-sm">Not now</button>
            </div>
          </div>
        ) : (
          <NewTaskPanel agents={agents} onDone={() => setShowNew(false)} />
        )}
      </Modal>

      {/* Human "add subtask" to a project (decomposition, human path). */}
      <Modal
        open={Boolean(subtaskParent)}
        onClose={() => setSubtaskParent(null)}
        title={subtaskParent ? `Subtask of "${subtaskParent.title}"` : "Subtask"}
        systemTag="SYS:: DECOMPOSE"
      >
        {subtaskParent && <AddSubtaskPanel parent={subtaskParent} onDone={() => setSubtaskParent(null)} />}
      </Modal>

      {capped && <p className="mono mt-3 text-[11px] text-ink-soft">Showing most recent 200 top-level items.</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={topLevel.filter((t) => t.status === status)}
            childrenByParent={childrenByParent}
            agents={agentMap}
            noAgents={noAgents}
            onAddSubtask={setSubtaskParent}
          />
        ))}
      </div>
    </main>
  );
}

function FilterBar({ filters }: { filters: BoardFilters }) {
  const windows: TimeWindow[] = ["2w", "30d", "90d", "all"];
  const statuses: StatusFilter[] = ["active", "all"];
  const href = (next: Partial<BoardFilters>) => {
    const w = next.window ?? filters.window;
    const s = next.status ?? filters.status;
    return `/?window=${w}&status=${s}`;
  };
  return (
    <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="uppercase tracking-widest text-ink-soft">window</span>
        {windows.map((w) => (
          <a key={w} href={href({ window: w })}
             className={`px-2 py-0.5 ${filters.window === w ? "bg-ink text-paper" : "border border-line text-ink-soft hover:text-ink"}`}>
            {WINDOW_LABELS[w]}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="uppercase tracking-widest text-ink-soft">status</span>
        {statuses.map((s) => (
          <a key={s} href={href({ status: s })}
             className={`px-2 py-0.5 ${filters.status === s ? "bg-ink text-paper" : "border border-line text-ink-soft hover:text-ink"}`}>
            {STATUS_LABELS[s]}
          </a>
        ))}
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  childrenByParent,
  agents,
  noAgents,
  onAddSubtask,
}: {
  status: TaskStatus;
  tasks: BoardTask[];
  childrenByParent: Map<string, BoardTask[]>;
  agents: Map<string, AgentRow>;
  noAgents: boolean;
  onAddSubtask: (parent: BoardTask) => void;
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
          <TaskCard
            key={t.id}
            task={t}
            agent={agents.get(t.assigned_agent_id)}
            loud={meta.loud}
            childTasks={childrenByParent.get(t.id) ?? []}
            onAddSubtask={onAddSubtask}
          />
        ))}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  agent,
  loud,
  childTasks,
  onAddSubtask,
}: {
  task: BoardTask;
  agent?: AgentRow;
  loud?: boolean;
  childTasks: BoardTask[];
  onAddSubtask: (parent: BoardTask) => void;
}) {
  const terminal = task.status === "done" || task.status === "failed";
  const isProject = childTasks.length > 0;
  const doneCount = childTasks.filter((c) => c.status === "done").length;

  return (
    <article className="clip-corner border border-line bg-paper p-2.5">
      <div className="flex items-start gap-2">
        <div className="text-sm">{task.title}</div>
        {isProject && (
          <span className="mono ml-auto shrink-0 text-[10px] text-ink-soft" title="subtasks done / total">
            {doneCount}/{childTasks.length} done
          </span>
        )}
      </div>
      <div className="mono mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
        <span>{agent ? `${agent.name} · ab_${agent.api_key_prefix}` : "—"}</span>
        <span className="ml-auto">{relative(task.updated_at)}</span>
      </div>

      {terminal && task.result && (
        <div className={`mono mt-1.5 truncate text-[11px] ${loud ? "text-magenta" : "text-ink-soft"}`}>
          → {task.result}
        </div>
      )}

      {/* Nested subtasks (one level), each with its own status dot. */}
      {isProject && (
        <ul className="mt-2 space-y-1 border-l border-line pl-2">
          {childTasks.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor(c.status) }} />
              <span className={c.status === "done" ? "text-ink-soft line-through" : ""}>{c.title}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Human decomposition: add a subtask (only on non-terminal items). */}
      {!terminal && (
        <button
          onClick={() => onAddSubtask(task)}
          className="mono mt-2 text-[10px] uppercase tracking-widest text-ink-soft hover:text-orange"
        >
          + subtask
        </button>
      )}
    </article>
  );
}

function NewTaskPanel({ agents, onDone }: { agents: AgentRow[]; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createTaskAction, null);

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

function AddSubtaskPanel({ parent, onDone }: { parent: BoardTask; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createChildTaskAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="parentTaskId" value={parent.id} />
      <p className="mb-3 text-[11px] text-ink-soft">The subtask inherits this task&apos;s assigned agent.</p>
      <div className="grid gap-3">
        <input name="title" required placeholder="Subtask title" className="border border-line bg-paper px-3 py-2 text-sm" />
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Adding…" : "Add subtask"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
