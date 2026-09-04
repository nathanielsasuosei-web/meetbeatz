import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats, licenses } from "@/db/schema";
import { BeatGrid } from "@/components/beat-card";
import { listActiveServices, listBeats, listLicenseTypes } from "@/lib/catalog";
import { DELIVERABLE_LABELS, deliverableList, money, num } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MARQUEE = ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money", "Visa & Mastercard", "Instant email delivery", "Licensed & legal", "Recording · Mixing · Mastering"];

export default async function HomePage() {
  const [settings, featured, latest, services, licenseTypes, [beatCount], [licenseCount]] = await Promise.all([
    getSettings(),
    listBeats({ featured: true, limit: 8 }),
    listBeats({ limit: 8 }),
    listActiveServices(),
    listLicenseTypes(),
    db.select({ value: count() }).from(beats).where(eq(beats.isPublished, true)),
    db.select({ value: count() }).from(licenses),
  ]);
  const showcase = featured.length >= 4 ? featured : latest;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/hero.jpg" alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-linear-to-b from-ink/30 via-ink/70 to-ink" />
          <div className="hero-grid absolute inset-0" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 md:pb-28 md:pt-28">
          <p className="eyebrow">Beat store · Recording studio · {settings.location}</p>
          <h1 className="display mt-5 max-w-4xl text-5xl sm:text-7xl md:text-[6.5rem]">
            Beats that <span className="text-acid">move</span> the room.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/80">
            Original Afrobeats, Asakaa drill, Highlife and more — produced by {settings.siteName}. Pay with any mobile money network and your
            files plus license certificate land in your inbox in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/beats" className="btn-primary px-7! py-3.5! text-base">
              Browse beats
            </Link>
            <Link href="/studio" className="btn-ghost px-7! py-3.5! text-base">
              Book studio time
            </Link>
          </div>
          <dl className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-line/70 pt-8">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">Beats in store</dt>
              <dd className="display mt-1 text-3xl md:text-4xl">{beatCount.value}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">Licenses issued</dt>
              <dd className="display mt-1 text-3xl md:text-4xl">{licenseCount.value}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">Delivery</dt>
              <dd className="display mt-1 text-3xl text-acid md:text-4xl">Instant</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Marquee */}
      <div className="overflow-hidden border-y border-line bg-acid py-3 text-ink">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm font-black uppercase tracking-[0.2em]">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={i} className="flex items-center gap-10">
              {item} <span className="text-ink/50">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Featured beats */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Fresh from the lab</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Featured beats</h2>
          </div>
          <Link href="/beats" className="btn-ghost">
            View all beats →
          </Link>
        </div>
        <BeatGrid beats={showcase} currency={settings.currency} />
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-line bg-ink-2">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-2 max-w-2xl text-4xl md:text-5xl">From preview to your inbox in three taps.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Pick a beat & license",
                text: "Preview every beat in full, then choose Basic, Premium, Unlimited or Exclusive rights depending on your release plans.",
              },
              {
                n: "02",
                title: "Pay with Mobile Money",
                text: `MTN MoMo, Telecel Cash, AirtelTigo Money or card. A transparent ${num(settings.feePercent)}% service fee is shown before you pay — no hidden charges.`,
              },
              {
                n: "03",
                title: "Check your email",
                text: "Your download links, license key and a signed license certificate are emailed to you instantly. Keep it as proof of purchase.",
              },
            ].map((step) => (
              <div key={step.n} className="card p-7">
                <p className="display text-5xl text-acid">{step.n}</p>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Studio */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-4/3 overflow-hidden rounded-3xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/studio.jpg" alt="Meetbeatz recording studio" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-ink/70 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="eyebrow">The studio</p>
              <p className="display mt-1 text-3xl">{settings.location}</p>
            </div>
          </div>
          <div>
            <p className="eyebrow">Studio bookings</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Record. Mix. Master.</h2>
            <p className="mt-5 text-base leading-relaxed text-muted">
              Book time in the {settings.siteName} studio online. Choose a service, pick an open slot, pay the deposit with Mobile Money and
              your session is locked instantly — confirmation goes straight to your email.
            </p>
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {services.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-bold">{s.name}</p>
                    <p className="text-sm text-muted">{s.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black text-acid">{money(s.pricePerHour, settings.currency)}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted">per hour</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/studio" className="btn-primary mt-8 px-7! py-3.5! text-base">
              Check availability
            </Link>
          </div>
        </div>
      </section>

      {/* Licenses */}
      <section id="licenses" className="border-t border-line bg-ink-2">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="eyebrow">Licensing</p>
          <h2 className="display mt-2 text-4xl md:text-5xl">Pick the rights you need.</h2>
          <p className="mt-4 max-w-2xl text-sm text-muted">
            Prices shown are starting prices — each beat has its own pricing. Every purchase comes with a license certificate you can show to
            distributors, labels and streaming platforms.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {licenseTypes.map((lt) => (
              <div key={lt.id} className={`card flex flex-col p-6 ${lt.isExclusive ? "border-acid/50 bg-acid/5" : ""}`}>
                <p className="text-lg font-bold">{lt.name}</p>
                <p className="mt-1 text-xs text-muted">{lt.tagline}</p>
                <p className="mt-4 text-sm text-muted">from</p>
                <p className="display text-3xl text-acid">{money(lt.defaultPrice, settings.currency)}</p>
                <ul className="mt-5 space-y-1.5 text-sm text-cream/80">
                  {deliverableList(lt.deliverables).map((d) => (
                    <li key={d}>✓ {DELIVERABLE_LABELS[d] ?? d}</li>
                  ))}
                  {lt.isExclusive && <li>✓ Beat removed from store</li>}
                </ul>
                <p className="mt-4 flex-1 text-xs leading-relaxed text-muted">{lt.description}</p>
                <Link href="/beats" className={`${lt.isExclusive ? "btn-primary" : "btn-ghost"} mt-6`}>
                  Browse beats
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-panel px-8 py-14 text-center md:px-16">
          <div className="hero-grid absolute inset-0" />
          <div className="relative">
            <p className="eyebrow">Ready when you are</p>
            <h2 className="display mx-auto mt-3 max-w-3xl text-4xl md:text-6xl">Your next hit starts with the right beat.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/beats" className="btn-primary px-7! py-3.5! text-base">
                Shop beats
              </Link>
              <Link href="/studio" className="btn-ghost px-7! py-3.5! text-base">
                Book the studio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
