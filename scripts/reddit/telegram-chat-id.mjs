#!/usr/bin/env node
// One-off helper: after you create the bot and send it any message, run this to
// print your chat_id. Put it in .env.local as TELEGRAM_CHAT_ID.
//   1. Create a bot with @BotFather, copy its token into .env.local
//   2. Open the bot in Telegram and send it "hi"
//   3. node scripts/reddit/telegram-chat-id.mjs
import { readFileSync } from "node:fs";

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
  } catch { /* optional */ }
  return env;
}

const env = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error("✗ set TELEGRAM_BOT_TOKEN in .env.local first"); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
const chats = new Map();
for (const u of data.result || []) {
  const chat = u.message?.chat || u.channel_post?.chat;
  if (chat) chats.set(chat.id, chat.username || chat.title || chat.first_name || "");
}
if (chats.size === 0) {
  console.error("✗ no updates yet — open the bot in Telegram, send it a message, then re-run.");
  process.exit(1);
}
for (const [id, name] of chats) console.log(`chat_id=${id}  (${name})`);
