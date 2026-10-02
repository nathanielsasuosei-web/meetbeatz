import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// The icon routes are the files next to this layout, all cut from the same
// studio photo as the header/footer logo:
//   src/app/favicon.ico     → browser tab, bookmarks (16/32/48 px in one file)
//   src/app/icon.png        → higher-resolution tab icon, Android home screen
//   src/app/apple-icon.png  → iOS home screen
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
      <body className="min-h-screen bg-ink font-sans text-cream antialiased">{children}</body>
    </html>
  );
}
