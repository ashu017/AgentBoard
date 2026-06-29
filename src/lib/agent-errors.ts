// ─────────────────────────────────────────────────────────────────────────────
// Agent-plane error contract (design.md "Error contract"; CLAUDE.md "Errors").
//   400 bad input · 401 bad/revoked key · 404 not-your-task (NEVER 403) ·
//   409 illegal transition · 413 oversize result
// One typed error so the MCP layer maps causes → codes consistently, and so the
// agent plane never reveals another agent's task (404, not 403).
// ─────────────────────────────────────────────────────────────────────────────

export type AgentErrorCode = 400 | 401 | 404 | 409 | 413;

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

export const badInput = (m = "Invalid input") => new AgentError(400, m);
export const unauthorized = (m = "Invalid or revoked API key") => new AgentError(401, m);
/** Not-your-task / absent — deliberately 404, never 403 (don't reveal existence). */
export const notFound = (m = "Task not found") => new AgentError(404, m);
export const illegalTransition = (m = "Illegal status transition") => new AgentError(409, m);
export const tooLarge = (m = "Result exceeds size limit") => new AgentError(413, m);
