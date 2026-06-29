import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  isWellFormedKey,
  prefixOf,
  hashesEqual,
} from "./api-key";

// design.md "Must-have tests" → API key: SHA-256 hashing + prefix; lookup by
// hash matches; key shown once (entropy/format guarantees).

describe("api-key: generateApiKey", () => {
  it("produces the ab_<prefix>_<secret> format", () => {
    const { token } = generateApiKey();
    expect(isWellFormedKey(token)).toBe(true);
    expect(token.startsWith("ab_")).toBe(true);
  });

  it("hash is the SHA-256 of the full token (lookup-by-hash matches)", () => {
    const { token, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("prefix field matches the prefix embedded in the token", () => {
    const { token, prefix } = generateApiKey();
    expect(prefixOf(token)).toBe(prefix);
  });

  it("secret carries 256 bits (64 hex chars)", () => {
    const { token, prefix } = generateApiKey();
    const secret = token.slice(`ab_${prefix}_`.length);
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is unique across many generations (no collisions)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateApiKey().token);
    expect(set.size).toBe(1000);
  });
});

describe("api-key: isWellFormedKey", () => {
  it("rejects malformed tokens", () => {
    for (const bad of ["", "ab_", "ab__x", "xx_prefix_dead", "ab_prefix_", "nope", "ab_PREFIX_NOTHEX!"]) {
      expect(isWellFormedKey(bad)).toBe(false);
    }
  });
});

describe("api-key: hashApiKey", () => {
  it("is deterministic and differs per token", () => {
    expect(hashApiKey("ab_aaaa_dead")).toBe(hashApiKey("ab_aaaa_dead"));
    expect(hashApiKey("ab_aaaa_dead")).not.toBe(hashApiKey("ab_aaaa_beef"));
  });
});

describe("api-key: hashesEqual", () => {
  it("true for equal, false for differing/length-mismatch", () => {
    const h = hashApiKey("ab_aaaa_dead");
    expect(hashesEqual(h, h)).toBe(true);
    expect(hashesEqual(h, hashApiKey("ab_aaaa_beef"))).toBe(false);
    expect(hashesEqual(h, "short")).toBe(false);
  });
});
