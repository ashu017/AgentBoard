// S0 Gate B — Realtime delivery under RLS (D9-RT) prove-first spike.
//
// Proves the silent-failure mode: a service-role write to `tasks` must be
// RECEIVED LIVE by a client subscribed under the human RLS SELECT policy
// (anon SELECT using true). If the realtime-authorization / RLS / publication
// is wrong, the write commits to Postgres but the subscriber never gets the
// postgres_changes event — and nothing errors.
//
// This subscriber mirrors src/app/page.tsx exactly:
//   - publishable/anon key
//   - channel().on("postgres_changes", {event:"*", schema:"public", table:"tasks"})
//
// Run: node scripts/spike-gateB-realtime.mjs
// Reads keys from .env.local. Cleans up every row it inserts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// --- minimal .env.local parser (no dotenv dep) ---
function loadEnv() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, eq).trim()] = v;
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.SUPABASE_SECRET_KEY;

for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON, SUPABASE_SECRET_KEY: SECRET })) {
  if (!v) { console.error(`MISSING env: ${k}`); process.exit(2); }
}

const SUB_TIMEOUT_MS = 15000;   // time to reach SUBSCRIBED
const EVENT_TIMEOUT_MS = 8000;  // time for each write event to arrive

// Subscriber: anon/publishable key, exactly like the board page.
const sub = createClient(URL, ANON, { realtime: { params: { eventsPerSecond: 20 } } });
// Writer: service-role secret key, bypasses RLS (the agent/MCP plane).
const svc = createClient(URL, SECRET, { auth: { persistSession: false } });

const received = []; // { eventType, status, id, at }
let onEvent = null;  // current waiter resolver

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

function waitForEvent(predicate, timeoutMs, label) {
  return new Promise((resolve) => {
    // check already-received first
    const hit = received.find(predicate);
    if (hit) return resolve({ ok: true, ev: hit, ms: 0 });
    const start = Date.now();
    const timer = setTimeout(() => { onEvent = null; resolve({ ok: false, label }); }, timeoutMs);
    onEvent = (ev) => {
      if (predicate(ev)) {
        clearTimeout(timer);
        onEvent = null;
        resolve({ ok: true, ev, ms: Date.now() - start });
      }
    };
  });
}

const channel = sub
  .channel("tasks-board")
  .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    const ev = { eventType: payload.eventType, id: row?.id, status: row?.status, title: row?.title, at: Date.now() };
    received.push(ev);
    log("EVENT", payload.eventType, "id=" + ev.id, "status=" + ev.status);
    if (onEvent) onEvent(ev);
  });

let subscribedResolve;
const subscribed = new Promise((res) => (subscribedResolve = res));
channel.subscribe((status, err) => {
  log("channel status:", status, err ? "err=" + err.message : "");
  if (status === "SUBSCRIBED") subscribedResolve(true);
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") subscribedResolve(false);
});

const results = { subscribed: false, insert: null, update: null, inReview: null };
let createdId = null;

async function cleanup() {
  if (createdId) {
    const { error } = await svc.from("tasks").delete().eq("id", createdId);
    log("cleanup delete id=" + createdId, error ? "ERROR " + error.message : "ok");
  }
  await sub.removeChannel(channel);
}

async function main() {
  log("Waiting for SUBSCRIBED (anon/publishable subscriber)...");
  const subOk = await Promise.race([
    subscribed,
    new Promise((r) => setTimeout(() => r("timeout"), SUB_TIMEOUT_MS)),
  ]);
  results.subscribed = subOk === true;
  if (subOk !== true) {
    log("FAIL: subscriber never reached SUBSCRIBED:", subOk);
    return;
  }
  log("SUBSCRIBED ok.\n");

  // --- 1) service-role INSERT ---
  log("Service-role INSERT (status=todo)...");
  const ins = await svc.from("tasks").insert({ title: "gateB-spike", status: "todo" }).select("id").single();
  if (ins.error) { log("INSERT db error:", ins.error.message); return; }
  createdId = ins.data.id;
  log("inserted id=" + createdId);
  const insEv = await waitForEvent((e) => e.eventType === "INSERT" && e.id === createdId, EVENT_TIMEOUT_MS, "INSERT");
  results.insert = insEv.ok ? { latencyMs: insEv.ms } : false;
  log(insEv.ok ? `INSERT event RECEIVED (${insEv.ms}ms)\n` : "INSERT event NOT received within timeout\n");

  // --- 2) service-role UPDATE (todo -> in_progress) ---
  log("Service-role UPDATE (status=in_progress)...");
  const upd = await svc.from("tasks").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", createdId);
  if (upd.error) { log("UPDATE db error:", upd.error.message); return; }
  const updEv = await waitForEvent((e) => e.eventType === "UPDATE" && e.id === createdId && e.status === "in_progress", EVENT_TIMEOUT_MS, "UPDATE");
  results.update = updEv.ok ? { latencyMs: updEv.ms } : false;
  log(updEv.ok ? `UPDATE event RECEIVED (${updEv.ms}ms)\n` : "UPDATE event NOT received within timeout\n");

  // --- 3) service-role UPDATE to in_review (newly-enabled value) ---
  log("Service-role UPDATE (status=in_review — newly-enabled value)...");
  const rev = await svc.from("tasks").update({ status: "in_review", updated_at: new Date().toISOString() }).eq("id", createdId);
  if (rev.error) { log("in_review UPDATE db error:", rev.error.message); return; }
  const revEv = await waitForEvent((e) => e.eventType === "UPDATE" && e.id === createdId && e.status === "in_review", EVENT_TIMEOUT_MS, "in_review");
  results.inReview = revEv.ok ? { latencyMs: revEv.ms } : false;
  log(revEv.ok ? `in_review event RECEIVED (${revEv.ms}ms)\n` : "in_review event NOT received within timeout\n");
}

main()
  .catch((e) => log("UNCAUGHT:", e?.message || e))
  .finally(async () => {
    await cleanup();
    const pass = results.subscribed && results.insert && results.update && results.inReview;
    console.log("\n================ GATE B RESULT ================");
    console.log("subscribed:", results.subscribed);
    console.log("INSERT    :", results.insert ? `RECEIVED (${results.insert.latencyMs}ms)` : "NOT RECEIVED");
    console.log("UPDATE    :", results.update ? `RECEIVED (${results.update.latencyMs}ms)` : "NOT RECEIVED");
    console.log("in_review :", results.inReview ? `RECEIVED (${results.inReview.latencyMs}ms)` : "NOT RECEIVED");
    console.log("VERDICT   :", pass ? "PASS" : "FAIL");
    console.log("===============================================");
    process.exit(pass ? 0 : 1);
  });
