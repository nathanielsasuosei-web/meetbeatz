import type { CSSProperties, ReactNode } from "react";
import { CartProvider } from "@/components/cart/cart-provider";
import { PlayerProvider } from "@/components/player/player-context";
import { PlayerBar } from "@/components/player/player-bar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { AdSenseScript, AmpAutoAdsScript } from "@/components/adsense";
import { getCustomerSession } from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function themeColor(value: string): { hex: string; rgb: string; dark: string } {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#c6f135";
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgb = channels.join(" ");
  const dark = `rgb(${channels.map((channel) => Math.round(channel * 0.72)).join(" ")})`;
  return { hex, rgb, dark };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const [settings, customer] = await Promise.all([getSettings(), getCustomerSession()]);
  const accent = themeColor(settings.accentColor);
  const themeStyle = {
    "--color-acid": accent.hex,
    "--color-acid-2": accent.dark,
    "--accent-rgb": accent.rgb,
  } as CSSProperties;

  return (
    <div className="theme-site" style={themeStyle}>
      <CartProvider>
        <PlayerProvider>
          <SiteHeader siteName={settings.siteName} customer={customer ? { name: customer.name } : null} />
        <main className="min-h-[70vh]">{children}</main>
        <SiteFooter settings={settings} />
        <PlayerBar />
        <ChatWidget customer={customer ? { name: customer.name } : null} />
        {/*
          AdSense loader. Renders nothing unless NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
          is set in .env to a real ca-pub-... ID, so the site is unaffected
          until you opt in.
        */}
        <AdSenseScript />
        {/*
          The AMP Auto Ads loader, as requested. Inert here: it only does
          something on AMP pages and this site has none. See the note in
          src/components/adsense.tsx.
        */}
        <AmpAutoAdsScript />
        </PlayerProvider>
      </CartProvider>
    </div>
  );
}
