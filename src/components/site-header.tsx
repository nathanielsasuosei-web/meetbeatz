"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "./icons";
import { LiquidPill, useLiquidPill } from "./liquid-pill";
import { useSpotlight } from "./spotlight";

/**
 * Desktop navigation, shown from 1024px up. Five links is what fits next to
 * the logo and the account buttons before it starts to crowd; Contact and the
 * legal pages live in the drawer below that and in the footer everywhere.
 */
const NAV = [
  { href: "/beats", label: "Beats" },
  { href: "/sound-kits", label: "Sound Kits" },
  { href: "/studio", label: "Studio" },
  { href: "/licensing", label: "Licensing" },
  { href: "/about", label: "About" },
];

type NavItem = (typeof NAV)[number];

/** Extra rows shown in the mobile menu under the main links. */
const MOBILE_MORE = [
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund Policy" },
];

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

  // Dynamic glass: the bar condenses and deepens as the page scrolls, an
  // acid line traces reading progress, and a specular highlight follows the
  // cursor. Progress is painted via a CSS var (no re-render); only the
  // scrolled flag re-renders, and only when it flips.
  const headerRef = useRef<HTMLElement | null>(null);
  const shellRef = useSpotlight<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      headerRef.current?.style.setProperty("--progress", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
      setScrolled(y > 14);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const isActive = (item: NavItem) =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && !item.href.includes("#"));

  const activeIndex = NAV.findIndex(isActive);
  // On a page outside the main nav (contact, legal pages, account) the pill
  // rests on the first item instead of vanishing.
  const restIndex = activeIndex >= 0 ? activeIndex : 0;
  const focusIndex = hover ?? restIndex;

  // Track the hovered/active link so the liquid pill can glide to it
  const { pill, pillOn } = useLiquidPill(navRef, itemRefs, focusIndex);

  return (
    <header ref={headerRef} className={`glass-header sticky top-0 z-40${scrolled ? " is-scrolled" : ""}`}>
      <div ref={shellRef} className="nav-shell glass-strong !rounded-none !border-x-0 !border-t-0 !border-b-white/10">
        <div className="nav-row mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="nav-logo">
            <Logo siteName={siteName} />
          </div>
          <nav
            ref={navRef}
            aria-label="Primary"
            className="relative hidden items-center gap-1 lg:flex"
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
                  className={`nav-item relative z-10 rounded-full px-3 py-2 text-sm font-semibold xl:px-4 xl:text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/60 ${
                    active ? "text-cream" : "text-muted hover:text-cream"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
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
            className={`rounded-xl p-2 text-cream transition active:scale-90 lg:hidden ${open ? "bg-white/10" : "hover:bg-white/5"}`}
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
        <span aria-hidden className="glass-glow" />
        <span aria-hidden className="nav-progress" />
        <div id="mobile-menu" className={`mobile-menu${open ? " open" : ""}`}>
          <div className="mobile-menu-inner">
            {/* Scrolls on its own if the drawer is taller than the phone screen */}
            <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-t border-white/10 px-4 pb-6 pt-3">
              <div className="flex flex-col gap-1">
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

              {/* Legal + contact links, so nothing is only reachable by scrolling the footer */}
              <p className="eyebrow mt-5 px-3">More</p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {MOBILE_MORE.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="m-item rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-white/10 hover:text-cream"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
