import type { ReactNode } from "react";
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

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const [settings, customer] = await Promise.all([getSettings(), getCustomerSession()]);
  return (
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
  );
}
