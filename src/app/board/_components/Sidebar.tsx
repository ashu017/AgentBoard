"use client";
// Left operator panel: a collapsible PROJECTS section (each with a tiny progress
// bar + %) and a collapsible AGENTS section (each with a live-derived status).
// Also owns hide/reveal of the whole sidebar.
import { useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, PanelLeftClose, PanelLeft } from "lucide-react";
import type { BoardTask, AgentRow } from "@/lib/manager-queries";
import { RULE, agentLiveStatus, AGENT_STATUS_UI } from "./board-ui";

export interface ProjectSummary {
  project: BoardTask;
  total: number;
  done: number;
  pct: number;
}

export function Sidebar({
  projects,
  agents,
  tasks,
  activeProjectId,
  onSelectProject,
  onHide,
}: {
  projects: ProjectSummary[];
  agents: AgentRow[];
  tasks: BoardTask[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onHide: () => void;
}) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const activeAgents = agents.filter((a) => !a.revoked_at);

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r bg-paper-2"
      style={{ borderColor: RULE }}
    >
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">Console</span>
        <button
          onClick={onHide}
          aria-label="Hide sidebar"
          title="Hide sidebar"
          className="text-ink-soft hover:text-orange"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* PROJECTS */}
        <Section
          label="Projects"
          open={projectsOpen}
          onToggle={() => setProjectsOpen((v) => !v)}
          count={projects.length}
        >
          {projects.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-ink-soft">No projects yet.</p>
          )}
          {projects.map(({ project, done, total, pct }) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                aria-current={active ? "true" : undefined}
                className={`block w-full px-3 py-2 text-left ${active ? "bg-paper" : "hover:bg-paper"}`}
                style={active ? { boxShadow: "inset 3px 0 0 var(--orange)" } : undefined}
              >
                <span className="flex items-center gap-1.5 text-[13px]">
                  <FolderOpen size={13} className={active ? "text-orange" : "text-ink-soft"} />
                  <span className="truncate">{project.title}</span>
                  <span className="mono ml-auto shrink-0 text-[10px] text-ink-soft">{pct}%</span>
                </span>
                <span className="mono mt-1 flex items-center gap-2 text-[9px] text-ink-soft">
                  <span className="h-1 flex-1" style={{ background: "var(--line)" }}>
                    <span className="block h-full" style={{ width: `${pct}%`, background: "var(--st-done)" }} />
                  </span>
                  <span className="shrink-0">{done}/{total}</span>
                </span>
              </button>
            );
          })}
        </Section>

        {/* AGENTS */}
        <Section
          label="Agents"
          open={agentsOpen}
          onToggle={() => setAgentsOpen((v) => !v)}
          count={activeAgents.length}
        >
          {activeAgents.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-ink-soft">No agents yet.</p>
          )}
          {activeAgents.map((a) => {
            const st = AGENT_STATUS_UI[agentLiveStatus(a, tasks)];
            return (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st.color }} />
                <span className="truncate text-[13px]">{a.name}</span>
                <span className="mono ml-auto shrink-0 text-[9px] uppercase tracking-widest" style={{ color: st.color }}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  label,
  open,
  onToggle,
  count,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${RULE}` }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="mono flex w-full items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink-soft hover:text-ink"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
        <span className="ml-auto">{count}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

/** Thin reveal strip shown when the sidebar is hidden. */
export function SidebarReveal({ onShow }: { onShow: () => void }) {
  return (
    <button
      onClick={onShow}
      aria-label="Show sidebar"
      title="Show sidebar"
      className="flex w-6 shrink-0 items-center justify-center border-r bg-paper-2 text-ink-soft hover:text-orange"
      style={{ borderColor: RULE }}
    >
      <PanelLeft size={15} />
    </button>
  );
}
