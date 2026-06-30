import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents, listProjects, parseFilters } from "@/lib/manager-queries";
import { Shell } from "@/app/_components/Shell";
import { BoardClient } from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const filters = parseFilters(await searchParams);
  const [{ tasks, capped }, agents, projects] = await Promise.all([
    listBoardTasks(filters),
    listAgents(),
    listProjects(),
  ]);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  return (
    <Shell active="board" workspaceName={session.workspace.name}>
      <BoardClient
        initialTasks={tasks}
        agents={agents}
        projects={projects}
        capped={capped}
        mcpEndpoint={mcpEndpoint}
        filters={filters}
      />
    </Shell>
  );
}
