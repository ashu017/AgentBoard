"use client";
// Right-hand activity drawer. HIDDEN by default; opened from the header's
// awaiting-review badge. Reads the most recent task_events for the workspace via
// the browser supabase client (same client the board realtime refetch uses — RLS
// scopes the rows to the caller's workspace). Refetches on `open` and whenever
// `refreshKey` changes (bumped by the board's realtime tasks subscription).
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { STATUS_UI, statusColor } from "@/lib/status-ui";
import type { TaskStatus } from "@/lib/task-status";
import type { BoardTask } from "@/lib/manager-queries";
import { RULE, relative } from "./board-ui";

interface FeedEvent {
  id: string;
  task_id: string;
  event_type: "created" | "status_changed" | "result_submitted";
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  created_at: string;
}

const EVENT_LABEL: Record<FeedEvent["event_type"], string> = {
  created: "created",
  status_changed: "moved",
  result_submitted: "submitted result",
};

export function LiveFeed({
  open,
  onClose,
  tasks,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  tasks: BoardTask[];
  refreshKey: number;
}) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("task_events")
        .select("id, task_id, event_type, from_status, to_status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setEvents((data ?? []) as FeedEvent[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  if (!open) return null;

  const titleFor = (taskId: string) => tasks.find((t) => t.id === taskId)?.title ?? "task";

  return (
    <aside
      aria-label="Activity feed"
      className="flex w-72 shrink-0 flex-col border-l bg-paper-2"
      style={{ borderColor: RULE }}
    >
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">Activity</span>
        <button onClick={onClose} aria-label="Close activity feed" className="text-ink-soft hover:text-orange">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loaded && events.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-ink-soft">No recent activity.</p>
        )}
        {events.map((e) => {
          // Accent each row by the status it moved into (Figma live-feed: color =
          // status signal per event); created/result-submitted events carry no
          // target status, so they use the orange brand-event accent. Review rows
          // resolve to purple automatically via the status SSOT.
          const accent = e.to_status ? statusColor(e.to_status) : "var(--orange)";
          return (
            <div
              key={e.id}
              className="border-l-2 px-3 py-2"
              style={{ borderBottom: `1px solid ${RULE}`, borderLeftColor: accent }}
            >
              <div className="flex items-baseline gap-2">
                <span className="mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>
                  {EVENT_LABEL[e.event_type]}
                </span>
                <span className="mono ml-auto shrink-0 text-[10px] text-ink-soft">{relative(e.created_at)}</span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-ink">{titleFor(e.task_id)}</div>
              {e.event_type === "status_changed" && e.to_status && (
                <div className="mono mt-0.5 text-[10px] text-ink-soft">
                  {e.from_status ? `${STATUS_UI[e.from_status].label} → ` : "→ "}
                  <span style={{ color: accent }}>{STATUS_UI[e.to_status].label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
