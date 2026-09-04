import Link from "next/link";
import type { SiteSettings } from "@/lib/settings";

const PAYMENT_BADGES = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Visa / Mastercard"];

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="border-t border-line bg-ink-2">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="display text-2xl tracking-[0.18em]">
            MEET<span className="text-acid">BEATZ</span>
          </p>
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
            <li><Link href="/studio" className="hover:text-acid">Studio bookings</Link></li>
            <li><Link href="/#licenses" className="hover:text-acid">License options</Link></li>
            <li><Link href="/#how" className="hover:text-acid">How it works</Link></li>
            <li><Link href="/admin" className="hover:text-acid">Producer login</Link></li>
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
      <div className="border-t border-line/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {settings.siteName}. All beats are original works.</p>
          <p>Secure payments powered by Paystack · Files delivered instantly by email.</p>
        </div>
      </div>
    </footer>
  );
}
