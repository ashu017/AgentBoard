"use client";
import { useEffect, useRef } from "react";

// Operator-console modal dialog. Backdrop + cut-corner panel in the 4A aesthetic.
// A11y (design.md Pass 6): role=dialog + aria-modal, focus trap, Esc to close,
// focus returns to the trigger on close, backdrop click closes.
export function Modal({
  open,
  onClose,
  title,
  systemTag,
  children,
  closeOnBackdrop = true,
  hideClose = false,
  blurBackdrop = false,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  systemTag?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  /** Hide the ✕ and ignore Esc — for required dialogs (e.g. sign-in). */
  hideClose?: boolean;
  /**
   * Frost the backdrop (dim + blur) so the modal reads as floating over the
   * page behind it. Opt-in — defaults off so board/agents modals are unchanged.
   */
  blurBackdrop?: boolean;
  /** Panel width. "lg" for content-heavy dialogs (e.g. the key + MCP config). */
  size?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element in the panel.
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!hideClose) onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Focus trap.
      const items = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    // Lock background scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, hideClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-ink/40${blurBackdrop ? " backdrop-blur-sm" : ""}`}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className={`clip-corner relative w-full border border-line bg-paper-2 p-6 shadow-xl ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            {systemTag && (
              <div className="mono text-[11px] uppercase tracking-[0.2em] text-orange">{systemTag}</div>
            )}
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          </div>
          {!hideClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="mono -mr-1 -mt-1 px-2 py-1 text-sm text-ink-soft hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
