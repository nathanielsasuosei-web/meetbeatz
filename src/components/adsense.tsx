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
  if (
    override &&
    override.startsWith("ca-pub-") &&
    override !== "ca-pub-0000000000000000"
  ) {
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
 *
 * When `NEXT_PUBLIC_ADSENSE_AUTO_ADS` is "1" and a publisher ID is set,
 * also enables Google Auto Ads by pushing the `google_ad_client` /
 * `google_ad_modifications` payload to `window.adsbygoogle` once the
 * loader script is available. Auto Ads then chooses its own placements
 * across every page on the public site (co-existing with any manual
 * <AdSense /> units — AdSense avoids placing Auto Ads where you have
 * a manual unit).
 */
export function AdSenseScript({ publisherId }: { publisherId?: string }) {
  const client = readPublisherId(publisherId);
  if (!client) return null;
  return (
    <>
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
      />
      <AutoAdsBoot publisherId={client} />
    </>
  );
}

/**
 * Pushes the Auto Ads enablement payload to `adsbygoogle` after the loader
 * has initialised. Safe to run on every page — it pushes at most once per
 * browser tab. No-op when `NEXT_PUBLIC_ADSENSE_AUTO_ADS` is not "1".
 *
 * Why a separate component: the loader script may not have populated
 * `window.adsbygoogle` on the first paint, so we wait a tick and retry.
 */
function AutoAdsBoot({ publisherId }: { publisherId: string }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ADSENSE_AUTO_ADS !== "1") return;

    let cancelled = false;
    const tryEnable = () => {
      if (cancelled) return;
      const w = window as Window & {
        adsbygoogle?: Array<Record<string, unknown>>;
      };
      if (!w.adsbygoogle) {
        // Loader hasn't run yet — try again next frame.
        window.setTimeout(tryEnable, 100);
        return;
      }
      try {
        w.adsbygoogle.push({
          google_ad_client: publisherId,
          enable_page_level_ads: true,
        });
      } catch {
        // Ad blocker or script not loaded — silently skip.
      }
    };
    tryEnable();
    return () => {
      cancelled = true;
    };
  }, [publisherId]);

  return null;
}