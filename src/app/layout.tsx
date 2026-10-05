import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// The icon routes are the files next to this layout, all cut from the same
// MEETBEATZ monogram logo as the header/footer logo:
//   src/app/favicon.ico     → browser tab, bookmarks (16/32/48 px in one file)
//   src/app/icon.png        → higher-resolution tab icon, Android home screen
//   src/app/apple-icon.png  → iOS home screen
// The icons crop in tighter than public/images/logo.png does: at 16-32 px the
// MEETBEATZ wordmark under the mark is an unreadable smear, so the tab icon is
// the MB monogram plus the neon arc and EQ bars.
// These files have no transparency — the artwork is a flat render, so each one
// is the monogram on its own dark textured square. That suits the site: every
// call site sits on the ink background and rounds the tile (rounded-lg / -xl /
// -2xl, see site-header, site-footer, the hero, and the admin pages), so it
// reads as a deliberate tile rather than a pasted rectangle.
// They are listed explicitly because Next 14 serves those routes but does not
// add the matching <link> tags on its own — without this block the site keeps a
// blank/default tab icon even though /favicon.ico answers 200.
export const metadata: Metadata = {
  title: {
    default: "Meetbeatz — Beats & Studio Sessions",
    template: "%s · Meetbeatz",
  },
  description:
    "Buy premium beats with Mobile Money and get your files plus license instantly by email. Book recording, mixing and mastering sessions at the Meetbeatz studio.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans text-cream antialiased">
        <div className="liquid-bg" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        {children}
      </body>
    </html>
  );
}
