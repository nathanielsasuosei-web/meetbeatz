"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "./icons";
import { LiquidPill, useLiquidPill } from "./liquid-pill";

const NAV = [
  { href: "/beats", label: "Beats" },
  { href: "/studio", label: "Studio" },
  { href: "/#licenses", label: "Licensing" },
  { href: "/#how", label: "How it works" },
];

type NavItem = (typeof NAV)[number];

export function Logo({ siteName }: { siteName: string }) {
  const [a, b] = siteName.toLowerCase().startsWith("meet") ? ["MEET", siteName.slice(4).toUpperCase()] : [siteName.toUpperCase(), ""];
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/images/logo.png"
        alt={`${siteName} logo`}
        width={36}
        height={36}
        priority
        className="h-9 w-9 rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_4px_12px_-2px_rgba(0,0,0,0.4)]"
      />
      <span className="display text-xl tracking-[0.18em]">
        {a}
        <span className="text-deep-red">{b}</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ siteName, customer }: { siteName: string; customer: { name: string } | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [hover, setHover] = useState<number | null>(null);

  const isActive = (item: NavItem) =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && !item.href.includes("#"));
  const activeIndex = NAV.findIndex(isActive);
  const focusIndex = hover ?? activeIndex;

  // Track the hovered/active link so the liquid pill can glide to it
  const { pill, pillOn } = useLiquidPill(navRef, itemRefs, focusIndex);

  return (
    <header className="sticky top-0 z-40">
      <div className="glass-strong !rounded-none !border-x-0 !border-t-0 !border-b-white/10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo siteName={siteName} />
          <nav
            ref={navRef}
            aria-label="Primary"
            className="relative hidden items-center gap-1 md:flex"
            onMouseLeave={() => setHover(null)}
          >
            <LiquidPill pill={pill} on={pillOn} glow={activeIndex >= 0 && focusIndex === activeIndex ? "is-acid" : ""} />
            {NAV.map((item, i) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  href={item.href}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                  style={{ animationDelay: `${100 + i * 70}ms` }}
                  className={`nav-item relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/60 ${
                    active ? "text-cream" : "text-muted hover:text-cream"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {customer ? (
              <Link href="/account" className="btn-ghost">
                My account
              </Link>
            ) : (
              <Link href="/account/login" className="text-xs font-semibold text-muted hover:text-cream">
                Sign in
              </Link>
            )}
            <Link href="/studio" className="btn-primary">
              Book a session
            </Link>
          </div>
          <button
            type="button"
            className={`rounded-xl p-2 text-cream transition active:scale-90 md:hidden ${open ? "bg-white/10" : "hover:bg-white/5"}`}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            <span className={`nav-icon${open ? " open" : ""}`}>
              <MenuIcon className="i-menu" />
              <CloseIcon className="i-close" />
            </span>
          </button>
        </div>
        <div id="mobile-menu" className={`mobile-menu${open ? " open" : ""}`}>
          <div className="mobile-menu-inner">
            <div className="flex flex-col gap-1 border-t border-white/10 px-4 pb-6 pt-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="m-item rounded-xl px-3 py-3 text-base font-semibold text-cream transition hover:bg-white/10 hover:translate-x-1"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={customer ? "/account" : "/account/login"}
                onClick={() => setOpen(false)}
                className="m-item rounded-xl px-3 py-3 text-sm font-semibold text-muted transition hover:bg-white/10 hover:translate-x-1"
              >
                {customer ? "My account" : "Sign in"}
              </Link>
              <Link href="/studio" onClick={() => setOpen(false)} className="btn-primary m-item mt-2 justify-center">
                Book a session
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
