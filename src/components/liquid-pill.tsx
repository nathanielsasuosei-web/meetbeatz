"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

export type PillBox = { x: number; y: number; w: number; h: number };
export type PillTargets = { current: Array<HTMLElement | null> };

/**
 * Tracks the hovered/focused nav item so the liquid pill can glide to it.
 * Coordinates are content-space (scroll offsets included), so the pill stays
 * glued to its target inside scrolling navs too.
 */
export function useLiquidPill(
  containerRef: RefObject<HTMLElement | null>,
  itemRefs: PillTargets,
  focusIndex: number,
) {
  const [pill, setPill] = useState<PillBox | null>(null);
  const [pillOn, setPillOn] = useState(false);

  useEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      if (!container) return;
      const el = focusIndex >= 0 ? itemRefs.current[focusIndex] : null;
      if (!el) {
        setPillOn(false);
        return;
      }
      const c = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setPill({
        x: r.left - c.left + container.scrollLeft,
        y: r.top - c.top + container.scrollTop,
        w: r.width,
        h: r.height,
      });
      setPillOn(true);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    for (const el of itemRefs.current) if (el) ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [focusIndex, containerRef, itemRefs]);

  return { pill, pillOn };
}

/** The sliding glass droplet plus its trailing liquid smear. */
export function LiquidPill({ pill, on, glow = "" }: { pill: PillBox | null; on: boolean; glow?: string }) {
  if (!pill) return null;
  const style: CSSProperties = { transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h };
  return (
    <>
      <span aria-hidden className={`nav-pill-ghost${on ? " is-on" : ""}`} style={style} />
      <span aria-hidden className={`nav-pill${on ? " is-on" : ""}${glow ? ` ${glow}` : ""}`} style={style} />
    </>
  );
}
