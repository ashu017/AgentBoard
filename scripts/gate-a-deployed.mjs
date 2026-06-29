// S0 Gate A driver — real MCP client against the DEPLOYED Vercel endpoint.
// Uses the official @modelcontextprotocol/sdk Client + StreamableHTTPClientTransport.
// Token is read from .env.local (never printed).
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = process.env.GATE_A_ENDPOINT || "https://jiraagent.vercel.app/api/mcp";

// --- read AGENT_SPIKE_TOKEN from .env.local without echoing it ---
const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const m = envRaw.match(/^AGENT_SPIKE_TOKEN=(.*)$/m);
if (!m) {
  console.error("FATAL: AGENT_SPIKE_TOKEN not found in .env.local");
  process.exit(2);
}
let token = m[1].trim();
// strip optional surrounding quotes
token = token.replace(/^["']|["']$/g, "");
console.log(`token loaded from .env.local (length=${token.length}, masked)`);

const step = (s) => console.log(`\n=== ${s} ===`);
const t0 = Date.now();
const ms = () => `${Date.now() - t0}ms`;

const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
  requestInit: {
    headers: { Authorization: `Bearer ${token}` },
  },
});

const client = new Client(
  { name: "agentboard-gate-a-probe", version: "0.0.1" },
  { capabilities: {} }
);

let createdId = null;

try {
  step(`connect + initialize handshake @ ${ENDPOINT}`);
  await client.connect(transport);
  console.log(`[${ms()}] handshake OK`);
  console.log("server info:", JSON.stringify(client.getServerVersion()));
  console.log("server capabilities:", JSON.stringify(client.getServerCapabilities()));

  step("tools/list");
  const tools = await client.listTools();
  console.log(`[${ms()}] tools:`, tools.tools.map((t) => t.name).join(", "));
  const ut = tools.tools.find((t) => t.name === "update_task");
  if (!ut) throw new Error("update_task tool NOT present in tools/list");
  console.log("update_task inputSchema:", JSON.stringify(ut.inputSchema));

  step("tools/call update_task");
  const title = `gate-a-probe ${new Date().toISOString()}`;
  const res = await client.callTool({
    name: "update_task",
    arguments: { title, status: "in_progress", result: "deployed gate-a probe" },
  });
  console.log(`[${ms()}] callTool isError=${res.isError === true}`);
  console.log("callTool content:", JSON.stringify(res.content));
  if (res.isError) throw new Error("update_task returned isError");

  // parse created id from "ok: {json}"
  const txt = res.content?.[0]?.text ?? "";
  const jm = txt.match(/ok:\s*(\{.*\})/);
  if (jm) {
    const row = JSON.parse(jm[1]);
    createdId = row.id;
    console.log("created row:", JSON.stringify(row));
  }

  step("VERDICT");
  console.log("GATE A: PASS — handshake + tools/list + update_task all succeeded on deployed endpoint");
  if (createdId) console.log(`CREATED_TASK_ID=${createdId}`);
} catch (err) {
  step("ERROR");
  console.error("GATE A FAILED at runtime.");
  console.error("name:", err?.name);
  console.error("message:", err?.message);
  if (err?.code) console.error("code:", err.code);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
  try { await transport.close(); } catch {}
}
