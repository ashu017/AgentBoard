import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents, listProjects, parseFilters } from "@/lib/manager-queries";
import { BoardClient } from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; status?: string; project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // The redesigned single-project board has a dedicated Done column, so it needs
  // done/failed tasks too — force status="all" (the time window still caps volume).
  const filters = { ...parseFilters(await searchParams), status: "all" as const };
  const [{ tasks, capped }, agents, projects] = await Promise.all([
    listBoardTasks(filters),
    listAgents(),
    listProjects(),
  ]);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  return (
    <BoardClient
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
