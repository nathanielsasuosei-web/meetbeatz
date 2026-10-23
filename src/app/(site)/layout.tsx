import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/cart-provider";
import { PlayerProvider } from "@/components/player/player-context";
import { PlayerBar } from "@/components/player/player-bar";
import { SiteHeader } from "@/components/site-header";
import { ScreenGuard } from "@/components/screen-guard";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { ArtistIncomingCallAlert } from "@/components/artist-incoming-call-alert";
import { AdSenseScript, AmpAutoAdsScript } from "@/components/adsense";
import { buildThemeStyle } from "@/lib/background-theme";
import { getCustomerSession } from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";
import { getSettings, isLiveRecordingOpen } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const [settings, customer] = await Promise.all([getSettings(), getCustomerSession()]);
  const themeStyle = buildThemeStyle(settings);

  return (
    <div className="theme-site" style={themeStyle}>
      <CartProvider>
        <PlayerProvider>
          <SiteHeader
            siteName={settings.siteName}
            customer={customer ? { name: customer.name } : null}
            liveRecordingOpen={isLiveRecordingOpen(settings)}
          />
          {/*
            Screen-recording protection for the storefront. The viewer's email is
            passed in so the forensic watermark names the account a leak came
            from; the producer controls the mode in Admin → Settings.
          */}
          <ScreenGuard
            config={{
              mode: settings.screenGuard,
              siteName: settings.siteName,
              viewer: customer?.email ?? "",
            }}
          />
          <main className="min-h-[70vh]">{children}</main>
          <SiteFooter settings={settings} />
          <PlayerBar />
          <ArtistIncomingCallAlert customer={customer ? { name: customer.name } : null} />
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
