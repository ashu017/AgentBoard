"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { STATUSES, canTransition, type TaskStatus } from "@/lib/task-status";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import { createTaskAction, createProjectAction, updateTaskAction, updateProjectAction, deleteTaskAction, moveTaskAction, type ActionResult } from "@/app/actions";
import type { BoardTask, AgentRow, BoardFilters, TimeWindow, StatusFilter, ProjectOption } from "@/lib/manager-queries";
import type { CreatedProject } from "@/lib/manager-actions";
import { Modal } from "@/app/_components/Modal";
import { AddAgentFlow } from "@/app/_components/AddAgentFlow";

function relative(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Small pencil (edit) glyph — inline SVG, no icon dependency. */
function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5.5-2.5 7.5-7.5z" />
    </svg>
  );
}

/** Small trash (delete) glyph — inline SVG, no icon dependency. */
function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9h7l.5-9M6.5 6.5v4.5M9.5 6.5v4.5" />
    </svg>
  );
}

const WINDOW_LABELS: Record<TimeWindow, string> = { "2w": "Last 2 weeks", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };
const STATUS_LABELS: Record<StatusFilter, string> = { active: "Active", all: "All" };

export function BoardClient({
  initialTasks,
  agents,
  projects,
  capped,
  mcpEndpoint,
  filters,
}: {
  initialTasks: BoardTask[];
  agents: AgentRow[];
  projects: ProjectOption[];
  capped: boolean;
  mcpEndpoint: string;
  filters: BoardFilters;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [live, setLive] = useState(false);
  // Re-seed local state when the server sends a fresh snapshot (after a create/
  // edit revalidatePath("/board") or filter navigation). useState reads its
  // initial value only at mount, so without this the board showed stale data
  // until a hard refresh even though the server re-rendered with new rows. The
  // server snapshot is authoritative; Realtime updates layer on top between
  // navigations. (Intentional prop→state sync — the lint rule flags the generic
  // case, but re-syncing to a fresh server render is the correct behavior here.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(initialTasks);
  }, [initialTasks]);
  const [announce, setAnnounce] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [addAgent, setAddAgent] = useState(false);
  // When set, the New Task modal opens pre-scoped to this project (lane "+ task").
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  // The task / project currently being edited (board-ux #3 / #4).
  const [editTask, setEditTask] = useState<BoardTask | null>(null);
  const [editProject, setEditProject] = useState<BoardTask | null>(null);
  // The task/project pending delete-confirmation (board-ux).
  const [confirmDelete, setConfirmDelete] = useState<BoardTask | null>(null);
  // Drag-and-drop: the task being dragged (board-ux). Drives legal-target highlighting.
  const [dragging, setDragging] = useState<BoardTask | null>(null);
  const [moveError, setMoveError] = useState("");

  // Drop a dragged task into a status column: validate the transition, call the
  // move action, optimistically update local state so the card jumps immediately.
  const moveTaskTo = async (taskId: string, to: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === to) return;
    if (!canTransition(task.status, to)) {
      setMoveError(`Can't move "${task.title}" from ${STATUS_UI[task.status].label} to ${STATUS_UI[to].label}`);
      return;
    }
    setMoveError("");
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: to } : t)));
    const res = await moveTaskAction(taskId, to);
    if (!res.ok) setMoveError(res.error ?? "Move failed");
  };
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Live board: subscribe to tasks changes, refetch snapshot on each (D9 pattern).
  // Note: the live refetch pulls recent tasks (incl. parent_id/kind for grouping);
  // the server render is the source of truth for the filtered view on load/nav.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    async function refetch() {
      const { data } = await supabase!
        .from("tasks")
        .select("id, title, description, status, result, assigned_agent_id, parent_id, kind, updated_at")
        .order("updated_at", { ascending: false })
        .limit(400);
      if (data) setTasks(data as BoardTask[]);
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Realtime under RLS: postgres_changes on `tasks` only reach this client if the
    // realtime socket carries the user's JWT (else RLS silently filters EVERY event
    // and the board looks connected but never updates — DECISIONS D9-RT). The anon/
    // publishable key alone fails the owner_user_id = auth.uid() policy, so we must
    // hand the session token to the realtime client before subscribing.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("board-tasks")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
          const row = payload.new as Partial<BoardTask> | undefined;
          if (row?.title && row.status) setAnnounce(`Task ${row.title} moved to ${STATUS_UI[row.status as TaskStatus].label}`);
          void refetch();
        })
        .subscribe((s) => setLive(s === "SUBSCRIBED"));
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Split into lanes (top-level projects) and their child tasks grouped by parent.
  // A standalone top-level row that is NOT a project (legacy/edge) still renders as
  // its own single-card lane so nothing is ever hidden.
  const { lanes, childrenByParent } = useMemo(() => {
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
    return { lanes: top, childrenByParent: children };
  }, [tasks]);

  // Scan summary counts the CHILD TASKS across all visible lanes (the actual work),
  // not the project rows themselves.
  const allChildren = useMemo(() => [...childrenByParent.values()].flat(), [childrenByParent]);
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, allChildren.filter((t) => t.status === s).length])
  ) as Record<TaskStatus, number>;
  const hasFailed = counts.failed > 0;
  const noAgents = agents.length === 0;

  const openTaskForProject = (projectId: string) => {
    setTaskProjectId(projectId);
    setShowNew(true);
  };

  return (
    <main className="p-5">
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* Illegal-move feedback for drag-and-drop (board-ux). */}
      {moveError && (
        <div role="alert" className="mono mb-2 flex items-center gap-2 border border-magenta bg-paper px-3 py-1.5 text-[11px] text-magenta">
          {moveError}
          <button onClick={() => setMoveError("")} aria-label="Dismiss" className="ml-auto">✕</button>
        </div>
      )}

      {/* Scan summary line + New menu */}
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
        <NewMenu
          onProject={() => setShowNewProject(true)}
          onTask={() => { setTaskProjectId(null); setShowNew(true); }}
          onAgent={() => setAddAgent(true)}
        />
      </div>

      {/* Filter bar (URL params, shareable). Anchors → server re-renders filtered. */}
      <FilterBar filters={filters} projects={projects} />

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
        blurBackdrop
        size="lg"
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
          <NewTaskPanel
            agents={agents}
            projects={projects}
            defaultProjectId={taskProjectId ?? undefined}
            onDone={() => setShowNew(false)}
          />
        )}
      </Modal>

      <Modal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        title="New project"
        systemTag="SYS:: NEW PROJECT"
        blurBackdrop
        size="lg"
      >
        <NewProjectPanel agents={agents} onDone={() => setShowNewProject(false)} />
      </Modal>

      {/* Edit task — name + description (board-ux #3). */}
      <Modal
        open={Boolean(editTask)}
        onClose={() => setEditTask(null)}
        title="Edit task"
        systemTag="SYS:: EDIT TASK"
        blurBackdrop
        size="lg"
      >
        {editTask && <EditTaskPanel task={editTask} onDone={() => setEditTask(null)} />}
      </Modal>

      {/* Edit project — name, lead agent, description (board-ux #4). */}
      <Modal
        open={Boolean(editProject)}
        onClose={() => setEditProject(null)}
        title="Edit project"
        systemTag="SYS:: EDIT PROJECT"
        blurBackdrop
        size="lg"
      >
        {editProject && <EditProjectPanel project={editProject} agents={agents} onDone={() => setEditProject(null)} />}
      </Modal>

      {/* Delete confirmation — tasks and projects (board-ux). Deleting a project
          also removes its tasks (DB cascade). */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === "project" ? "Delete project?" : "Delete task?"}
        systemTag="SYS:: CONFIRM DELETE"
        blurBackdrop
      >
        {confirmDelete && <DeleteConfirmPanel item={confirmDelete} onDone={() => setConfirmDelete(null)} />}
      </Modal>

      {capped && <p className="mono mt-3 text-[11px] text-ink-soft">Showing most recent 200 projects.</p>}

      {/* Swimlanes: one lane per project (LANES-1). New lanes/cards fade in via
          the `enter-fade` animation (board-ux #2/#5) so revalidated items ease in
          instead of popping abruptly. */}
      <div className="mt-4 space-y-4">
        {lanes.length === 0 && (
          <p className="clip-corner border border-dashed border-line p-8 text-center text-sm text-ink-soft">
            No projects match these filters.
          </p>
        )}
        {lanes.map((project) => (
          <ProjectLane
            key={project.id}
            project={project}
            tasks={childrenByParent.get(project.id) ?? []}
            agents={agentMap}
            onAddTask={() => openTaskForProject(project.id)}
            onEditProject={() => setEditProject(project)}
            onEditTask={setEditTask}
            onDeleteProject={() => setConfirmDelete(project)}
            onDeleteTask={setConfirmDelete}
            dragging={dragging}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDropTo={moveTaskTo}
          />
        ))}
      </div>
    </main>
  );
}

function FilterBar({ filters, projects }: { filters: BoardFilters; projects: ProjectOption[] }) {
  const windows: TimeWindow[] = ["2w", "30d", "90d", "all"];
  const statuses: StatusFilter[] = ["active", "all"];
  const href = (next: Partial<BoardFilters>) => {
    const w = next.window ?? filters.window;
    const s = next.status ?? filters.status;
    const p = next.project ?? filters.project;
    return `/board?window=${w}&status=${s}&project=${encodeURIComponent(p)}`;
  };
  return (
    <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="uppercase tracking-widest text-ink-soft">project</span>
        {/* Server re-render on change: navigate to the project-scoped URL. */}
        <select
          aria-label="Filter by project"
          value={filters.project}
          onChange={(e) => { window.location.href = href({ project: e.target.value }); }}
          className="border border-line bg-paper px-2 py-0.5 text-[11px]"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
        </select>
      </div>
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

/**
 * A project swimlane: a header (project title, status, lead agent, N/M done, + task)
 * and a row of the status columns holding THIS project's tasks (LANES-1).
 */
function ProjectLane({
  project,
  tasks,
  agents,
  onAddTask,
  onEditProject,
  onEditTask,
  onDeleteProject,
  onDeleteTask,
  dragging,
  onDragStart,
  onDragEnd,
  onDropTo,
}: {
  project: BoardTask;
  tasks: BoardTask[];
  agents: Map<string, AgentRow>;
  onAddTask: () => void;
  onEditProject: () => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteProject: () => void;
  onDeleteTask: (task: BoardTask) => void;
  dragging: BoardTask | null;
  onDragStart: (task: BoardTask) => void;
  onDragEnd: () => void;
  onDropTo: (taskId: string, to: TaskStatus) => void;
}) {
  const lead = project.assigned_agent_id ? agents.get(project.assigned_agent_id) : undefined;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const projectTerminal = project.status === "done" || project.status === "failed";

  return (
    <section aria-label={`Project ${project.title}`} className="enter-fade border border-line bg-paper-2">
      {/* Lane header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor(project.status) }} />
          {project.title}
        </span>
        <span className="mono text-[10px] uppercase tracking-widest text-ink-soft">
          {STATUS_UI[project.status].label}
        </span>
        <span className="mono text-[10px] text-ink-soft">
          {lead ? `${lead.name} · ab_${lead.api_key_prefix}` : "unassigned"}
        </span>
        <span className="mono ml-auto text-[10px] text-ink-soft" title="tasks done / total">
          {doneCount}/{tasks.length} done
        </span>
        {!projectTerminal && (
          <button
            onClick={onAddTask}
            className="mono text-[10px] uppercase tracking-widest text-ink-soft hover:text-orange"
          >
            + task
          </button>
        )}
        {/* Edit project — icon, rightmost of the lane row (board-ux #4). Miscellaneous
            is the system catch-all and isn't editable. */}
        {project.title !== "Miscellaneous" && (
          <>
            <button
              onClick={onEditProject}
              aria-label={`Edit project ${project.title}`}
              title="Edit project"
              className="text-ink-soft hover:text-orange"
            >
              <EditIcon />
            </button>
            <button
              onClick={onDeleteProject}
              aria-label={`Delete project ${project.title}`}
              title="Delete project"
              className="text-ink-soft hover:text-magenta"
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      {/* Status columns for this project's tasks */}
      <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((status) => {
          const meta = STATUS_UI[status];
          const colTasks = tasks.filter((t) => t.status === status);
          const quiet = status === "done";
          // This column is a legal drop target iff a card from THIS lane is being
          // dragged, it's a different status, and the transition is allowed (SSOT).
          const isLegalTarget =
            !!dragging &&
            dragging.parent_id === project.id &&
            dragging.status !== status &&
            canTransition(dragging.status, status);
          return (
            <div
              key={status}
              aria-label={`${meta.label} column`}
              // Always allow the drop (preventDefault) so the browser permits it —
              // gating this on async React `dragging` state raced the native drag
              // events and made drops silently fail. Legality is enforced in the
              // drop handler / moveTaskTo (SSOT), not here.
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/task-id");
                if (taskId) onDropTo(taskId, status);
              }}
              className={`border bg-paper ${isLegalTarget ? "border-orange ring-1 ring-orange" : meta.loud && colTasks.length > 0 ? "border-magenta" : "border-line"} ${quiet ? "opacity-80" : ""}`}
            >
              <h3 className="flex items-center justify-between border-b border-line px-2 py-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: statusColor(status) }} />
                  {meta.label}
                </span>
                <span className="mono text-[10px] text-ink-soft">{colTasks.length}</span>
              </h3>
              <div className="space-y-2 p-2">
                {colTasks.length === 0 && (
                  <p className="px-1 py-2 text-center text-[10px] text-ink-soft">
                    {isLegalTarget ? "drop here" : "—"}
                  </p>
                )}
                {colTasks.map((t) => (
                  <TaskCard key={t.id} task={t} agent={t.assigned_agent_id ? agents.get(t.assigned_agent_id) : undefined} loud={meta.loud} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} onDragStart={() => onDragStart(t)} onDragEnd={onDragEnd} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  agent,
  loud,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  agent?: AgentRow;
  loud?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const terminal = task.status === "done" || task.status === "failed";

  return (
    <article
      draggable
      onDragStart={(e) => {
        // Put the task id in the drag payload synchronously — the drop handler
        // reads this, so it never depends on async React state (the race that
        // made drops fail). onDragStart(task) still drives the target highlight.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/task-id", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="enter-fade clip-corner group cursor-grab border border-line bg-paper p-2.5 active:cursor-grabbing"
    >
      <div className="text-sm">{task.title}</div>
      {/* Agent name (no id — board-ux) · time · inline edit icon (board-ux). */}
      <div className="mono mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
        <span className="truncate">{agent ? agent.name : "—"}</span>
        <span className="ml-auto shrink-0">{relative(task.updated_at)}</span>
        <button
          onClick={onEdit}
          aria-label={`Edit task ${task.title}`}
          title="Edit task"
          className="shrink-0 text-ink-soft hover:text-orange"
        >
          <EditIcon />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete task ${task.title}`}
          title="Delete task"
          className="shrink-0 text-ink-soft hover:text-magenta"
        >
          <TrashIcon />
        </button>
      </div>

      {terminal && task.result && (
        <div className={`mono mt-1.5 truncate text-[11px] ${loud ? "text-magenta" : "text-ink-soft"}`}>
          → {task.result}
        </div>
      )}
    </article>
  );
}

function DeleteConfirmPanel({ item, onDone }: { item: BoardTask; onDone: () => void }) {
  const isProject = item.kind === "project";
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(deleteTaskAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={item.id} />
      <p className="text-sm text-ink">
        Delete <span className="font-semibold">{item.title}</span>?
        {isProject && " This also deletes every task in the project."} This can&apos;t be undone.
      </p>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-magenta px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Deleting…" : isProject ? "Delete project" : "Delete task"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

function NewMenu({ onProject, onTask, onAgent }: { onProject: () => void; onTask: () => void; onAgent: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
              className="bg-orange px-3 py-1.5 text-sm font-medium text-paper">
        + New <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-36 border border-line bg-paper text-sm shadow">
          <button role="menuitem" onClick={() => { setOpen(false); onProject(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Project</button>
          <button role="menuitem" onClick={() => { setOpen(false); onTask(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Task</button>
          <button role="menuitem" onClick={() => { setOpen(false); onAgent(); }} className="block w-full px-3 py-2 text-left hover:bg-paper-2">Agent</button>
        </div>
      )}
    </div>
  );
}

function NewProjectPanel({ agents, onDone }: { agents: AgentRow[]; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const noAgents = active.length === 0;
  const [state, formAction, pending] = useActionState<ActionResult<CreatedProject> | null, FormData>(createProjectAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <div className="grid w-full gap-3">
        <input name="title" required placeholder="Project title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="leadAgentId" aria-label="Lead agent" defaultValue="" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="">Unassigned (no lead agent)</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        {/* A project can be created with no agents (P2) — it's just unassigned until one exists. */}
        {noAgents && (
          <p className="text-[11px] text-ink-soft">
            No agents yet — you can create the project now and assign a lead (and tasks) once you add one.
          </p>
        )}
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Creating…" : "Create project"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

function NewTaskPanel({ agents, projects, defaultProjectId, onDone }: { agents: AgentRow[]; projects: ProjectOption[]; defaultProjectId?: string; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createTaskAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select the lane's project when launched from a lane "+ task"; otherwise
  // default to the first project (Miscellaneous, pinned first by listProjects).
  const initialProject = defaultProjectId ?? projects[0]?.id ?? "";

  return (
    <form action={formAction}>
      <div className="grid w-full gap-3">
        <select name="projectId" aria-label="Project" defaultValue={initialProject} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
        </select>
        <input name="title" required placeholder="Task title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="assignedAgentId" required defaultValue="" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="" disabled>Assign to…</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>
          ))}
        </select>
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
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

function EditTaskPanel({ task, onDone }: { task: BoardTask; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(updateTaskAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={task.id} />
      <div className="grid w-full gap-3">
        <input name="title" required defaultValue={task.title} placeholder="Task title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <textarea name="description" defaultValue={task.description ?? ""} placeholder="Description (optional)" rows={3} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

function EditProjectPanel({ project, agents, onDone }: { project: BoardTask; agents: AgentRow[]; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(updateProjectAction, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={project.id} />
      <div className="grid w-full gap-3">
        <input name="title" required defaultValue={project.title} placeholder="Project title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="leadAgentId" aria-label="Lead agent" defaultValue={project.assigned_agent_id ?? ""} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="">Unassigned (no lead agent)</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        <textarea name="description" defaultValue={project.description ?? ""} placeholder="Description (optional)" rows={3} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onDone} className="border border-line px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

