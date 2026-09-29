"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades/slides children up as the block scrolls into view, staggered.
 * Pass `target` when the animated items are nested (e.g. ".card").
 * Respects prefers-reduced-motion (content simply appears).
 */
export function Reveal({
  children,
  className = "",
  target,
  stagger = 70,
}: {
  children: ReactNode;
  className?: string;
  target?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in");
      return;
    }
    const nodes = Array.from((target ? el.querySelectorAll(target) : el.children)) as HTMLElement[];
    const rect = el.getBoundingClientRect();
    const inViewNow = rect.top < window.innerHeight - 40 && rect.bottom > 40;
    nodes.forEach((node, i) => {
      node.classList.add("reveal-target");
      node.style.setProperty("--rd", `${i * stagger}ms`);
    });
    // Already on screen: settle immediately in the same batch so there is no flash.
    if (inViewNow) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            io.disconnect();
          }
        }
      },
      { threshold: 0, rootMargin: "0px 0px -50px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, stagger]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
