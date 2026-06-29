import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listBoardTasks, listAgents } from "@/lib/manager-queries";
import { Shell } from "@/app/_components/Shell";
import { BoardClient } from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ tasks, capped }, agents] = await Promise.all([listBoardTasks(), listAgents()]);

  return (
    <Shell active="board" workspaceName={session.workspace.name}>
      <BoardClient initialTasks={tasks} agents={agents} capped={capped} />
    </Shell>
  );
}
