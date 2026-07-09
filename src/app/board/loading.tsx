// Route-level loading skeleton for /board — shown while the page server-fetches.
//
// Constraint: this file is Next's route loading UI, and Next does NOT pass
// searchParams to loading.tsx, so it CANNOT branch on `?idea=` to tell the
// all-ideas overview load apart from a focused-board load. It renders for both.
// We therefore render one board-SHAPED skeleton (header strip + 4 status
// columns of placeholder cards), because the case the user actually feels as
// "nothing's happening" is switching INTO an idea's board — and a column
// skeleton still reads acceptably as a generic "loading" on the overview.
//
// Uses the `.skeleton` utility (globals.css), which respects
// prefers-reduced-motion (static under reduced motion). Server component only.

// Bottom-rule color, matching the real Header/columns (board-ui's RULE). Inlined
// rather than imported so this route-loading UI stays a pure server component
// and doesn't pull in the "use client" board-ui module.
const RULE = "rgba(200,80,0,0.14)";

const COLUMNS: { label: string; accent: string; cards: number[] }[] = [
  { label: "Todo", accent: "var(--st-todo)", cards: [64, 48, 56] },
  { label: "Running", accent: "var(--st-progress)", cards: [56, 72] },
  { label: "Needs Review", accent: "var(--st-review)", cards: [80, 52] },
  { label: "Done", accent: "var(--st-done)", cards: [48, 60, 44] },
];

export default function BoardLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading board…</span>
      <header className="flex items-center gap-4 border-b bg-paper-2 px-4 py-3" style={{ borderColor: RULE }}>
        <div className="skeleton clip-corner h-5 w-32" />
        <div className="skeleton clip-corner hidden h-4 w-24 sm:block" />
        <div className="skeleton clip-corner h-6 w-28" />
        <div className="ml-auto flex items-center gap-3">
          <div className="skeleton clip-corner h-7 w-20" />
          <div className="skeleton clip-corner h-7 w-16" />
        </div>
      </header>
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {/* Same max-width as ProjectView's centered content so the skeleton→real
            swap doesn't jump (kept in sync with the board-layout centering). */}
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="skeleton h-2.5 w-2.5 rounded-full" />
              <div className="skeleton clip-corner h-6 w-52" />
              <div className="skeleton clip-corner h-4 w-16" />
            </div>
            <div className="flex shrink-0 items-center gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="skeleton clip-corner h-5 w-6" />
                  <div className="skeleton clip-corner h-2 w-10" />
                </div>
              ))}
            </div>
          </div>
          <div className="skeleton mt-3 h-1.5 max-w-md" />
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map(({ label, accent, cards }) => (
              <div key={label} className="clip-corner border border-line bg-paper">
                <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: `1px solid ${RULE}` }}>
                  <span className="inline-block h-[13px] w-[13px] rounded-full" style={{ background: accent, opacity: 0.5 }} />
                  <div className="skeleton clip-corner h-2.5 w-20" />
                  <div className="skeleton clip-corner ml-auto h-2.5 w-3" />
                </div>
                <div className="space-y-2 p-2">
                  {cards.map((h, i) => (
                    <div key={i} className="clip-corner border border-line bg-paper p-2.5" style={{ minHeight: h }}>
                      <div className="flex items-start gap-2">
                        <span className="skeleton mt-1 h-2 w-2 shrink-0 rounded-full" />
                        <div className="skeleton clip-corner h-3.5 w-4/5" />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="skeleton clip-corner h-2 w-16" />
                        <div className="skeleton clip-corner ml-auto h-2 w-10" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
