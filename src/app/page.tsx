"use client";

import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// AgentBoard S0 spike — minimal Realtime board.
// Proves gate (b): a service-role write from the MCP route must arrive here
// live, under RLS (anon SELECT policy). If the policy is wrong, the write
// commits but nothing appears here — the silent failure D9-RT guards against.

// Live client view, not a static page — don't prerender at build time.
export const dynamic = "force-dynamic";

type Task = { id: string; title: string; status: string; result: string | null };

// Lazy: don't touch env at module load (build has no env → would crash).
function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // New Supabase publishable key (sb_publishable_...), browser-safe — replaces
  // the legacy anon JWT. Needs NEXT_PUBLIC_ so it's available client-side.
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const COLUMNS = ["todo", "in_progress", "in_review", "done", "failed"] as const;

export default function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [live, setLive] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setConfigured(false);
      return;
    }
    const db = supabase; // non-null in this scope; keeps closures type-safe

    async function refetch() {
      const { data } = await db
        .from("tasks")
        .select("id,title,status,result")
        .order("updated_at", { ascending: false });
      setTasks(data ?? []);
    }

    // Subscribe first, then snapshot (D9: subscribe-then-refetch).
    const channel = db
      .channel("tasks-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => void refetch()
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    void refetch();

    return () => void db.removeChannel(channel);
  }, []);

  if (!configured) {
    return (
      <main style={{ fontFamily: "ui-monospace, monospace", padding: 24 }}>
        <h1 style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>
          AgentBoard — S0 spike
        </h1>
        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Supabase env not set. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and fill in the project URL + anon key.
        </p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 24 }}>
      <h1 style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>
        AgentBoard — S0 spike{" "}
        <span style={{ color: live ? "#3fb950" : "#f85149" }}>
          {live ? "● LIVE" : "○ connecting"}
        </span>
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length},1fr)`, gap: 12, marginTop: 16 }}>
        {COLUMNS.map((col) => (
          <section key={col} style={{ border: "1px solid #283040", borderRadius: 8, padding: 10 }}>
            <h2 style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.6 }}>
              {col} ({tasks.filter((t) => t.status === col).length})
            </h2>
            {tasks
              .filter((t) => t.status === col)
              .map((t) => (
                <div key={t.id} style={{ border: "1px solid #283040", borderRadius: 6, padding: 8, marginTop: 8, fontSize: 12 }}>
                  <div>{t.title}</div>
                  {t.result && <div style={{ opacity: 0.6, marginTop: 4 }}>{"→ "}{t.result}</div>}
                </div>
              ))}
          </section>
        ))}
      </div>
      <p style={{ marginTop: 16, fontSize: 11, opacity: 0.4 }}>
        Call the MCP tool `update_task` to write a row — it should appear here live.
      </p>
    </main>
  );
}
