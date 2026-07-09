"use client";
// Middle column: the selected project's header (name, priority, stats, description,
// completion bar, assigned agents) then 4 kanban columns — Todo, Running
// (in_progress), Needs Review (in_review), Done. Failed tasks surface in the Done
// column area with a loud indicator. Drag-and-drop and the approval-loop review UI
// are preserved from the original BoardClient (dataTransfer approach, inline yes/no).
import { useActionState, useRef } from "react";
import {
  ListTodo,
  Clock,
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
} from "lucide-react";
import { canTransition, type TaskStatus } from "@/lib/task-status";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import { resolveReviewAction, type ActionResult } from "@/app/actions";
import type { BoardTask, AgentRow } from "@/lib/manager-queries";
import { relative, PRIORITY_COLORS, EditIcon, TrashIcon, RULE } from "./board-ui";

// The 4 board columns (Figma single-project layout). `failed` is not a column of
// its own — failed cards live in the Done column with a loud indicator so they
// stay visible (task brief).
const COLUMNS: { status: TaskStatus; label: string; Icon: typeof ListTodo }[] = [
  { status: "todo", label: "Todo", Icon: ListTodo },
  { status: "in_progress", label: "Running", Icon: Clock },
  { status: "in_review", label: "Needs Review", Icon: AlertTriangle },
  { status: "done", label: "Done", Icon: CheckCircle2 },
];

export function ProjectView({
  project,
  tasks,
  agents,
  onAddTask,
  onEditProject,
  onDeleteProject,
  onEditTask,
  onDeleteTask,
  onOpenTask,
  onReview,
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
  onDeleteProject: () => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask) => void;
  onOpenTask: (task: BoardTask) => void;
  onReview: (task: BoardTask) => void;
  dragging: BoardTask | null;
  onDragStart: (task: BoardTask) => void;
  onDragEnd: () => void;
  onDropTo: (taskId: string, to: TaskStatus) => void;
}) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inReview = tasks.filter((t) => t.status === "in_review").length;
  const prsRaised = tasks.filter((t) => t.pr_url).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const projectTerminal = project.status === "done" || project.status === "failed";

  // Agents assigned to this project's tasks (or the project lead), shown inline.
  const assignedIds = new Set<string>();
  if (project.assigned_agent_id) assignedIds.add(project.assigned_agent_id);
  for (const t of tasks) if (t.assigned_agent_id) assignedIds.add(t.assigned_agent_id);
  const assignedAgents = [...assignedIds].map((id) => agents.get(id)).filter(Boolean) as AgentRow[];

  const editable = project.title !== "Miscellaneous";

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-5">
      {/* Project header — title/priority/status on the left, stats block on the
          right (Figma layout), with the edit/add controls trailing the stats. */}
      <section className="enter-fade">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: statusColor(project.status) }} />
              <h1 className="display text-xl uppercase tracking-wide">{project.title}</h1>
              <span
                className="mono border px-2 py-0.5 text-[10px] uppercase tracking-widest"
                style={{ borderColor: PRIORITY_COLORS[project.priority], color: PRIORITY_COLORS[project.priority] }}
              >
                {project.priority}
              </span>
              <span className="mono text-[10px] uppercase tracking-widest text-ink-soft">
                {STATUS_UI[project.status].label}
              </span>
            </div>
            {project.description && (
              <p className="mt-2 max-w-2xl text-sm text-ink-soft">{project.description}</p>
            )}
          </div>

          {/* Right: stats block + controls */}
          <div className="flex shrink-0 items-center gap-5">
            <div className="flex items-center gap-5">
              <Stat label="tasks" value={total} />
              <Stat label="done" value={done} />
              <Stat label="in review" value={inReview} alert={inReview > 0} />
              <Stat label="PRs raised" value={prsRaised} />
            </div>
            <div className="flex items-center gap-2">
              {!projectTerminal && (
                <button onClick={onAddTask} className="mono border border-line px-2.5 py-1 text-[11px] uppercase tracking-widest hover:text-orange">
                  + task
                </button>
              )}
              {editable && (
                <>
                  <button onClick={onEditProject} aria-label={`Edit project ${project.title}`} title="Edit project" className="text-ink-soft hover:text-orange">
                    <EditIcon />
                  </button>
                  <button onClick={onDeleteProject} aria-label={`Delete project ${project.title}`} title="Delete project" className="text-ink-soft hover:text-magenta">
                    <TrashIcon />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Completion bar */}
        <div className="mono mt-3 flex max-w-md items-center gap-2 text-[10px] text-ink-soft">
          <span className="h-1.5 flex-1" style={{ background: "var(--line)" }}>
            <span className="block h-full" style={{ width: `${pct}%`, background: "var(--st-done)" }} />
          </span>
          <span className="shrink-0">{pct}% complete</span>
        </div>

        {/* Assigned agents inline */}
        {assignedAgents.length > 0 && (
          <div className="mono mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-soft">
            <span className="uppercase tracking-widest">agents</span>
            {assignedAgents.map((a) => (
              <span key={a.id} className="border border-line px-1.5 py-0.5">{a.name}</span>
            ))}
          </div>
        )}
      </section>

      {/* Columns */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(({ status, label, Icon }) => {
          let colTasks = tasks.filter((t) => t.status === status);
          // Failed tasks ride along in the Done column, kept visible.
          if (status === "done") colTasks = [...colTasks, ...tasks.filter((t) => t.status === "failed")];
          const isLegalTarget =
            !!dragging &&
            dragging.parent_id === project.id &&
            dragging.status !== status &&
            canTransition(dragging.status, status);
          return (
            <div
              key={status}
              aria-label={`${label} column`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/task-id");
                if (taskId) onDropTo(taskId, status);
              }}
              className={`clip-corner border bg-paper ${isLegalTarget ? "border-orange ring-1 ring-orange" : "border-line"}`}
            >
              <h2 className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: `1px solid ${RULE}` }}>
                <Icon size={13} style={{ color: statusColor(status) }} />
                <span className="mono text-[11px] uppercase tracking-widest">{label}</span>
                <span className="mono ml-auto text-[10px] text-ink-soft">{colTasks.length}</span>
              </h2>
              <div className="space-y-2 p-2">
                {colTasks.length === 0 && (
                  <p className="px-1 py-2 text-center text-[10px] text-ink-soft">
                    {isLegalTarget ? "drop here" : "—"}
                  </p>
                )}
                {colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    agent={t.assigned_agent_id ? agents.get(t.assigned_agent_id) : undefined}
                    onEdit={() => onEditTask(t)}
                    onDelete={() => onDeleteTask(t)}
                    onOpen={() => onOpenTask(t)}
                    onReview={onReview}
                    onDragStart={() => onDragStart(t)}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="text-center">
      <div
        className="display text-xl uppercase leading-none"
        style={{ color: alert ? "#7c3aed" : "var(--ink)", letterSpacing: "0.04em" }}
      >
        {value}
      </div>
      <div
        className="mono mt-1 text-[9px] uppercase tracking-widest"
        style={{ color: alert ? "#7c3aed" : "var(--ink-soft)" }}
      >
        {label}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  agent,
  onEdit,
  onDelete,
  onOpen,
  onReview,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  agent?: AgentRow;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onReview: (task: BoardTask) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const failed = task.status === "failed";
  const terminal = task.status === "done" || failed;
  // A drag ends with a spurious click on some browsers — this flag lets the card
  // swallow that click so a drag is never misread as "open detail".
  const draggedRef = useRef(false);

  return (
    <article
      draggable
      onDragStart={(e) => {
        // Task id goes into the drag payload synchronously — the drop handler
        // reads this, never depending on async React state (the race that made
        // drops fail). onDragStart(task) drives the target highlight.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/task-id", task.id);
        draggedRef.current = true;
        onDragStart();
      }}
      onDragEnd={() => {
        onDragEnd();
        // Clear on the next tick so the click fired right after the drop is
        // still suppressed, but a genuine later click opens the card.
        setTimeout(() => { draggedRef.current = false; }, 0);
      }}
      onClick={() => {
        // Body click opens the detail modal — but not when it's the tail of a
        // drag, and not when it bubbled up from an action button (those call
        // stopPropagation below).
        if (draggedRef.current) return;
        onOpen();
      }}
      className={`enter-fade clip-corner group cursor-pointer border bg-paper p-2.5 ${failed ? "border-magenta" : "border-line"}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: PRIORITY_COLORS[task.priority], marginTop: 5 }}
          title={`${task.priority} priority`}
        />
        {/* The title is a real button so the card is keyboard-openable (Enter/
            Space) with a visible focus ring, while the whole body stays
            mouse-clickable. It opens detail directly and stops the bubble so it
            doesn't double-fire the article's onClick. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="min-w-0 flex-1 cursor-pointer text-left text-sm hover:text-orange"
          aria-label={`Open task ${task.title}`}
        >
          {task.title}
        </button>
      </div>

      <div className="mono mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
        <span className="truncate">{agent ? agent.name : "—"}</span>
        <span className="ml-auto shrink-0">{relative(task.updated_at)}</span>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Edit task ${task.title}`} title="Edit task" className="shrink-0 text-ink-soft hover:text-orange">
          <EditIcon />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={`Delete task ${task.title}`} title="Delete task" className="shrink-0 text-ink-soft hover:text-magenta">
          <TrashIcon />
        </button>
      </div>

      {task.status === "in_review" && (
        <div className="mt-1.5 border-l-2 border-orange pl-2">
          <p className="text-[11px] italic text-ink">{task.review_reason}</p>
          {task.pr_url && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mono mt-1 flex items-center gap-1 text-[10px] text-blue hover:underline"
            >
              <GitPullRequest size={11} /> View PR
            </a>
          )}
          {task.review_options && task.review_options.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); onReview(task); }} className="mono mt-1 block text-[10px] uppercase tracking-widest text-orange">
              ⏸ Review {task.review_options.length} options →
            </button>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <ReviewActions taskId={task.id} />
            </div>
          )}
        </div>
      )}

      {task.pr_url && task.status !== "in_review" && (
        <a
          href={task.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mono mt-1.5 flex items-center gap-1 text-[10px] text-blue hover:underline"
        >
          <GitPullRequest size={11} /> View PR
        </a>
      )}

      {terminal && task.result && (
        <div className={`mono mt-1.5 truncate text-[11px] ${failed ? "text-magenta" : "text-ink-soft"}`}>
          → {task.result}
        </div>
      )}
    </article>
  );
}

/**
 * Inline yes/no review resolution (approval loop AL-E) — rendered on the card for
 * a review with no options. The three verdicts submit the same form with a
 * different button `value`. For an option-review the modal (BoardClient) is used.
 */
function ReviewActions({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(resolveReviewAction, null);
  return (
    <form action={formAction} className="mt-1 flex flex-wrap gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <button name="verdict" value="approve_continue" disabled={pending} className="mono border border-line px-2 py-0.5 text-[10px] uppercase hover:text-orange">Approve &amp; continue</button>
      <button name="verdict" value="approve_close" disabled={pending} className="mono border border-line px-2 py-0.5 text-[10px] uppercase hover:text-orange">Approve &amp; close</button>
      <button name="verdict" value="reject" disabled={pending} className="mono border border-line px-2 py-0.5 text-[10px] uppercase text-magenta">Reject</button>
      {state && !state.ok && <span className="text-[10px] text-magenta">{state.error}</span>}
    </form>
  );
}
