import { describe, it, expect } from "vitest";
import { userAgent, buildTopUrl, normalizePost, normalizeListing, fetchTop } from "../../scripts/reddit/lib.mjs";

describe("userAgent", () => {
  it("uses REDDIT_USER_AGENT when set", () => {
    expect(userAgent({ REDDIT_USER_AGENT: "myapp/1.0 by u/me" })).toBe("myapp/1.0 by u/me");
  });

  it("falls back to a descriptive default when unset", () => {
    expect(userAgent({})).toBe("agentboard-research/0.1");
  });
});

describe("buildTopUrl", () => {
  it("uses public www host with .json when no token", () => {
    expect(buildTopUrl("SideProject", { token: undefined })).toBe(
      "https://www.reddit.com/r/SideProject/top.json?t=month&limit=100&raw_json=1"
    );
  });

  it("uses oauth host when a token is provided", () => {
    expect(buildTopUrl("SideProject", { token: "abc" })).toBe(
      "https://oauth.reddit.com/r/SideProject/top?t=month&limit=100&raw_json=1"
    );
  });

  it("strips a leading r/ prefix from the subreddit", () => {
    expect(buildTopUrl("r/SaaS", { token: undefined })).toBe(
      "https://www.reddit.com/r/SaaS/top.json?t=month&limit=100&raw_json=1"
    );
  });

  it("throws on an empty subreddit", () => {
    expect(() => buildTopUrl("", { token: undefined })).toThrow(/subreddit/i);
  });
});

describe("normalizePost", () => {
  it("maps a t3 child's data to the normalized shape", () => {
    const child = {
      kind: "t3",
      data: {
        title: "I built a thing",
        score: 412,
        num_comments: 37,
        link_flair_text: "Show & Tell",
        is_self: true,
        url: "https://redd.it/abc",
        permalink: "/r/SideProject/comments/abc/i_built_a_thing/",
      },
    };
    expect(normalizePost(child)).toEqual({
      title: "I built a thing",
      score: 412,
      num_comments: 37,
      flair: "Show & Tell",
      is_self: true,
      url: "https://redd.it/abc",
      permalink: "https://www.reddit.com/r/SideProject/comments/abc/i_built_a_thing/",
    });
  });

  it("defaults missing flair to null and coerces missing counts to 0", () => {
    const out = normalizePost({ data: { title: "t", is_self: false, url: "u", permalink: "/p" } });
    expect(out.flair).toBeNull();
    expect(out.score).toBe(0);
    expect(out.num_comments).toBe(0);
  });
});

describe("normalizeListing", () => {
  it("extracts and normalizes every child from a listing", () => {
    const listing = {
      kind: "Listing",
      data: {
        children: [
          { data: { title: "a", score: 1, num_comments: 0, is_self: true, url: "u1", permalink: "/a" } },
          { data: { title: "b", score: 2, num_comments: 3, is_self: false, url: "u2", permalink: "/b" } },
        ],
      },
    };
    const out = normalizeListing(listing);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("a");
    expect(out[1].score).toBe(2);
  });

  it("throws a clear error when the payload isn't a listing", () => {
    expect(() => normalizeListing({ error: 404, message: "Not Found" })).toThrow(/listing/i);
  });
});

describe("fetchTop", () => {
  const okListing = {
    kind: "Listing",
    data: { children: [{ data: { title: "hello", score: 5, num_comments: 1, is_self: true, url: "u", permalink: "/x" } }] },
  };

  it("fetches, sends the User-Agent, and returns normalized posts", async () => {
    let seenUrl, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url;
      seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => okListing };
    };
    const posts = await fetchTop("SideProject", { fetchImpl, env: { REDDIT_USER_AGENT: "ua/1 by u/me" } });
    expect(seenUrl).toContain("https://www.reddit.com/r/SideProject/top.json");
    expect(seenHeaders["User-Agent"]).toBe("ua/1 by u/me");
    expect(posts).toEqual([
      { title: "hello", score: 5, num_comments: 1, flair: null, is_self: true, url: "u", permalink: "https://www.reddit.com/x" },
    ]);
  });

  it("sends the Authorization header and uses the oauth host when a token is set", async () => {
    let seenUrl, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url; seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => okListing };
    };
    await fetchTop("SaaS", { fetchImpl, env: { REDDIT_BEARER_TOKEN: "tok123" } });
    expect(seenUrl).toContain("https://oauth.reddit.com/r/SaaS/top");
    expect(seenHeaders["Authorization"]).toBe("bearer tok123");
  });

  it("throws a clear error on a 429 rate limit", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "slow down" });
    await expect(fetchTop("SaaS", { fetchImpl, env: {} })).rejects.toThrow(/429|rate limit/i);
  });

  it("throws a clear error on a non-200 (e.g. private/banned sub)", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "Forbidden" });
    await expect(fetchTop("some_private_sub", { fetchImpl, env: {} })).rejects.toThrow(/403/);
  });
});
