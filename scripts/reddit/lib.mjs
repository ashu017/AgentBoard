// Read-only helpers for pulling a subreddit's top posts. Pure functions +
// an injectable fetch so the logic is unit-testable without hitting Reddit.
// NO posting, NO OAuth app — research reads only (public JSON by default).

const DEFAULT_USER_AGENT = "agentboard-research/0.1";

/** Descriptive User-Agent (Reddit rejects generic/blank UAs). */
export function userAgent(env = process.env) {
  return env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
}

/** Normalize a subreddit name: strip an optional leading "r/". */
function cleanSub(subreddit) {
  const sub = String(subreddit || "").trim().replace(/^\/?r\//i, "");
  if (!sub) throw new Error("subreddit is required (e.g. 'SideProject')");
  return sub;
}

/**
 * Build the top-of-month listing URL. With a bearer token, use the authed
 * oauth host (higher rate limits); otherwise the public www .json endpoint.
 */
export function buildTopUrl(subreddit, { token } = {}) {
  const sub = cleanSub(subreddit);
  const qs = "t=month&limit=100&raw_json=1";
  return token
    ? `https://oauth.reddit.com/r/${sub}/top?${qs}`
    : `https://www.reddit.com/r/${sub}/top.json?${qs}`;
}
