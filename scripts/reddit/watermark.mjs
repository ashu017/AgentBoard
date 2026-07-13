// Tracks which subreddit the next 5-min tick should handle. State is a small
// JSON file: { week: "<ISO-year-week>", index: <next seed index> }. The pass is
// scoped to an ISO week — a new week resets to index 0; when index reaches the
// seed count the week's pass is done and nextSub returns null (idle). isoWeek is
// injected so tests are deterministic. Read + file I/O only; no network.
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_FILE = "drafts/reddit/.watermark.json";

function read(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { return null; }
}

function write(file, state) {
  writeFileSync(file, JSON.stringify(state));
}

/** Compute the current ISO week string, e.g. "2026-W27". */
export function isoWeek(date = new Date()) {
  // Copy to UTC midnight Thursday of this week (ISO-8601 week rule).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The sub this tick should handle, plus its index — or null if the current
 * week's pass is already complete. Initializes / weekly-resets the file as a
 * side effect so the caller always sees a consistent state.
 */
export function nextSub({ file = DEFAULT_FILE, subs, week = isoWeek() } = {}) {
  let state = read(file);
  if (!state || state.week !== week) {
    state = { week, index: 0 };
    write(file, state);
  }
  if (state.index >= subs.length) return null; // pass done — idle until next week
  return { sub: subs[state.index], index: state.index };
}

/** Bump the index after a successful draft+send for the current sub. */
export function advance({ file = DEFAULT_FILE, week = isoWeek() } = {}) {
  const state = read(file) || { week, index: 0 };
  write(file, { week: state.week, index: (state.index || 0) + 1 });
}
