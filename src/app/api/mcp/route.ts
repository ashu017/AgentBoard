import { NextRequest, NextResponse } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";

// ───────────────────────────────────────────────────────────────────────────
// AgentBoard S0 spike — MCP server via Vercel's mcp-handler (DECISIONS 1A,
// refined: the bare SDK transport expects Node req/res and does NOT fit a
// Next.js Fetch route handler — mcp-handler bridges that and runs stateless
// on serverless).
//
//   MCP client ──POST /api/mcp──▶ mcp-handler ──▶ tool: update_task
//                                                   │ service-role write
//                                                   ▼
//                                               Supabase tasks row
//                                                   │ WAL / Realtime
//                                                   ▼  board page (subscribed)
//
// Proves S0 gate (a) MCP handshake on serverless AND, with the board page,
// gate (b) an agent write reaches the board under RLS.
// ───────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs"; // service-role + node deps, not edge

const mcpHandler = createMcpHandler((server) => {
  server.tool(
    "update_task",
    "S0 spike: create a task with a status/result; it should appear live on the board.",
    {
      title: z.string().min(1).describe("Task title (creates a new task)"),
      status: z.enum(["todo", "in_progress", "in_review", "done", "failed"]).default("in_progress"),
      result: z.string().max(4000).optional(),
    },
    async ({ title, status, result }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("tasks")
        .insert({ title, status, result, updated_at: new Date().toISOString() })
        .select("id,title,status")
        .single();
      if (error) {
        return { isError: true, content: [{ type: "text", text: `DB error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: `ok: ${JSON.stringify(data)}` }] };
    }
  );
});

// Bearer auth — S0 uses one shared spike token (v1 → per-agent hashed key, D12).
function authed(req: NextRequest): boolean {
  const expected = process.env.AGENT_SPIKE_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return mcpHandler(req);
}

// MCP Streamable-HTTP clients may issue GET (stream) / DELETE (session end);
// mcp-handler handles them. Auth-gate them the same way.
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return mcpHandler(req);
}

export async function DELETE(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return mcpHandler(req);
}
