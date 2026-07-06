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
  variant = "default",
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
  /**
   * "figma" = the operator-console dialog look from the Figma reference: warm
   * tan-blur overlay, near-white panel, orange top border, larger cut corner +
   * decorative corner notches, display-font uppercase title. Used by the board
   * create/edit modals. "default" keeps the original board/agents styling.
   */
  variant?: "default" | "figma";
}) {
  const figma = variant === "figma";
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
      {/* Backdrop — figma uses a warm tan frost; default is the ink dim. */}
      <div
        className={`absolute inset-0 ${figma || blurBackdrop ? "backdrop-blur-sm" : ""} ${figma ? "" : "bg-ink/40"}`}
        style={figma ? { background: "rgba(200,170,140,0.55)" } : undefined}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Panel — capped at 90vh and a flex column: the header stays put while a
          taller body scrolls INSIDE the panel. Without the cap, a modal taller
          than a short viewport gets vertically centered and clipped at both ends
          with no way to reach the hidden content (the "form overflows the modal"
          bug). */}
      <div
        ref={panelRef}
        className={`relative flex max-h-[90vh] w-full flex-col shadow-xl ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        } ${figma ? "" : "clip-corner border border-line bg-paper-2"}`}
        style={
          figma
            ? {
                background: "#faf9f7",
                borderTop: "2px solid #e84500",
                borderLeft: "1px solid rgba(200,80,0,0.2)",
                borderRight: "1px solid rgba(200,80,0,0.2)",
                borderBottom: "1px solid rgba(200,80,0,0.2)",
                clipPath:
                  "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
              }
            : undefined
        }
      >
        {/* Figma decorative corner notches (top-right + bottom-left) matching the
            tan overlay so the cut corners read as "punched out" of the backdrop. */}
        {figma && (
          <>
            <div className="pointer-events-none absolute right-0 top-0 h-4 w-4" style={{ background: "rgba(200,170,140,0.55)", clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-4 w-4" style={{ background: "rgba(200,170,140,0.55)", clipPath: "polygon(0 0, 0 100%, 100% 100%)" }} aria-hidden="true" />
          </>
        )}
        <div className="flex shrink-0 items-start justify-between p-6 pb-0">
          <div>
            {systemTag && (
              <div className="mono text-[11px] uppercase tracking-[0.2em] text-orange">{systemTag}</div>
            )}
            <h2 className={figma ? "display mt-1 text-base uppercase tracking-[0.1em] text-orange" : "mt-1 text-lg font-semibold"}>{title}</h2>
          </div>
          {!hideClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className={figma ? "mono -mr-1 -mt-1 border px-2 py-1 text-sm text-ink-soft hover:text-magenta" : "mono -mr-1 -mt-1 px-2 py-1 text-sm text-ink-soft hover:text-ink"}
              style={figma ? { borderColor: "rgba(200,80,0,0.2)" } : undefined}
            >
              ✕
            </button>
          )}
        </div>
        {/* min-w-0 + break-words stop a long unbreakable string (agent label,
            pasted title) from forcing the body wider than the panel and creating
            a horizontal scrollbar; overflow-x-hidden is the belt-and-braces. */}
        <div className="min-w-0 overflow-y-auto overflow-x-hidden break-words p-6 pt-4">{children}</div>
      </div>
    </div>
  );
}
