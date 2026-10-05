import Image from "next/image";
import Link from "next/link";
import type { SiteSettings } from "@/lib/settings";

const PAYMENT_BADGES = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Visa / Mastercard"];

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="relative mt-8 border-t border-white/10">
      <div className="glass-section">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/images/logo.png"
                alt={`${settings.siteName} logo`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_4px_12px_-2px_rgba(0,0,0,0.4)]"
              />
              <p className="display text-2xl tracking-[0.18em]">
                MEET<span className="text-deep-red">BEATZ</span>
              </p>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{settings.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {PAYMENT_BADGES.map((b) => (
                <span key={b} className="badge">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow">Explore</p>
            <ul className="mt-4 space-y-2 text-sm text-cream/80">
              <li><Link href="/beats" className="hover:text-acid">Beat store</Link></li>
              <li><Link href="/sound-kits" className="hover:text-acid">Sound Kits</Link></li>
              <li><Link href="/studio" className="hover:text-acid">Studio bookings</Link></li>
              <li><Link href="/#licenses" className="hover:text-acid">License options</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Contact</p>
            <ul className="mt-4 space-y-2 text-sm text-cream/80">
              <li>{settings.location}</li>
              <li><a href={`mailto:${settings.contactEmail}`} className="hover:text-acid">{settings.contactEmail}</a></li>
              <li><a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`} className="hover:text-acid">{settings.contactPhone}</a></li>
              {settings.whatsapp && (
                <li>
                  <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} className="hover:text-acid" target="_blank" rel="noreferrer">
                    WhatsApp {settings.whatsapp}
                  </a>
                </li>
              )}
              {settings.instagram && <li className="text-muted">{settings.instagram}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p>© {new Date().getFullYear()} {settings.siteName}. All beats are original works.</p>
              <p>Secure payments powered by Paystack · Files delivered instantly by email.</p>
            </div>
            <div className="mt-4 border-t border-white/5 pt-4 text-center">
              <Link href="/admin" className="display text-sm tracking-[0.22em] text-cream transition hover:opacity-80">
                MEET<span className="text-deep-red">BEATZ</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
