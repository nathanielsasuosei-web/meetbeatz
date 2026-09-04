"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/beats", label: "Beats", icon: "♫" },
  { href: "/admin/orders", label: "Orders", icon: "◎" },
  { href: "/admin/bookings", label: "Bookings", icon: "◷" },
  { href: "/admin/studio", label: "Studio & hours", icon: "◍" },
  { href: "/admin/licenses", label: "Licenses", icon: "✎" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-acid text-ink" : "text-muted hover:bg-white/5 hover:text-cream"}`}
          >
            <span className="w-4 text-center text-base leading-none">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
