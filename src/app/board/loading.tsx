// Route-level loading skeleton for /board — shown while the page server-fetches
// (both the all-ideas overview and a focused board). Kept generic: a header strip
// plus a grid of placeholder cards, which reads fine for either view. A dedicated
// board-column skeleton is a separate later task. Uses the `.skeleton` utility
// (globals.css), which respects prefers-reduced-motion.

const RULE = "rgba(200,80,0,0.14)";

export default function BoardLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading board…</span>

      {/* Header strip — mirrors the real Header (bg-paper-2, bottom rule). */}
      <header
        className="flex items-center gap-4 border-b bg-paper-2 px-4 py-3"
        style={{ borderColor: RULE }}
      >
        <div className="skeleton clip-corner h-5 w-32" />
        <div className="skeleton clip-corner hidden h-4 w-24 sm:block" />
        <div className="skeleton clip-corner h-6 w-28" />
        <div className="ml-auto flex items-center gap-3">
          <div className="skeleton clip-corner h-7 w-20" />
          <div className="skeleton clip-corner h-7 w-16" />
        </div>
      </header>

      {/* Body — placeholder card grid (generic; reads as overview or board). */}
      <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="skeleton clip-corner mb-2 h-3 w-24" />
          <div className="skeleton clip-corner mb-8 h-6 w-48" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="clip-corner flex min-h-[9.5rem] flex-col border bg-paper p-4"
                style={{ borderColor: RULE }}
              >
                <div className="skeleton clip-corner h-5 w-3/4" />
                <div className="mt-auto grid grid-cols-4 gap-2 pt-4">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <div key={j}>
                      <div className="skeleton clip-corner h-5 w-6" />
                      <div className="skeleton clip-corner mt-1 h-2 w-full" />
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
