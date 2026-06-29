// Phase 2 runtime smoke: drive the 3 real MCP tools through a real SDK client
// against a freshly-seeded per-agent key. Proves the route wiring (withMcpAuth →
// tools → agent-db) end to end, not just the agent-db layer. Cleans up after.
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = process.env.SMOKE_ENDPOINT || "http://localhost:3100/api/mcp";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// Generate a key the same way src/lib/api-key does.
const prefix = randomBytes(8).toString("hex").slice(0, 8);
const secret = randomBytes(32).toString("hex");
const token = `ab_${prefix}_${secret}`;
const hash = createHash("sha256").update(token).digest("hex");

let userId, wsId, agentId, taskId;
const log = (...a) => console.log(...a);

async function seed() {
  const u = await db.auth.admin.createUser({ email: `smoke-${Date.now()}@example.test`, email_confirm: true });
  userId = u.data.user.id;
  const ws = await db.from("workspaces").insert({ owner_user_id: userId, name: "smoke" }).select("id").single();
  wsId = ws.data.id;
  const a = await db.from("agents").insert({ workspace_id: wsId, name: "smoke-agent", api_key_hash: hash, api_key_prefix: prefix }).select("id").single();
  agentId = a.data.id;
  const t = await db.from("tasks").insert({ workspace_id: wsId, assigned_agent_id: agentId, title: "smoke task", status: "todo", created_by_user_id: userId }).select("id").single();
  taskId = t.data.id;
}

async function cleanup() {
  // Delete workspace first (cascades agents/tasks/events), then the user.
  if (wsId) await db.from("workspaces").delete().eq("id", wsId).catch(() => {});
  if (userId) await db.auth.admin.deleteUser(userId).catch(() => {});
}

async function run() {
  await seed();
  log("seeded agent", agentId, "task", taskId);

  const client = new Client({ name: "phase2-smoke", version: "0.0.1" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  log("✓ handshake");

  const tools = await client.listTools();
  log("✓ tools:", tools.tools.map((t) => t.name).join(", "));

  const r1 = await client.callTool({ name: "list_my_tasks", arguments: {} });
  log("✓ list_my_tasks:", r1.content[0].text.slice(0, 120));

  const r2 = await client.callTool({ name: "update_task_status", arguments: { task_id: taskId, status: "in_progress", note: "smoke start" } });
  log("✓ update_task_status:", r2.content[0].text.slice(0, 120));

  const r3 = await client.callTool({ name: "submit_result", arguments: { task_id: taskId, output: "smoke result", status: "done" } });
  log("✓ submit_result:", r3.content[0].text.slice(0, 120));

  // Negative: illegal transition (done is terminal) must surface as error 409.
  const r4 = await client.callTool({ name: "update_task_status", arguments: { task_id: taskId, status: "in_progress" } });
  log(r4.isError ? "✓ illegal transition rejected:" : "✗ EXPECTED ERROR:", r4.content[0].text);

  // Verify DB end state.
  const { data: finalTask } = await db.from("tasks").select("status,result").eq("id", taskId).single();
  log("DB final:", JSON.stringify(finalTask));
  const pass = finalTask.status === "done" && finalTask.result === "smoke result" && r4.isError;
  log(pass ? "\nPHASE 2 SMOKE: PASS" : "\nPHASE 2 SMOKE: FAIL");

  await transport.close();
  return pass;
}

run().then((ok) => cleanup().then(() => process.exit(ok ? 0 : 1)))
  .catch((e) => { console.error("ERROR", e); return cleanup().then(() => process.exit(1)); });
