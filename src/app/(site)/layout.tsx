import type { ReactNode } from "react";
import { PlayerProvider } from "@/components/player/player-context";
import { PlayerBar } from "@/components/player/player-bar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ensureSeeded } from "@/lib/seed";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const settings = await getSettings();
  return (
    <PlayerProvider>
      <SiteHeader siteName={settings.siteName} />
      <main className="min-h-[70vh]">{children}</main>
      <SiteFooter settings={settings} />
      <PlayerBar />
    </PlayerProvider>
  );
}
