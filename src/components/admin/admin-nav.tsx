"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { LiquidPill, useLiquidPill } from "../liquid-pill";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/beats", label: "Beats", icon: "♫" },
  { href: "/admin/sound-kits", label: "Sound Kits", icon: "♬" },
  { href: "/admin/orders", label: "Orders", icon: "◎" },
  { href: "/admin/bookings", label: "Bookings", icon: "◷" },
  { href: "/admin/messages", label: "Messages", icon: "✉" },
  { href: "/admin/enquiries", label: "Enquiries", icon: "▤" },
  { href: "/admin/studio", label: "Studio & hours", icon: "◍" },
  { href: "/admin/licenses", label: "Licenses", icon: "✎" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export function AdminNav({ openEnquiries = 0 }: { openEnquiries?: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [hover, setHover] = useState<number | null>(null);

  const isActive = (l: (typeof LINKS)[number]) => (l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href));
  const activeIndex = LINKS.findIndex(isActive);
  const focusIndex = hover ?? activeIndex;
  const { pill, pillOn } = useLiquidPill(navRef, itemRefs, focusIndex);

  return (
    <nav
      ref={navRef}
      aria-label="Admin"
      className="relative flex gap-1 overflow-x-auto lg:flex-col"
      onMouseLeave={() => setHover(null)}
    >
      <LiquidPill pill={pill} on={pillOn} glow={focusIndex >= 0 && focusIndex === activeIndex ? "is-solid" : ""} />
      {LINKS.map((l, i) => {
        const active = isActive(l);
        const lit = focusIndex === i; // the pill is resting on this link
        // Dark text only while the solid acid pill covers it; otherwise cream
        // (or muted when neither active nor hovered) so it stays readable.
        const tone = active && lit ? "text-ink" : active || lit ? "text-cream" : "text-muted";
        return (
          <Link
            key={l.href}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            href={l.href}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover((h) => (h === i ? null : h))}
            style={{ animationDelay: `${80 + i * 55}ms` }}
            className={`nav-item relative z-10 flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/60 ${tone}`}
          >
            <span className="w-4 text-center text-base leading-none">{l.icon}</span>
            {l.label}
            {l.href === "/admin/enquiries" && openEnquiries > 0 && (
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold ${lit ? "bg-ink/20 text-ink" : "bg-acid text-ink"}`}>
                {openEnquiries > 99 ? "99+" : openEnquiries}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
