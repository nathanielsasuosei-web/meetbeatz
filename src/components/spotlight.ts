"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Tracks the pointer over the host element and writes `--mx` / `--my`
 * (percent positions inside the element) straight into its CSS custom
 * properties. Glass overlays that read those vars (`.glass-glow`,
 * `.card-glow`) light up under the cursor.
 *
 * Updates are rAF-throttled and mutate style only — React never re-renders.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let x = 50;
    let y = 50;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      x = ((e.clientX - r.left) / r.width) * 100;
      y = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--mx", `${x.toFixed(2)}%`);
          el.style.setProperty("--my", `${y.toFixed(2)}%`);
        });
      }
    };

    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
