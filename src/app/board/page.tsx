import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents, parseFilters } from "@/lib/manager-queries";
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
  const [{ tasks, capped }, agents] = await Promise.all([listBoardTasks(filters), listAgents()]);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  return (
    <Shell active="board" workspaceName={session.workspace.name}>
      <BoardClient
        initialTasks={tasks}
        agents={agents}
        capped={capped}
        mcpEndpoint={mcpEndpoint}
        filters={filters}
      />
    </Shell>
  );
}
