"use client";
import { useEffect, useRef } from "react";
import { useInView, useReducedMotion, animate } from "motion/react";

// Count-up number that animates from 0 → `to` the first time it scrolls into
// view. Used by the stats bar. Renders the final value as text content directly
// (imperative, avoids a re-render per frame). With reduced-motion, it shows the
// final value immediately (no count-up).
export function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || !ref.current) return;
    const final = to.toLocaleString() + suffix;
    if (reduce) {
      ref.current.textContent = final;
      return;
    }
    const controls = animate(0, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate(v) {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString() + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, to, suffix, reduce]);
  return <span ref={ref}>0{suffix}</span>;
}
