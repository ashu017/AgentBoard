"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { GitPullRequest } from "lucide-react";
import { canTransition, type TaskStatus } from "@/lib/task-status";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import {
  createTaskAction,
  createProjectAction,
  updateTaskAction,
  updateProjectAction,
  deleteTaskAction,
  moveTaskAction,
  resolveReviewAction,
  type ActionResult,
} from "@/app/actions";
import type { BoardTask, AgentRow, BoardFilters, ProjectOption } from "@/lib/manager-queries";
import type { CreatedProject } from "@/lib/manager-actions";
import { Modal } from "@/app/_components/Modal";
import { AddAgentFlow } from "@/app/_components/AddAgentFlow";
import { Header } from "./_components/Header";
import { Sidebar, SidebarReveal, type ProjectSummary } from "./_components/Sidebar";
import { AgentModal } from "./_components/AgentModal";
import { ProjectView } from "./_components/ProjectView";
import { relative, PRIORITY_COLORS } from "./_components/board-ui";
import { LiveFeed } from "./_components/LiveFeed";
import { IdeaOverview } from "./_components/IdeaOverview";
import { IdeaModal } from "./_components/IdeaModal";
import type { Idea, IdeaRollup } from "@/lib/ideas";

export function BoardClient({
  mode,
  ideas,
  overview,
  activeIdeaId,
  initialTasks,
  agents,
  projects,
  capped,
  mcpEndpoint,
  workspaceName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  filters,
}: {
  mode: "overview" | "board";
  ideas: Idea[];
  overview: IdeaRollup[];
  activeIdeaId: string | null;
  initialTasks: BoardTask[];
  agents: AgentRow[];
  projects: ProjectOption[];
  capped: boolean;
  mcpEndpoint: string;
  workspaceName: string;
  filters: BoardFilters;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [live, setLive] = useState(false);
  // Re-seed local state when the server sends a fresh snapshot (after a create/
  // edit revalidatePath("/board") or filter navigation). useState reads its
  // initial value only at mount, so without this the board showed stale data
  // until a hard refresh even though the server re-rendered with new rows.
  // (Intentional prop→state sync — the lint rule flags the generic case, but
  // re-syncing to a fresh server render is the correct behavior here.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(initialTasks);
  }, [initialTasks]);

  const [announce, setAnnounce] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [addAgent, setAddAgent] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<BoardTask | null>(null);
  const [editProject, setEditProject] = useState<BoardTask | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoardTask | null>(null);
  // Task whose read-only detail modal is open (clicked card body).
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null);
  const [dragging, setDragging] = useState<BoardTask | null>(null);
  const [moveError, setMoveError] = useState("");
  const [reviewTask, setReviewTask] = useState<BoardTask | null>(null);
  // Agent clicked in the sidebar → opens the manage (edit/revoke/delete) modal.
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);

  // Layout state (redesign): the active project, sidebar visibility, live feed.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  // Bumped on each realtime tasks change so the LiveFeed refetches its events.
  const [feedRefresh, setFeedRefresh] = useState(0);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Group tasks: top-level projects (lanes) and children by parent (grouping
  // logic preserved from the swimlane view).
  const { projectRows, childrenByParent } = useMemo(() => {
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
    return { projectRows: top, childrenByParent: children };
  }, [tasks]);

  // Per-project summaries for the sidebar (progress bar + %).
  const projectSummaries = useMemo<ProjectSummary[]>(
    () =>
      projectRows.map((project) => {
        const kids = childrenByParent.get(project.id) ?? [];
        const total = kids.length;
        const done = kids.filter((t) => t.status === "done").length;
        return { project, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
      }),
    [projectRows, childrenByParent]
  );

  // Default active project: first non-Miscellaneous, else first. Resolve/repair
  // whenever the project set changes (e.g. after create/delete revalidation).
  const defaultProjectId = useMemo(() => {
    const nonMisc = projectRows.find((p) => p.title !== "Miscellaneous");
    return nonMisc?.id ?? projectRows[0]?.id ?? null;
  }, [projectRows]);

  useEffect(() => {
    const stillExists = activeProjectId && projectRows.some((p) => p.id === activeProjectId);
    if (!stillExists) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveProjectId(defaultProjectId);
    }
  }, [activeProjectId, projectRows, defaultProjectId]);

  const activeProject = projectRows.find((p) => p.id === activeProjectId) ?? null;
  const activeTasks = activeProject ? childrenByParent.get(activeProject.id) ?? [] : [];

  // Count of tasks awaiting review across ALL projects (header badge).
  const awaitingReview = useMemo(
    () => [...childrenByParent.values()].flat().filter((t) => t.status === "in_review").length,
    [childrenByParent]
  );

  const noAgents = agents.length === 0;

  // Drop a dragged task into a status column: validate (SSOT), call the move
  // action, optimistically update local state so the card jumps immediately.
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

  // Live board: subscribe to tasks changes, refetch snapshot on each (D9 pattern).
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    async function refetch() {
      const { data } = await supabase!
        .from("tasks")
        .select("id, title, description, spec, status, priority, pr_url, need_by, complexity, result, assigned_agent_id, parent_id, kind, review_reason, review_options, review_verdict, review_selected_option, review_note, updated_at")
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
          setFeedRefresh((n) => n + 1);
          void refetch();
        })
        .subscribe((s) => setLive(s === "SUBSCRIBED"));
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const openTaskForProject = (projectId: string) => {
    setTaskProjectId(projectId);
    setShowNew(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div aria-live="polite" className="sr-only">{announce}</div>

      <Header
        workspaceName={workspaceName}
        awaitingReview={awaitingReview}
        onToggleFeed={() => setFeedOpen((v) => !v)}
        feedOpen={feedOpen}
        onNewProject={() => setShowNewProject(true)}
        onNewTask={() => { setTaskProjectId(null); setShowNew(true); }}
        onNewAgent={() => setAddAgent(true)}
        ideas={ideas}
        activeIdeaId={activeIdeaId}
        onNewIdea={() => setShowNewIdea(true)}
      />

      {/* Illegal-move / connection strip */}
      {(moveError || capped) && (
        <div className="mono flex flex-wrap items-center gap-3 border-b border-line px-4 py-1.5 text-[11px]">
          {moveError && (
            <span role="alert" className="flex items-center gap-2 text-magenta">
              {moveError}
              <button onClick={() => setMoveError("")} aria-label="Dismiss">✕</button>
            </span>
          )}
          {capped && <span className="text-ink-soft">Showing most recent 200 projects.</span>}
          <span className={`ml-auto ${live ? "text-st-done" : "text-ink-soft"}`}>{live ? "● LIVE" : "○ connecting"}</span>
        </div>
      )}

      {mode === "board" ? (
      <div className="flex min-h-0 flex-1">
        {sidebarHidden ? (
          <SidebarReveal onShow={() => setSidebarHidden(false)} />
        ) : (
          <Sidebar
            projects={projectSummaries}
            agents={agents}
            tasks={tasks}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onSelectAgent={setSelectedAgent}
            onHide={() => setSidebarHidden(true)}
          />
        )}

        {noAgents ? (
          <div className="min-w-0 flex-1 p-8">
            <div className="clip-corner border border-dashed border-line p-8 text-center">
              <p className="text-sm text-ink-soft">No agents yet — you can&apos;t assign work to nobody.</p>
              <button onClick={() => setAddAgent(true)} className="mono mt-2 inline-block text-sm text-orange">
                → Add your first agent
              </button>
            </div>
          </div>
        ) : activeProject ? (
          <ProjectView
            project={activeProject}
            tasks={activeTasks}
            agents={agentMap}
            onAddTask={() => openTaskForProject(activeProject.id)}
            onEditProject={() => setEditProject(activeProject)}
            onDeleteProject={() => setConfirmDelete(activeProject)}
            onEditTask={setEditTask}
            onDeleteTask={setConfirmDelete}
            onOpenTask={setDetailTask}
            onReview={setReviewTask}
            dragging={dragging}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDropTo={moveTaskTo}
          />
        ) : (
          <div className="min-w-0 flex-1 p-8">
            <p className="clip-corner border border-dashed border-line p-8 text-center text-sm text-ink-soft">
              No projects yet — create one from + New.
            </p>
          </div>
        )}

        <LiveFeed
          open={feedOpen}
          onClose={() => setFeedOpen(false)}
          tasks={tasks}
          refreshKey={feedRefresh}
        />
      </div>
      ) : (
        <IdeaOverview rows={overview} />
      )}

      <IdeaModal open={showNewIdea} onClose={() => setShowNewIdea(false)} />

      {addAgent && <AddAgentFlow mcpEndpoint={mcpEndpoint} ideas={ideas} defaultIdeaId={activeIdeaId ?? undefined} onClose={() => setAddAgent(false)} />}

      {/* Manage an agent clicked in the sidebar — edit / revoke / delete. */}
      <AgentModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />

      <Modal open={showNew} onClose={() => setShowNew(false)} title={noAgents ? "No agents on duty" : "New task"} systemTag={noAgents ? "SYS:: NOBODY HOME" : "SYS:: ASSIGN"} variant="figma" size="lg">
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
            defaultProjectId={taskProjectId ?? activeProjectId ?? undefined}
            activeIdeaId={activeIdeaId}
            onDone={() => setShowNew(false)}
          />
        )}
      </Modal>

      <Modal open={showNewProject} onClose={() => setShowNewProject(false)} title="New project" systemTag="SYS:: NEW PROJECT" variant="figma" size="lg">
        <NewProjectPanel agents={agents} activeIdeaId={activeIdeaId} onDone={() => setShowNewProject(false)} />
      </Modal>

      <Modal open={Boolean(editTask)} onClose={() => setEditTask(null)} title="Edit task" systemTag="SYS:: EDIT TASK" variant="figma" size="lg">
        {editTask && <EditTaskPanel task={editTask} agents={agents} onDone={() => setEditTask(null)} />}
      </Modal>

      <Modal open={Boolean(editProject)} onClose={() => setEditProject(null)} title="Edit project" systemTag="SYS:: EDIT PROJECT" variant="figma" size="lg">
        {editProject && <EditProjectPanel project={editProject} agents={agents} onDone={() => setEditProject(null)} />}
      </Modal>

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title={confirmDelete?.kind === "project" ? "Delete project?" : "Delete task?"} systemTag="SYS:: CONFIRM DELETE" variant="figma">
        {confirmDelete && <DeleteConfirmPanel item={confirmDelete} onDone={() => setConfirmDelete(null)} />}
      </Modal>

      <Modal open={Boolean(reviewTask)} onClose={() => setReviewTask(null)} title="Review request" systemTag="SYS:: REVIEW REQUEST" variant="figma" size="lg">
        {reviewTask && <ReviewModalPanel task={reviewTask} onDone={() => setReviewTask(null)} />}
      </Modal>

      <Modal open={Boolean(detailTask)} onClose={() => setDetailTask(null)} title="Task detail" systemTag="SYS:: TASK" variant="figma" size="lg">
        {detailTask && (
          <TaskDetailPanel
            task={detailTask}
            agent={detailTask.assigned_agent_id ? agentMap.get(detailTask.assigned_agent_id) : undefined}
            // Edit/Delete reuse the SAME state the card wires — close detail first
            // so only one figma modal is ever mounted at a time.
            onEdit={() => { const t = detailTask; setDetailTask(null); setEditTask(t); }}
            onDelete={() => { const t = detailTask; setDetailTask(null); setConfirmDelete(t); }}
            onClose={() => setDetailTask(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * Read-only task detail (opened by clicking a card body). Full details in a clean
 * layout — status/priority/agent as machine-ish mono chips, description/result/PR
 * and the in_review approval context. Edit and Delete hand off to the existing
 * card flows (EditTaskPanel / DeleteConfirmPanel) rather than duplicating a form.
 */
function TaskDetailPanel({
  task,
  agent,
  onEdit,
  onDelete,
  onClose,
}: {
  task: BoardTask;
  agent?: AgentRow;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const failed = task.status === "failed";
  const terminal = task.status === "done" || failed;
  const verdictOption =
    task.review_selected_option && task.review_options
      ? task.review_options.find((o) => o.id === task.review_selected_option)
      : undefined;
  return (
    <div>
      <h3 className="text-base font-semibold text-ink">{task.title}</h3>

      {/* Machine-ish signal row: status, priority, assignee. */}
      <div className="mono mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
        <span className="flex items-center gap-1.5 border border-line px-1.5 py-0.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor(task.status) }} />
          {STATUS_UI[task.status].label}
        </span>
        <span className="border px-1.5 py-0.5" style={{ borderColor: PRIORITY_COLORS[task.priority], color: PRIORITY_COLORS[task.priority] }}>
          {task.priority}
        </span>
        <span className="border border-line px-1.5 py-0.5 text-ink-soft">
          {agent ? agent.name : "unassigned"}
        </span>
        {task.complexity && (
          <span className="border border-line px-1.5 py-0.5 text-ink-soft">
            {task.complexity}
          </span>
        )}
        {task.need_by && (
          <span className="border border-line px-1.5 py-0.5 text-ink-soft normal-case tracking-normal">
            by {formatNeedBy(task.need_by)}
          </span>
        )}
        <span className="ml-auto text-ink-soft normal-case tracking-normal">updated {relative(task.updated_at)} ago</span>
      </div>

      {task.description && (
        <DetailSection label="Description">
          <p className="whitespace-pre-wrap text-sm text-ink">{task.description}</p>
        </DetailSection>
      )}

      {task.pr_url && (
        <DetailSection label="Pull request">
          <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="mono flex items-center gap-1 text-[12px] text-blue hover:underline">
            <GitPullRequest size={12} /> {task.pr_url}
          </a>
        </DetailSection>
      )}

      {task.status === "in_review" && (
        <DetailSection label="Review request">
          {task.review_reason && <p className="text-[13px] italic text-ink">{task.review_reason}</p>}
          {task.review_options && task.review_options.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {task.review_options.map((o) => (
                <li key={o.id} className="clip-corner border border-line p-2 text-sm">
                  <span className="font-medium">{o.label}</span>
                  {o.detail && <span className="mono ml-1 block text-[11px] text-ink-soft">{o.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}

      {task.review_verdict && (
        <DetailSection label="Verdict">
          <p className="mono text-[12px] uppercase tracking-widest text-ink-soft">
            {task.review_verdict}
            {verdictOption && <span className="normal-case tracking-normal text-ink"> — {verdictOption.label}</span>}
          </p>
          {task.review_note && <p className="mt-1 text-[13px] text-ink">{task.review_note}</p>}
        </DetailSection>
      )}

      {terminal && task.result && (
        <DetailSection label="Result">
          <p className={`mono whitespace-pre-wrap text-[12px] ${failed ? "text-magenta" : "text-ink"}`}>{task.result}</p>
        </DetailSection>
      )}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onEdit} className="bg-orange px-4 py-2 text-sm font-medium text-paper">Edit</button>
        <button type="button" onClick={onDelete} className="border border-line px-4 py-2 text-sm text-magenta">Delete</button>
        <button type="button" onClick={onClose} className="ml-auto border border-line px-4 py-2 text-sm">Close</button>
      </div>
    </div>
  );
}

/**
 * Format a need-by DATE ("2026-07-31") for display. Parsed as UTC noon so the
 * calendar date never shifts across timezones (a bare date has no time-of-day).
 */
function formatNeedBy(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** A labeled block in the task-detail read view (mono uppercase caption + body). */
function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mono text-[10px] uppercase tracking-widest text-ink-soft">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Option-review resolution modal (approval loop AL-E): the reason, a radio list
 * of the agent's options, an optional note, and the three verdict actions. The
 * chosen option id is carried on the same form the buttons submit.
 */
function ReviewModalPanel({ task, onDone }: { task: BoardTask; onDone: () => void }) {
  const [selected, setSelected] = useState(task.review_options?.[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(resolveReviewAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="selectedOptionId" value={selected} />
      <p className="text-[13px] italic text-ink">{task.review_reason}</p>
      {task.pr_url && (
        <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="mono mt-2 inline-block text-[11px] text-blue hover:underline">
          → View PR
        </a>
      )}
      <div className="mt-3 grid gap-2">
        {task.review_options?.map((o) => (
          <label key={o.id} className={`clip-corner cursor-pointer border p-2 text-sm ${selected === o.id ? "border-st-done bg-paper" : "border-line"}`}>
            <input type="radio" name="opt" className="mr-2" checked={selected === o.id} onChange={() => setSelected(o.id)} />
            <span className="font-medium">{o.label}</span>
            {o.detail && <span className="mono ml-1 block text-[11px] text-ink-soft">{o.detail}</span>}
          </label>
        ))}
      </div>
      <textarea name="note" placeholder="Note (optional)" rows={2} className="mt-3 w-full border border-line bg-paper px-3 py-2 text-sm" />
      {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button name="verdict" value="approve_continue" disabled={pending} className="bg-orange px-3 py-2 text-sm font-medium text-paper">Approve &amp; continue</button>
        <button name="verdict" value="approve_close" disabled={pending} className="border border-line px-3 py-2 text-sm">Approve &amp; close</button>
        <button name="verdict" value="reject" disabled={pending} className="border border-line px-3 py-2 text-sm text-magenta">Reject</button>
        <button type="button" onClick={onDone} className="ml-auto border border-line px-3 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

function DeleteConfirmPanel({ item, onDone }: { item: BoardTask; onDone: () => void }) {
  const isProject = item.kind === "project";
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(deleteTaskAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
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

/**
 * Project spec field shared by the New/Edit project forms (name="spec"). The full
 * brief (BRD / spec / design doc) delivered to the assigned agent over MCP — NOT
 * shown on the board cards or lane headers (D-PROJECT-SPEC).
 */
function SpecField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <label className="grid gap-1">
      <span className="mono text-[11px] uppercase tracking-widest text-ink-soft">Spec / brief</span>
      <textarea
        name="spec"
        defaultValue={defaultValue}
        placeholder="Full brief for your agents — BRD, spec, or design doc"
        rows={6}
        className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm"
      />
      <span className="text-[11px] text-ink-soft">
        Not shown on the board — delivered to the assigned agent as project context.
      </span>
    </label>
  );
}

/** Priority selector shared by the New/Edit forms (name="priority", default medium). */
function PrioritySelect({ defaultValue = "medium" }: { defaultValue?: "high" | "medium" | "low" }) {
  return (
    <label className="mono flex items-center gap-2 text-[11px] uppercase tracking-widest text-ink-soft">
      Priority
      <select name="priority" defaultValue={defaultValue} className="border border-line bg-paper px-2 py-1 text-sm normal-case tracking-normal text-ink">
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </label>
  );
}

/** Optional target-date field shared by the New/Edit forms (name="needBy"). */
function NeedByField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <label className="mono flex items-center gap-2 text-[11px] uppercase tracking-widest text-ink-soft">
      Need by
      <input
        type="date"
        name="needBy"
        defaultValue={defaultValue}
        className="border border-line bg-paper px-2 py-1 text-sm normal-case tracking-normal text-ink"
      />
    </label>
  );
}

/** Complexity selector shared by the New/Edit forms (name="complexity"). Optional
 * — the empty option leaves it unset (null). Allowed values mirror the DB CHECK. */
function ComplexitySelect({ defaultValue = "" }: { defaultValue?: "" | "low" | "medium" | "high" }) {
  return (
    <label className="mono flex items-center gap-2 text-[11px] uppercase tracking-widest text-ink-soft">
      Complexity
      <select name="complexity" defaultValue={defaultValue} className="border border-line bg-paper px-2 py-1 text-sm normal-case tracking-normal text-ink">
        <option value="">—</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}

function NewProjectPanel({ agents, activeIdeaId, onDone }: { agents: AgentRow[]; activeIdeaId: string | null; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const noAgents = active.length === 0;
  const [state, formAction, pending] = useActionState<ActionResult<CreatedProject> | null, FormData>(createProjectAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={formAction}>
      <input type="hidden" name="ideaId" value={activeIdeaId ?? ""} />
      <div className="grid w-full gap-3">
        <input name="title" required placeholder="Project title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="leadAgentId" aria-label="Lead agent" defaultValue="" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="">Unassigned (no lead agent)</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        <div className="flex flex-wrap items-center gap-4">
          <PrioritySelect />
          <ComplexitySelect />
          <NeedByField />
        </div>
        {noAgents && (
          <p className="text-[11px] text-ink-soft">
            No agents yet — you can create the project now and assign a lead (and tasks) once you add one.
          </p>
        )}
        <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <SpecField />
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

function NewTaskPanel({ agents, projects, defaultProjectId, activeIdeaId, onDone }: { agents: AgentRow[]; projects: ProjectOption[]; defaultProjectId?: string; activeIdeaId: string | null; onDone: () => void }) {
  const active = agents.filter((a) => !a.revoked_at);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createTaskAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const initialProject = defaultProjectId ?? projects[0]?.id ?? "";
  return (
    <form action={formAction}>
      <input type="hidden" name="ideaId" value={activeIdeaId ?? ""} />
      <div className="grid w-full gap-3">
        <select name="projectId" aria-label="Project" defaultValue={initialProject} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
        </select>
        <input name="title" required placeholder="Task title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="assignedAgentId" required defaultValue="" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="" disabled>Assign to…</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        <div className="flex flex-wrap items-center gap-4">
          <PrioritySelect />
          <NeedByField />
        </div>
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

function EditTaskPanel({ task, agents, onDone }: { task: BoardTask; agents: AgentRow[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(updateTaskAction, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Assignable agents: active ones, plus the task's current assignee even if it
  // has since been revoked (so the current selection is always shown/kept).
  const assignable = agents.filter((a) => !a.revoked_at || a.id === task.assigned_agent_id);
  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={task.id} />
      <div className="grid w-full gap-3">
        <input name="title" required defaultValue={task.title} placeholder="Task title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="assignedAgentId" aria-label="Assignee" defaultValue={task.assigned_agent_id ?? ""} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          {assignable.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix}){a.revoked_at ? " — revoked" : ""}</option>))}
        </select>
        <div className="flex flex-wrap items-center gap-4">
          <PrioritySelect defaultValue={task.priority} />
          <NeedByField defaultValue={task.need_by ?? ""} />
        </div>
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
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={project.id} />
      <div className="grid w-full gap-3">
        <input name="title" required defaultValue={project.title} placeholder="Project title" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <select name="leadAgentId" aria-label="Lead agent" defaultValue={project.assigned_agent_id ?? ""} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm">
          <option value="">Unassigned (no lead agent)</option>
          {active.map((a) => (<option key={a.id} value={a.id}>{a.name} (ab_{a.api_key_prefix})</option>))}
        </select>
        <div className="flex flex-wrap items-center gap-4">
          <PrioritySelect defaultValue={project.priority} />
          <ComplexitySelect defaultValue={project.complexity ?? ""} />
          <NeedByField defaultValue={project.need_by ?? ""} />
        </div>
        <textarea name="description" defaultValue={project.description ?? ""} placeholder="Description (optional)" rows={3} className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        <SpecField defaultValue={project.spec ?? ""} />
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
