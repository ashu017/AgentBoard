#!/usr/bin/env node
// CLI: pull a subreddit's top-100 of the month as normalized JSON on stdout.
// Read-only research. Public JSON by default; optional REDDIT_BEARER_TOKEN in
// .env.local switches to the authed host for higher rate limits.
//
// Usage:  node scripts/reddit/fetch-top.mjs <subreddit>
// Example: node scripts/reddit/fetch-top.mjs SideProject > /tmp/sideproject.json
import { readFileSync } from "node:fs";
import { fetchTop } from "./lib.mjs";

// Merge .env.local (if present) over process.env — same pattern as other scripts.
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
  } catch {
    // .env.local is optional for this read-only tool; ignore if missing.
  }
  return env;
}

async function main() {
  const sub = process.argv[2];
  if (!sub) {
    console.error("Usage: node scripts/reddit/fetch-top.mjs <subreddit>");
    process.exit(2);
  }
  const env = loadEnv();
  const posts = await fetchTop(sub, { env });
  process.stdout.write(JSON.stringify(posts, null, 2) + "\n");
  console.error(`✓ ${posts.length} posts from r/${sub.replace(/^\/?r\//i, "")}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
