"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useSpotlight } from "@/components/spotlight";

/**
 * A `.card` that lights up under the cursor: `useSpotlight` writes
 * `--mx` / `--my` pointer coords and the `.card-glow` overlay paints a soft
 * specular highlight that chases them. It also "condenses" (brighter rim +
 * glow) while any field inside is focused.
 */
export function SpotlightCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useSpotlight<HTMLDivElement>();
  return (
    <div ref={ref} className={`card spot-card ${className}`} style={style}>
      <span aria-hidden className="card-glow" />
      {children}
    </div>
  );
}
