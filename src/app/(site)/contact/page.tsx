import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { studioHours } from "@/db/schema";
import { ContactForm } from "@/components/contact-form";
import { LegalFaq } from "@/components/legal-page";
import { ChatIcon, MailIcon, PhoneIcon } from "@/components/icons";
import { CONTACT_TOPICS } from "@/lib/contact";
import { DAY_NAMES, formatTime12 } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Message, call or WhatsApp Meetbeatz about beats, licensing, downloads, refunds or studio bookings. Studio hours, response times and the contact form.",
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const [settings, hours] = await Promise.all([getSettings(), db.select().from(studioHours).orderBy(asc(studioHours.dayOfWeek))]);
  const waNumber = settings.whatsapp.replace(/\D/g, "");
  const today = new Date().getDay();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-3xl">
        <p className="eyebrow">Contact</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl md:text-6xl">Talk to the studio.</h1>
        <p className="mt-5 text-base leading-relaxed text-cream/80">
          Questions about a beat, a license, a download that will not open, or the best time to book the room? Send a message below or reach us
          directly — {settings.siteName} answers every enquiry personally, usually within one business day.
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        {/* Contact details */}
        <div className="space-y-6">
          <div className="card p-6">
            <p className="eyebrow">Direct lines</p>
            <ul className="mt-5 space-y-5 text-sm">
              <li className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-acid">
                  <MailIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Email</p>
                  <a href={`mailto:${settings.contactEmail}`} className="mt-0.5 block break-all font-semibold text-cream hover:text-acid">
                    {settings.contactEmail}
                  </a>
                  <p className="mt-0.5 text-xs text-muted">Best for licenses, invoices, refund requests and file problems.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-acid">
                  <PhoneIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Phone</p>
                  <a
                    href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}
                    className="mt-0.5 block font-semibold text-cream hover:text-acid"
                  >
                    {settings.contactPhone}
                  </a>
                  <p className="mt-0.5 text-xs text-muted">Call or text during studio hours for anything urgent.</p>
                </div>
              </li>
              {waNumber && (
                <li className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-acid">
                    <ChatIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">WhatsApp</p>
                    <a
                      href={`https://wa.me/${waNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block font-semibold text-cream hover:text-acid"
                    >
                      {settings.whatsapp}
                    </a>
                    <p className="mt-0.5 text-xs text-muted">Quickest way to send a voice note about a session.</p>
                  </div>
                </li>
              )}
              <li className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-acid">
                  <span aria-hidden>✦</span>
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">The studio</p>
                  <p className="mt-0.5 font-semibold text-cream">{settings.location}</p>
                  {settings.instagram && <p className="mt-0.5 text-xs text-muted">{settings.instagram} on socials</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    Bookings are made online —{" "}
                    <Link href="/studio" className="text-acid hover:underline">
                      pick a slot here
                    </Link>
                    .
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="card p-6">
            <p className="eyebrow">Studio hours</p>
            <ul className="mt-4 divide-y divide-white/10 text-sm">
              {hours.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="flex items-center gap-2 font-semibold">
                    {DAY_NAMES[h.dayOfWeek]}
                    {h.dayOfWeek === today && <span className="badge-acid">Today</span>}
                  </span>
                  <span className={h.isOpen ? "text-cream/80" : "text-muted"}>
                    {h.isOpen ? `${formatTime12(h.opensAt)} – ${formatTime12(h.closesAt)}` : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Messages sent outside these hours are answered the next working day. Payment receipts and license certificates are emailed 24/7, the
              moment a payment clears.
            </p>
          </div>

          <div className="glass rounded-2xl p-6">
            <p className="eyebrow">Before you write</p>
            <ul className="mt-4 space-y-2.5 text-sm text-cream/80">
              <li>
                • Missing files? Check your spam folder, then look up the order on your{" "}
                <Link href="/account" className="text-acid hover:underline">
                  account page
                </Link>
                .
              </li>
              <li>
                • Choosing a license? The{" "}
                <Link href="/licensing" className="text-acid hover:underline">
                  licensing guide
                </Link>{" "}
                compares every tier in one table.
              </li>
              <li>
                • Wrong charge or a refund? Read the{" "}
                <Link href="/refunds" className="text-acid hover:underline">
                  refund policy
                </Link>{" "}
                so you know what to include.
              </li>
              <li>• Signed in already? The chat bubble in the corner goes straight to the studio.</li>
            </ul>
          </div>
        </div>

        {/* Form */}
        <div className="card p-6 sm:p-8">
          <p className="eyebrow">Send a message</p>
          <h2 className="display mt-2 text-3xl sm:text-4xl">How can we help?</h2>
          <p className="mt-3 text-sm text-muted">
            Fill this in and it lands with the studio. Include your order reference if your question is about a purchase — it saves a round trip.
          </p>
          <div className="mt-6">
            <ContactForm topics={CONTACT_TOPICS} source="contact" />
          </div>
        </div>
      </div>

      <LegalFaq
        items={[
          {
            q: "How fast do you reply?",
            a: (
              <>
                Usually within one business day, and often the same day. Refund and file-delivery problems are treated as urgent and handled first.
              </>
            ),
          },
          {
            q: "Can I book a session by message instead of online?",
            a: (
              <>
                Yes — message us with the service, the date and how many hours you need. Booking online is faster though, because you can see which
                slots are free and lock one in with a deposit. Start on the <Link href="/studio">studio page</Link>.
              </>
            ),
          },
          {
            q: "Do you work with artists outside Ghana?",
            a: (
              <>
                Absolutely. Files are delivered by email worldwide, and remote mixing and mastering can be arranged by message — send your stems and
                tell us your deadline.
              </>
            ),
          },
          {
            q: "I want to send my song for a feature or collab. Will you listen?",
            a: (
              <>
                Yes — send a link, not an attachment. Include what you need (beat, mix, feature) and your release timeline so the studio can answer
                properly.
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
