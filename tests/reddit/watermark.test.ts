import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextSub, advance } from "../../scripts/reddit/watermark.mjs";

const SUBS = ["a", "b", "c"];
let dir, file;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "wm-")); file = join(dir, ".watermark.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("nextSub", () => {
  it("returns the first sub and initializes the file when none exists", () => {
    const r = nextSub({ file, subs: SUBS, week: "2026-W27" });
    expect(r).toEqual({ sub: "a", index: 0 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W27", index: 0 });
  });

  it("returns the sub at the current index mid-week", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 1 }));
    expect(nextSub({ file, subs: SUBS, week: "2026-W27" })).toEqual({ sub: "b", index: 1 });
  });

  it("returns null when the week's pass is complete (idle)", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 3 }));
    expect(nextSub({ file, subs: SUBS, week: "2026-W27" })).toBeNull();
  });

  it("resets to the first sub when a new ISO week starts", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 3 }));
    const r = nextSub({ file, subs: SUBS, week: "2026-W28" });
    expect(r).toEqual({ sub: "a", index: 0 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W28", index: 0 });
  });
});

describe("advance", () => {
  it("increments the stored index for the given week", () => {
    writeFileSync(file, JSON.stringify({ week: "2026-W27", index: 1 }));
    advance({ file, week: "2026-W27" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ week: "2026-W27", index: 2 });
  });
});
