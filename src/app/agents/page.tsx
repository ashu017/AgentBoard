import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listAgents } from "@/lib/manager-queries";
import { Shell } from "@/app/_components/Shell";
import { AgentsClient } from "./AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const agents = await listAgents();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";
  const mcpEndpoint = `${origin}/api/mcp`;

  return (
    <Shell active="agents" workspaceName={session.workspace.name}>
      <AgentsClient agents={agents} mcpEndpoint={mcpEndpoint} />
    </Shell>
  );
}
