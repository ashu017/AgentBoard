// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for task status (CLAUDE.md "Key conventions"; design.md
// "Single source of truth (DRY)"; DECISIONS D-STATUS).
//
// The status enum + the legal-transition map live HERE and nowhere else. The DB
// CHECK constraint, the MCP validators, the agent-db layer, the board UI columns,
// and the tests all import from this module. Never redefine statuses or
// transitions per-layer — adding/changing a status must be a one-place edit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All task statuses, in board-column display order.
 *
 * `in_review` (added 2026-06-29, DECISIONS D-STATUS) is the approval-gate
 * status: an agent parks a task awaiting a human decision and it shows on the
 * board. The human Approve/Reject resolution loop (`in_review →
 * {in_progress|done|failed}`) is **Level B — the approval loop** and is now
 * wired below. The agent that raised the review can NOT drive it back out of
 * `in_review` — only the human (manager `resolveReview`) can. That agent-side
 * restriction lives in `agentCanTransition` (approval loop AL4b), not in the
 * transition map, so the human plane keeps the full set of moves.
 */
export const STATUSES = ["todo", "in_progress", "in_review", "done", "failed"] as const;

export type TaskStatus = (typeof STATUSES)[number];

/** Terminal statuses — no transition may leave these (exit attempt → 409). */
const TERMINAL: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["done", "failed"]);

/**
 * Legal transitions, keyed by the *from* status. The value is the set of
 * statuses the task may move to.
 *
 * - `todo → in_progress` (agent starts), `todo → failed` (reject before start)
 * - `in_progress → in_review` (park for human approval — Level A)
 * - `in_progress → done | failed` (finish), `in_progress → todo` (decline/reset)
 * - `in_review → …` is **empty** until Level B (see STATUSES note above)
 * - `done` / `failed` are terminal (empty)
 */
const TRANSITIONS: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> = {
  todo: new Set<TaskStatus>(["in_progress", "failed"]),
  in_progress: new Set<TaskStatus>(["in_review", "done", "failed", "todo"]),
  // Approval loop (AL-B): a reviewed task is resolved by the HUMAN to done
  // (approve & close / merged), back to in_progress (approve & continue), or
  // failed (reject). These are the human-plane moves; the agent that raised the
  // review is blocked from any of them by agentCanTransition (AL4b). Originally
  // opened for the board-ux interim (D-INREVIEW-INTERIM), now formalized here.
  in_review: new Set<TaskStatus>(["done", "in_progress", "failed"]),
  done: new Set<TaskStatus>([]),
  failed: new Set<TaskStatus>([]),
};

/** Type guard: is `value` one of the known statuses? (For validating input.) */
export function isStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** Terminal = no legal outgoing transition by policy (done/failed). */
export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL.has(status);
}

/** Whether `from → to` is a legal transition. Identity (from === to) is NOT a move. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/**
 * Whether the AGENT plane may drive `from → to`. Stricter than canTransition:
 * an agent can never resolve a review itself (any move OUT of in_review is
 * human-only — approval loop AL4b) — only the manager `resolveReview` does that.
 * All other legal transitions are allowed. The `in_review → {in_progress|done|
 * failed}` moves are legal for the HUMAN plane (see TRANSITIONS above); this gate
 * is what keeps the agent from self-closing a review it raised.
 */
export function agentCanTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === "in_review") return false;
  return canTransition(from, to);
}

/** The set of statuses a task may legally move to from `from` (for UI/affordances). */
export function allowedTransitions(from: TaskStatus): TaskStatus[] {
  return [...TRANSITIONS[from]];
}

/**
 * PR review gate (D-PR-DONE): an agent may NOT self-mark a task `done` while it
 * carries a pull-request URL — the PR must be human-reviewed and merged first, so
 * the task stays reviewable (in_review) for the manager to close. Returns true when
 * a move to `done` must be REJECTED because a PR is raised. Only `done` is gated;
 * `failed` and every non-done move are unaffected, as are tasks with no PR. This is
 * the agent-plane predicate; the human plane (manager close after merge) is unaffected.
 */
export function prBlocksAgentDone(to: TaskStatus, hasPrUrl: boolean): boolean {
  return to === "done" && hasPrUrl;
}

/** The status a manager-created task starts in (always assigned + `todo`). */
export const INITIAL_STATUS: TaskStatus = "todo";
