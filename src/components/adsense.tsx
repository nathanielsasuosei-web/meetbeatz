"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseProps = {
  /** AdSense ad slot ID from the AdSense dashboard (a numeric string). */
  slot?: string;
  /** Override the global publisher ID for testing. */
  publisherId?: string;
  /** Layout style. `display: block` is the safe default. */
  format?: "auto" | "fluid";
  /** Optional inline style. We default to a responsive full-width rectangle. */
  style?: React.CSSProperties;
  /** Extra Tailwind / className utility classes for the wrapping <ins>. */
  className?: string;
};

function readPublisherId(override?: string): string | null {
  if (override && override.startsWith("ca-pub-") && override !== "ca-pub-0000000000000000") {
    return override;
  }
  const fromEnv = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  if (
    fromEnv &&
    fromEnv.startsWith("ca-pub-") &&
    fromEnv !== "ca-pub-0000000000000000"
  ) {
    return fromEnv;
  }
  return null;
}

/**
 * Google AdSense ad unit. Place anywhere inside a server component.
 *
 * The AdSense script itself is loaded once in `src/app/(site)/layout.tsx`
 * via <AdSenseScript />, so individual <AdSense /> instances push entries
 * to `window.adsbygoogle` which the script picks up.
 *
 * The component renders nothing (and pushes nothing to AdSense) unless:
 *   - `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` is set in .env to a real ca-pub-... ID, AND
 *   - the `slot` prop (or `NEXT_PUBLIC_ADSENSE_SLOT_<NAME>`) is set to a real slot ID.
 *
 * That means you can ship this code with placeholder env vars and the site
 * will look and behave identically to before — until you fill in real IDs.
 */
export function AdSense({
  slot,
  publisherId,
  format = "auto",
  style,
  className,
}: AdSenseProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  const client = readPublisherId(publisherId);
  const realSlot = slot && /^\d+$/.test(slot) ? slot : null;

  useEffect(() => {
    if (pushed.current) return;
    if (!client || !realSlot) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script not loaded yet, or blocked by an ad blocker — that's fine.
    }
  }, [client, realSlot]);

  if (!client || !realSlot) return null;

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle block ${className ?? ""}`.trim()}
      style={style ?? { display: "block" }}
      data-ad-client={client}
      data-ad-slot={realSlot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}

/**
 * Loads the AdSense loader script once for the whole site.
 * Add this once in a root or public-area layout.
 *
 * Skips itself out cleanly when no publisher ID is configured, so the
 * site works identically without AdSense — no broken script tags.
 */
export function AdSenseScript({ publisherId }: { publisherId?: string }) {
  const client = readPublisherId(publisherId);
  if (!client) return null;
  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      crossOrigin="anonymous"
    />
  );
}