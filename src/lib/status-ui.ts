import type { TaskStatus } from "@/lib/task-status";

// Presentation metadata for statuses (color = signal only, DECISIONS 4A). The
// status SET still comes from task-status.ts (SSOT); this only adds display.

export const STATUS_UI: Record<TaskStatus, { label: string; varName: string; loud?: boolean }> = {
  todo: { label: "Todo", varName: "--st-todo" },
  in_progress: { label: "In Progress", varName: "--st-progress" },
  in_review: { label: "In Review", varName: "--st-review" },
  done: { label: "Done", varName: "--st-done" },
  failed: { label: "Failed", varName: "--st-failed", loud: true },
};

export function statusColor(status: TaskStatus): string {
  return `var(${STATUS_UI[status].varName})`;
}
