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
 * primitive at **Level A — status only**: an agent can park a task awaiting
 * human approval and it shows on the board. It deliberately has **no legal
 * outgoing transition yet** — the human Approve/Reject resolution loop
 * (`in_review → {in_progress|done|failed}`) is **Level B**, the next deliberate
 * feature, and is intentionally not wired here. A task in `in_review` is
 * therefore parked until Level B ships.
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
  in_review: new Set<TaskStatus>([]), // Level B (deferred) wires this.
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

/** The set of statuses a task may legally move to from `from` (for UI/affordances). */
export function allowedTransitions(from: TaskStatus): TaskStatus[] {
  return [...TRANSITIONS[from]];
}

/** The status a manager-created task starts in (always assigned + `todo`). */
export const INITIAL_STATUS: TaskStatus = "todo";
