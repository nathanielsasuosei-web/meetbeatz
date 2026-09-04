"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CloseIcon, MenuIcon } from "./icons";

const NAV = [
  { href: "/beats", label: "Beats" },
  { href: "/studio", label: "Studio" },
  { href: "/#licenses", label: "Licensing" },
  { href: "/#how", label: "How it works" },
];

export function Logo({ siteName }: { siteName: string }) {
  const [a, b] = siteName.toLowerCase().startsWith("meet") ? ["MEET", siteName.slice(4).toUpperCase()] : [siteName.toUpperCase(), ""];
  return (
    <Link href="/" className="display text-xl tracking-[0.18em]">
      {a}
      <span className="text-acid">{b}</span>
    </Link>
  );
}

export function SiteHeader({ siteName }: { siteName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo siteName={siteName} />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && !item.href.includes("#"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-white/10 text-cream" : "text-muted hover:text-cream"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/admin" className="text-xs font-semibold text-muted hover:text-cream">
            Producer login
          </Link>
          <Link href="/studio" className="btn-primary">
            Book a session
          </Link>
        </div>
        <button type="button" className="rounded-lg p-2 text-cream md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-ink px-4 pb-6 pt-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-base font-semibold text-cream hover:bg-white/5">
                {item.label}
              </Link>
            ))}
            <Link href="/admin" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-muted">
              Producer login
            </Link>
            <Link href="/studio" onClick={() => setOpen(false)} className="btn-primary mt-2">
              Book a session
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
