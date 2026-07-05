import { describe, it, expect } from "vitest";
import { SEEDS, seedNames } from "../../scripts/reddit/seeds.mjs";

describe("SEEDS", () => {
  it("is a non-empty array of well-formed entries", () => {
    expect(Array.isArray(SEEDS)).toBe(true);
    expect(SEEDS.length).toBeGreaterThan(0);
    for (const s of SEEDS) {
      expect(typeof s.sub).toBe("string");
      expect(s.sub.length).toBeGreaterThan(0);
      expect(s.kind === "text" || s.kind === "link").toBe(true);
      expect(typeof s.promo).toBe("string"); // the self-promo rule note
    }
  });

  it("has no duplicate subs", () => {
    const names = SEEDS.map((s) => s.sub.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("seedNames returns the plain sub names", () => {
    expect(seedNames()).toEqual(SEEDS.map((s) => s.sub));
  });
});
