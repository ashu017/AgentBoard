import { describe, it, expect } from "vitest";
import {
  STATUSES,
  type TaskStatus,
  isStatus,
  isTerminal,
  canTransition,
  agentCanTransition,
  allowedTransitions,
  prBlocksAgentDone,
  INITIAL_STATUS,
} from "./task-status";

// The full transition matrix, asserted exhaustively (design.md "Must-have tests"
// → lib/task-status.ts: every legal move passes, every illegal move rejected).
// Keeping this exhaustive means a change to the transition map MUST be a
// deliberate edit here too — the single-source-of-truth guard.

// Expected legal moves, as [from, to] pairs. Everything NOT in this list must
// be rejected by canTransition (including identity from===to).
const LEGAL: ReadonlyArray<[TaskStatus, TaskStatus]> = [
  ["todo", "in_progress"],
  ["todo", "failed"],
  ["in_progress", "in_review"],
  ["in_progress", "done"],
  ["in_progress", "failed"],
  ["in_progress", "todo"],
  // in_review can be resolved (board-ux interim; approval loop AL4b will formalize).
  ["in_review", "done"],
  ["in_review", "in_progress"],
  ["in_review", "failed"],
  // done / failed are terminal.
];

const legalSet = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));

describe("task-status: STATUSES", () => {
  it("is exactly the 5 v1 statuses in column order (D-STATUS)", () => {
    expect(STATUSES).toEqual(["todo", "in_progress", "in_review", "done", "failed"]);
  });

  it("INITIAL_STATUS is todo", () => {
    expect(INITIAL_STATUS).toBe("todo");
  });
});

describe("task-status: isStatus", () => {
  it("accepts every known status", () => {
    for (const s of STATUSES) expect(isStatus(s)).toBe(true);
  });

  it("rejects unknown / wrong-type values", () => {
    for (const v of ["", "blocked", "backlog", "DONE", "in-progress", 1, null, undefined, {}]) {
      expect(isStatus(v)).toBe(false);
    }
  });
});

describe("task-status: isTerminal", () => {
  it("done and failed are terminal; the rest are not", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("todo")).toBe(false);
    expect(isTerminal("in_progress")).toBe(false);
    expect(isTerminal("in_review")).toBe(false);
  });
});

describe("task-status: canTransition — exhaustive matrix", () => {
  // Every ordered pair over STATUSES×STATUSES must match the LEGAL list exactly.
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const key = `${from}->${to}`;
      const shouldBeLegal = legalSet.has(key);
      it(`${key} is ${shouldBeLegal ? "legal" : "illegal"}`, () => {
        expect(canTransition(from, to)).toBe(shouldBeLegal);
      });
    }
  }

  it("identity transitions (from === to) are never legal", () => {
    for (const s of STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("no transition may leave a terminal status", () => {
    for (const term of STATUSES.filter(isTerminal)) {
      for (const to of STATUSES) expect(canTransition(term, to)).toBe(false);
    }
  });

  it("in_review resolves to done / in_progress / failed (board-ux interim), not to itself or todo", () => {
    expect(canTransition("in_review", "done")).toBe(true);
    expect(canTransition("in_review", "in_progress")).toBe(true);
    expect(canTransition("in_review", "failed")).toBe(true);
    expect(canTransition("in_review", "in_review")).toBe(false);
    expect(canTransition("in_review", "todo")).toBe(false);
  });
});

describe("task-status: agentCanTransition (approval loop AL4b)", () => {
  it("in_review can go to in_progress, done, failed (human-plane canTransition)", () => {
    expect(canTransition("in_review", "in_progress")).toBe(true);
    expect(canTransition("in_review", "done")).toBe(true);
    expect(canTransition("in_review", "failed")).toBe(true);
  });

  it("agent plane CANNOT drive any move out of in_review (human-only, AL4b)", () => {
    expect(agentCanTransition("in_review", "done")).toBe(false);
    expect(agentCanTransition("in_review", "in_progress")).toBe(false);
    expect(agentCanTransition("in_review", "failed")).toBe(false);
  });

  it("agent plane keeps every non-in_review move that canTransition allows", () => {
    for (const from of STATUSES) {
      if (from === "in_review") continue;
      for (const to of STATUSES) {
        expect(agentCanTransition(from, to)).toBe(canTransition(from, to));
      }
    }
  });
});

describe("task-status: prBlocksAgentDone (PR-raised task can't be self-marked done)", () => {
  it("blocks a move to done when the task has a PR", () => {
    expect(prBlocksAgentDone("done", true)).toBe(true);
  });

  it("allows a move to done when there is no PR", () => {
    expect(prBlocksAgentDone("done", false)).toBe(false);
  });

  it("never blocks failed — a PR-raised task can still fail", () => {
    expect(prBlocksAgentDone("failed", true)).toBe(false);
    expect(prBlocksAgentDone("failed", false)).toBe(false);
  });

  it("never blocks non-done moves regardless of PR", () => {
    for (const to of STATUSES) {
      if (to === "done") continue;
      expect(prBlocksAgentDone(to, true)).toBe(false);
      expect(prBlocksAgentDone(to, false)).toBe(false);
    }
  });
});

describe("task-status: allowedTransitions", () => {
  it("matches the legal matrix per from-status", () => {
    for (const from of STATUSES) {
      const expected = LEGAL.filter(([f]) => f === from).map(([, t]) => t);
      expect(new Set(allowedTransitions(from))).toEqual(new Set(expected));
    }
  });
});
