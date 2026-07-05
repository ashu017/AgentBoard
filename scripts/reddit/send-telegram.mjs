// Send a single message to a Telegram chat via the Bot API. One message per
// call (the weekly job calls this once per subreddit, sequentially). Injectable
// fetch for tests. Read-only w.r.t. Reddit — this only writes to Telegram.
import { readFileSync } from "node:fs";

export function buildSendUrl(token) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

export async function sendMessage({ token, chatId, text }, { fetchImpl = fetch } = {}) {
  if (!chatId) throw new Error("chat_id is required (set TELEGRAM_CHAT_ID)");
  if (!text) throw new Error("text is required (nothing to send)");
  const res = await fetchImpl(buildSendUrl(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// --- CLI: node send-telegram.mjs "message text" ---
// Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from env or .env.local.
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (env[key] === undefined) env[key] = line.slice(i + 1).trim();
    }
  } catch { /* .env.local optional */ }
  return env;
}

// Run as CLI only when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("send-telegram.mjs")) {
  const text = process.argv[2];
  const env = loadEnv();
  sendMessage({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, text })
    .then(() => console.error("✓ sent to Telegram"))
    .catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
