import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import {
  resolveAgentByKey,
  touchLastSeen,
  listMyTasks,
  updateTaskStatus,
  submitResult,
  createSubtask,
  type AgentContext,
} from "@/lib/agent-db";
import { AgentError } from "@/lib/agent-errors";
import { STATUSES } from "@/lib/task-status";

// ───────────────────────────────────────────────────────────────────────────
// AgentBoard v1 MCP server — the agent plane (design.md "MCP server"; DECISIONS
// 1A/D12/3A). Three tools, authenticated per-call by a per-agent bearer key:
//
//   list_my_tasks(status?, parent_task_id?)  — the agent's own tasks / subtree
//   update_task_status(task_id, status, note?)
//   submit_result(task_id, output, status?)
//   create_subtask(parent_task_id, title, description?)  — decompose a task
//
// Auth: withMcpAuth verifies the bearer, resolves (agentId, workspaceId) via the
// confined service-role module, and carries it in authInfo.extra. Every tool
// reads that context — no tool can act outside the resolved agent's scope.
// Errors map to the contract (400/401/404/409/413) via AgentError.
// ───────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs"; // service-role + node deps, not edge

const STATUS_ENUM = z.enum(STATUSES);

// MCP `instructions` — sent on initialize and surfaced to the model by
// well-behaved clients. This is how usage GUIDANCE ships with the connection:
// discovering the tools is automatic, but using them at the right moments is
// not, so we state the expected workflow here rather than relying on each agent
// owner to prompt it. (See DECISIONS — behavioral consumability risk.)
const SERVER_INSTRUCTIONS = `You are connected to AgentBoard, a task board your human manager uses to assign you work and watch it live.

Keep your assigned tasks up to date as you work — your manager is watching the board:
- Call list_my_tasks to see what's assigned to you (optionally filter by status, or by parent_task_id to see a project's subtasks).
- When you START a task, move it to in_progress (update_task_status).
- If a task is a broad project, break it down with create_subtask, then work each subtask (you may run your own internal subagents to do them in parallel — AgentBoard only needs the task updates).
- When you FINISH, call submit_result with your output, and set status to done (or failed if it didn't work).
- If you need a human to review before continuing, set status to in_review.
Update promptly and honestly — a stale or wrong status misleads the person relying on this board.`;

/** Pull the resolved AgentContext out of the MCP auth info. */
function ctxFrom(extra: { authInfo?: AuthInfo }): AgentContext {
  const ctx = extra.authInfo?.extra as AgentContext | undefined;
  if (!ctx) throw new AgentError(401, "Unauthenticated");
  return ctx;
}

/** Map an AgentError (or unexpected error) to an MCP tool error result. */
function toolError(err: unknown) {
  const code = err instanceof AgentError ? err.code : 500;
  const message = err instanceof Error ? err.message : "Internal error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: `error ${code}: ${message}` }],
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const baseHandler = createMcpHandler(
  (server) => {
    server.tool(
      "list_my_tasks",
      "List the tasks assigned to the calling agent. Optionally filter by status, and/or by parent_task_id to read a project's subtasks.",
      {
        status: STATUS_ENUM.optional().describe("Filter to this status if given"),
        parent_task_id: z
          .string()
          .optional()
          .describe("If given, return only the subtasks of this parent task"),
      },
      async ({ status, parent_task_id }, extra) => {
        try {
          const ctx = ctxFrom(extra);
          await touchLastSeen(ctx);
          const tasks = await listMyTasks(ctx, status, parent_task_id);
          return ok({ tasks });
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.tool(
      "create_subtask",
      "Break a task you own into a child task (e.g. decompose a project). The subtask is assigned to you and starts as 'todo'. Max nesting depth is 2.",
      {
        parent_task_id: z.string().min(1).describe("The task to add a subtask under (must be assigned to you, and not itself a subtask)"),
        title: z.string().min(1).describe("Subtask title"),
        description: z.string().max(4000).optional().describe("Optional detail"),
      },
      async ({ parent_task_id, title, description }, extra) => {
        try {
          const ctx = ctxFrom(extra);
          await touchLastSeen(ctx);
          const task = await createSubtask(ctx, parent_task_id, title, description);
          return ok({ task });
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.tool(
      "update_task_status",
      "Move one of your tasks to a new status. Illegal transitions are rejected.",
      {
        task_id: z.string().min(1).describe("The task id (must be assigned to you)"),
        status: STATUS_ENUM.describe("Target status"),
        note: z.string().max(2000).optional().describe("Optional note recorded in history"),
      },
      async ({ task_id, status, note }, extra) => {
        try {
          const ctx = ctxFrom(extra);
          await touchLastSeen(ctx);
          const task = await updateTaskStatus(ctx, task_id, status, note);
          return ok({ task });
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.tool(
      "submit_result",
      "Submit a result for an in-progress task; optionally also move it to a terminal status (done/failed).",
      {
        task_id: z.string().min(1).describe("The task id (must be assigned to you)"),
        output: z.string().describe("The result payload (max 256 KB)"),
        status: STATUS_ENUM.optional().describe("Optional terminal status to set (done/failed)"),
      },
      async ({ task_id, output, status }, extra) => {
        try {
          const ctx = ctxFrom(extra);
          await touchLastSeen(ctx);
          const task = await submitResult(ctx, task_id, output, status);
          return ok({ task });
        } catch (err) {
          return toolError(err);
        }
      }
    );
  },
  // serverOptions — `instructions` is sent on initialize so clients surface the
  // expected workflow to the model (capability is auto-discovered; behavior isn't).
  { instructions: SERVER_INSTRUCTIONS },
  // Route lives at /api/mcp; mcp-handler defaults its match endpoint to /mcp,
  // so basePath:"/api" is required or every request 404s (Gate A finding, 1A).
  { basePath: "/api" }
);

// Per-agent bearer auth. verifyToken resolves the key → AgentContext, carried in
// authInfo.extra. A bad/revoked/unknown key throws 401 in resolveAgentByKey,
// which withMcpAuth surfaces as an unauthenticated response (required: true).
const handler = withMcpAuth(
  baseHandler,
  async (_req, bearerToken): Promise<AuthInfo | undefined> => {
    if (!bearerToken) return undefined;
    try {
      const ctx = await resolveAgentByKey(bearerToken);
      return {
        token: bearerToken,
        clientId: ctx.agentId,
        scopes: [],
        extra: ctx as unknown as Record<string, unknown>,
      };
    } catch {
      // Unknown/revoked key → no auth info → withMcpAuth returns 401.
      return undefined;
    }
  },
  { required: true }
);

export { handler as GET, handler as POST, handler as DELETE };
