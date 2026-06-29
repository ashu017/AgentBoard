// S0 Gate A — full end-to-end proof against the DEPLOYED Vercel endpoint.
// Real MCP client (official SDK Client + StreamableHTTPClientTransport, bearer header)
//   1. initialize handshake
//   2. tools/list (assert update_task + schema)
//   3. tools/call update_task (status in_review)
//   4. service-role DB read-back (assert row landed)
//   5. cleanup: DELETE the row, assert tasks count == 0
// Tokens/keys read from .env.local, never printed.
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";

const ENDPOINT = process.env.GATE_A_ENDPOINT || "https://jiraagent.vercel.app/api/mcp";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const getEnv = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const token = getEnv("AGENT_SPIKE_TOKEN");
const supaUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const supaSecret = getEnv("SUPABASE_SECRET_KEY");
if (!token || !supaUrl || !supaSecret) {
  console.error("FATAL: missing AGENT_SPIKE_TOKEN / SUPABASE url / SUPABASE_SECRET_KEY in .env.local");
  process.exit(2);
}
console.log(`loaded creds from .env.local (token len=${token.length}, masked)`);

const step = (s) => console.log(`\n=== ${s} ===`);
const t0 = Date.now();
const ms = () => `${Date.now() - t0}ms`;

const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "agentboard-gate-a-probe", version: "0.0.1" }, { capabilities: {} });
const db = createClient(supaUrl, supaSecret, { auth: { persistSession: false } });

let createdId = null;
let pass = true;
const fail = (msg) => { pass = false; console.error(`ASSERT FAIL: ${msg}`); };

try {
  step(`connect + initialize handshake @ ${ENDPOINT}`);
  const connectStart = Date.now();
  await client.connect(transport);
  const handshakeMs = Date.now() - connectStart;
  console.log(`[${ms()}] handshake OK (first call incl. any cold start: ${handshakeMs}ms)`);
  console.log("transport sessionId:", transport.sessionId ?? "(none — stateless)");
  console.log("server info:", JSON.stringify(client.getServerVersion()));
  console.log("server capabilities:", JSON.stringify(client.getServerCapabilities()));

  step("tools/list");
  const tools = await client.listTools();
  console.log(`[${ms()}] tools:`, tools.tools.map((t) => t.name).join(", "));
  const ut = tools.tools.find((t) => t.name === "update_task");
  if (!ut) { fail("update_task tool NOT present"); throw new Error("abort"); }
  console.log("update_task inputSchema:", JSON.stringify(ut.inputSchema));
  const props = ut.inputSchema?.properties ?? {};
  const required = ut.inputSchema?.required ?? [];
  if (!required.includes("title")) fail("title not marked required");
  const statusEnum = props.status?.enum ?? props.status?.anyOf?.flatMap((a) => a.enum ?? []);
  if (!statusEnum || !statusEnum.includes("in_review")) fail(`status enum missing in_review (got ${JSON.stringify(statusEnum)})`);
  if (!("result" in props)) fail("result property missing");
  console.log(`schema check: title required=${required.includes("title")}, status enum=${JSON.stringify(statusEnum)}, result present=${"result" in props}`);

  step("tools/call update_task (status=in_review)");
  const title = `gate-a deployed proof ${new Date().toISOString()}`;
  const callStart = Date.now();
  const res = await client.callTool({
    name: "update_task",
    arguments: { title, status: "in_review", result: "gate-a deployed end-to-end proof" },
  });
  console.log(`[${ms()}] callTool latency=${Date.now() - callStart}ms isError=${res.isError === true}`);
  console.log("callTool content:", JSON.stringify(res.content));
  if (res.isError) { fail("update_task returned isError"); throw new Error("abort"); }
  const txt = res.content?.[0]?.text ?? "";
  const jm = txt.match(/ok:\s*(\{.*\})/);
  if (!jm) { fail("could not parse created row from tool result"); throw new Error("abort"); }
  const row = JSON.parse(jm[1]);
  createdId = row.id;
  console.log("tool-reported row:", JSON.stringify(row));
  if (row.status !== "in_review") fail(`tool-reported status != in_review (got ${row.status})`);

  step("service-role DB read-back");
  const { data: dbRow, error: readErr } = await db
    .from("tasks").select("id,title,status,result,updated_at").eq("id", createdId).single();
  if (readErr) { fail(`DB read-back error: ${readErr.message}`); throw new Error("abort"); }
  console.log("DB row:", JSON.stringify(dbRow));
  if (dbRow.status !== "in_review") fail(`DB status != in_review (got ${dbRow.status})`);
  if (dbRow.title !== title) fail("DB title mismatch");
  if (dbRow.result !== "gate-a deployed end-to-end proof") fail("DB result mismatch");
  console.log("DB read-back confirms the MCP write landed with correct status/title/result.");

  step("cleanup: DELETE row + assert tasks empty");
  const { error: delErr } = await db.from("tasks").delete().eq("id", createdId);
  if (delErr) { fail(`cleanup delete error: ${delErr.message}`); }
  else { console.log(`deleted id=${createdId}`); createdId = null; }
  const { count, error: cntErr } = await db.from("tasks").select("*", { count: "exact", head: true });
  if (cntErr) fail(`count error: ${cntErr.message}`);
  else { console.log(`tasks count now = ${count}`); if (count !== 0) fail(`tasks not empty after cleanup (count=${count})`); }

  step("VERDICT");
  console.log(pass ? "GATE A: PASS — full end-to-end on deployed serverless." : "GATE A: FAIL — see assertion failures above.");
  process.exitCode = pass ? 0 : 1;
} catch (err) {
  step("ERROR");
  console.error("name:", err?.name, "message:", err?.message);
  if (err?.code) console.error("code:", err.code);
  if (err?.stack) console.error(err.stack);
  console.error("GATE A: FAIL (runtime error)");
  process.exitCode = 1;
  // best-effort cleanup if a row was created
  if (createdId) {
    try { await db.from("tasks").delete().eq("id", createdId); console.error(`cleaned up leftover id=${createdId}`); } catch {}
  }
} finally {
  try { await client.close(); } catch {}
  try { await transport.close(); } catch {}
}
