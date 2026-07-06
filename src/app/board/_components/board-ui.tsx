"use client";
// Shared small helpers for the operator-console board redesign: relative-time,
// priority color map, and the inline Edit/Trash glyphs previously defined inside
// BoardClient. Status colors live in @/lib/status-ui (SSOT) — do not duplicate.
import type { BoardTask, AgentRow } from "@/lib/manager-queries";

/** Compact relative time ("3m", "2h", "5d") from an ISO timestamp. */
export function relative(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Priority signal colors (0014 / Figma operator-console). */
export const PRIORITY_COLORS: Record<BoardTask["priority"], string> = {
  high: "#cc0055",
  medium: "#e84500",
  low: "#907860",
};

/** Small pencil (edit) glyph — inline SVG, no icon dependency. */
export function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5.5-2.5 7.5-7.5z" />
    </svg>
  );
}

/** Small trash (delete) glyph — inline SVG, no icon dependency. */
export function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9h7l.5-9M6.5 6.5v4.5M9.5 6.5v4.5" />
    </svg>
  );
}

/** Thin operator rule used to separate sections (warm orange tint). */
export const RULE = "rgba(200,80,0,0.14)";

/**
 * Live-derived agent status (Figma operator-console). An agent working an
 * in_review task = "NEEDS INPUT" (purple); an in_progress task = "RUNNING"
 * (orange); a recent last_seen (< 2 min) also reads as RUNNING; else IDLE.
 */
export type AgentLiveStatus = "needs_input" | "running" | "idle";

const RUNNING_RECENCY_MS = 2 * 60 * 1000;

export function agentLiveStatus(agent: AgentRow, tasks: BoardTask[]): AgentLiveStatus {
  const mine = tasks.filter((t) => t.assigned_agent_id === agent.id);
  if (mine.some((t) => t.status === "in_review")) return "needs_input";
  if (mine.some((t) => t.status === "in_progress")) return "running";
  if (agent.last_seen_at && Date.now() - Date.parse(agent.last_seen_at) < RUNNING_RECENCY_MS) {
    return "running";
  }
  return "idle";
}

export const AGENT_STATUS_UI: Record<AgentLiveStatus, { label: string; color: string }> = {
  needs_input: { label: "!! NEEDS INPUT", color: "#7c3aed" },
  running: { label: "RUNNING", color: "#e84500" },
  idle: { label: "IDLE", color: "#6b6157" },
};
