import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Meetbeatz — Beats & Studio Sessions",
    template: "%s · Meetbeatz",
  },
  description:
    "Buy premium beats with Mobile Money and get your files plus license instantly by email. Book recording, mixing and mastering sessions at the Meetbeatz studio.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans text-cream antialiased">{children}</body>
    </html>
  );
}
