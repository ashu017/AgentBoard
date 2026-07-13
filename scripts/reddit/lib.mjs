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

/** Full https permalink from Reddit's site-relative permalink. */
function absolutePermalink(permalink) {
  const p = String(permalink || "");
  return p.startsWith("http") ? p : `https://www.reddit.com${p}`;
}

/** Map one listing child (t3 post) to the normalized shape we draft from. */
export function normalizePost(child) {
  const d = (child && child.data) || {};
  return {
    title: d.title,
    score: Number(d.score) || 0,
    num_comments: Number(d.num_comments) || 0,
    flair: d.link_flair_text ?? null,
    is_self: Boolean(d.is_self),
    url: d.url,
    permalink: absolutePermalink(d.permalink),
  };
}

/** Extract + normalize every post from a Reddit listing payload. */
export function normalizeListing(listing) {
  const children = listing && listing.data && listing.data.children;
  if (!Array.isArray(children)) {
    const msg = listing && listing.message ? `: ${listing.message}` : "";
    throw new Error(`Response is not a Reddit listing${msg}`);
  }
  return children.map(normalizePost);
}

/**
 * Fetch a subreddit's top-100 of the month and return normalized posts.
 * fetchImpl is injectable for tests; defaults to global fetch. env is
 * injectable too so tests don't touch process.env.
 */
export async function fetchTop(subreddit, { fetchImpl = fetch, env = process.env } = {}) {
  const token = env.REDDIT_BEARER_TOKEN || undefined;
  const url = buildTopUrl(subreddit, { token });
  const headers = { "User-Agent": userAgent(env) };
  if (token) headers["Authorization"] = `bearer ${token}`;

  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    const hint = res.status === 429 ? " (rate limit — back off and retry later)" : "";
    throw new Error(`Reddit request failed: ${res.status}${hint} for ${url}\n${body.slice(0, 300)}`);
  }
  return normalizeListing(await res.json());
}
