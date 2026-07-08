import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents, listProjects, parseFilters } from "@/lib/manager-queries";
import { listIdeas, getOrCreateDefaultIdea, rollUpByIdea } from "@/lib/ideas";
import { BoardClient } from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; status?: string; project?: string; idea?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;

  let ideas = await listIdeas();
  // Belt-and-braces: ensure at least one idea exists (a workspace predating 0015).
  if (ideas.length === 0) {
    await getOrCreateDefaultIdea(session.workspace.id);
    ideas = await listIdeas();
  }
  const activeIdea = sp.idea && ideas.some((i) => i.id === sp.idea) ? sp.idea : null;

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  if (!activeIdea) {
    // All-ideas overview: pull every project + task to roll up per-idea counts.
    const { tasks } = await listBoardTasks({ ...parseFilters(sp), status: "all" as const });
    const projects = tasks
      .filter((t) => t.kind === "project")
      .map((p) => ({ id: p.id, idea_id: p.idea_id }));
    const overview = rollUpByIdea({ ideas, projects, tasks });
    return (
      <BoardClient
        mode="overview"
        ideas={ideas}
        overview={overview}
        activeIdeaId={null}
        initialTasks={[]}
        agents={[]}
        projects={[]}
        capped={false}
        mcpEndpoint={mcpEndpoint}
        workspaceName={session.workspace.name}
        filters={parseFilters(sp)}
      />
    );
  }

  const filters = { ...parseFilters(sp), status: "all" as const };
  const [{ tasks, capped }, agents, projects] = await Promise.all([
    listBoardTasks(filters, activeIdea),
    listAgents(activeIdea),
    listProjects(activeIdea),
  ]);
  return (
    <BoardClient
      mode="board"
      ideas={ideas}
      overview={[]}
      activeIdeaId={activeIdea}
      initialTasks={tasks}
      agents={agents}
      projects={projects}
      capped={capped}
      mcpEndpoint={mcpEndpoint}
      workspaceName={session.workspace.name}
      filters={filters}
    />
  );
}
