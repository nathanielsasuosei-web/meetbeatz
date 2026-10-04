"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { configuredAdSensePublisherId, configuredAdSenseSlotId } from "@/lib/adsense-config";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
    /** Prevent React Strict Mode or client navigation from enabling Auto Ads twice. */
    __meetbeatzAutoAdsPublisherId?: string;
  }
}

type AdSenseProps = {
  /** Numeric ad-slot ID from the AdSense dashboard (a string). */
  slot?: string;
  /** Override the global publisher ID for testing. */
  publisherId?: string;
  /** Layout style. `display: block` is the safe default. */
  format?: "auto" | "fluid";
  /** Optional inline style. */
  style?: CSSProperties;
  /** Extra Tailwind / className utility classes for the wrapping <ins>. */
  className?: string;
};

function readPublisherId(override?: string): string | null {
  return configuredAdSensePublisherId(override);
}

/**
 * Google AdSense ad unit. Place anywhere inside a server component.
 *
 * The AdSense loader is mounted once in the public-site layout. This unit
 * queues itself for Google after hydration, using the configured publisher
 * and slot IDs.
 */
export function AdSense({
  slot,
  publisherId,
  format = "auto",
  style,
  className,
}: AdSenseProps) {
  const pushed = useRef(false);
  const client = readPublisherId(publisherId);
  const realSlot = configuredAdSenseSlotId(slot);

  useEffect(() => {
    if (pushed.current || !client || !realSlot) return;
    try {
      // Queue the request even if the async AdSense loader hasn't executed yet.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // An ad blocker or a Google script failure should not break the page.
    }
  }, [client, realSlot]);

  if (!client || !realSlot) return null;

  return (
    <ins
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
 * Loads the AdSense script once on public pages with the configured publisher
 * ID. Auto Ads are optional and remain off unless explicitly enabled.
 */
export function AdSenseScript({ publisherId }: { publisherId?: string }) {
  const client = readPublisherId(publisherId);
  if (!client) return null;

  return (
    <>
      <Script
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
      />
      <AutoAdsBoot publisherId={client} />
    </>
  );
}

/** Enables AdSense page-level/Auto Ads once for the current browser tab. */
function AutoAdsBoot({ publisherId }: { publisherId: string }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ADSENSE_AUTO_ADS !== "1") return;
    if (window.__meetbeatzAutoAdsPublisherId === publisherId) return;

    // Queue the configuration before the async loader completes; Google will
    // consume it when the script is ready. This also avoids retry timers when
    // the loader is blocked or unavailable.
    window.__meetbeatzAutoAdsPublisherId = publisherId;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({
        google_ad_client: publisherId,
        enable_page_level_ads: true,
      });
    } catch {
      // AdSense may be blocked. Never let it affect the store experience.
    }
  }, [publisherId]);

  return null;
}

/**
 * The AMP Auto Ads component loader, exactly as supplied.
 *
 * This is the AMP-only form of the auto-ads snippet: it registers the
 * <amp-auto-ads> element with the AMP runtime (https://cdn.ampproject.org/v0.js)
 * and expects a matching <amp-auto-ads> tag in the body of an AMP document.
 * This site is a Next.js app — there are no AMP pages, no AMP runtime and no
 * <amp-auto-ads> element — so the script loads and has nothing to act on. It is
 * mounted because it was explicitly requested.
 *
 * The snippet that actually serves ads here is <AdSenseScript /> above, whose
 * page-level (Auto Ads) mode is switched on with NEXT_PUBLIC_ADSENSE_AUTO_ADS=1.
 */
export function AmpAutoAdsScript() {
  // A plain <script> rather than next/script: `custom-element` is an AMP
  // convention, and this keeps the tag in the server HTML exactly as supplied
  // instead of being injected after hydration.
  return (
    <script
      async
      src="https://cdn.ampproject.org/v0/amp-auto-ads-0.1.js"
      {...{ "custom-element": "amp-auto-ads" }}
    />
  );
}
