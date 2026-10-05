import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats, licenses } from "@/db/schema";
import { DownloadIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { listActiveServices } from "@/lib/catalog";
import { money } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet the producer behind Meetbeatz: original Afrobeats, Asakaa drill and Highlife beats, in-house recording, mixing and mastering, and a studio built for artists in Accra, Ghana.",
};

export const dynamic = "force-dynamic";

const VALUES = [
  {
    title: "Original, always",
    text: "Every beat is written, arranged and mixed in-house by Meetbeatz. Nothing is resold, recycled from a loop pack or claimed from someone else's catalogue — the composition comes off the keyboard in our control room.",
  },
  {
    title: "One-to-one, from start to finish",
    text: "There is no middleman between you and the producer. The person who made the beat is the person who answers the questions, records your vocals and sits in the mix, so nothing gets lost in translation.",
  },
  {
    title: "Pricing you can see",
    text: "Prices and the transparent service fee are shown on every beat page and again at checkout before you approve anything. No surprise deductions, no hidden handling charge, no pay-to-unlock surprise.",
  },
  {
    title: "Rights that hold up",
    text: "Each purchase comes with a license certificate with a unique key covering the beat, tier and usage. Distributors, labels and streaming platforms accept it, and we keep a record so you never have to prove ownership alone.",
  },
];

export default async function AboutPage() {
  const [settings, services, [beatCount], [licenseCount]] = await Promise.all([
    getSettings(),
    listActiveServices(),
    db.select({ value: count() }).from(beats).where(eq(beats.isPublished, true)),
    db.select({ value: count() }).from(licenses),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/studio.jpg" alt="" className="h-full w-full object-cover object-center opacity-40" />
          <div className="red-glass-wash absolute inset-0" />
          <div className="liquid-orbs absolute inset-0">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-24">
          <div className="glass inline-flex rounded-full px-4 py-1.5">
            <p className="eyebrow !tracking-[0.18em]">About · {settings.location}</p>
          </div>
          <h1 className="display mt-5 max-w-3xl text-4xl sm:text-5xl md:text-7xl">
            Beats built from scratch. Sessions built around artists.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/80 sm:text-lg">
            {settings.siteName} is a producer, mixing engineer and recording studio all in one place — writing original Afrobeats, Asakaa drill,
            Highlife and everything in between, then helping artists turn those beats into finished records.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/beats" className="btn-primary !px-7 !py-3.5 text-base">
              Browse the beats
            </Link>
            <Link href="/studio" className="btn-ghost !px-7 !py-3.5 text-base">
              Book studio time
            </Link>
          </div>
        </div>
      </section>

      {/* By the numbers */}
      <section className="glass-section">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            { label: "Beats in the store", value: String(beatCount.value) },
            { label: "Licenses issued", value: String(licenseCount.value) },
            { label: "Studio services", value: String(services.length) },
            { label: "Delivery", value: "Instant" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="display text-3xl text-acid drop-shadow-[0_0_18px_rgba(198,241,53,0.3)] sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we do */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
        <p className="eyebrow">What we do</p>
        <h2 className="display mt-2 max-w-2xl text-3xl sm:text-4xl md:text-5xl">Three ways to work with the studio.</h2>
        <Reveal className="mt-10 grid gap-5 md:grid-cols-3" target=".card" stagger={90}>
          <article className="card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-acid">01 · Beat store</p>
            <h3 className="mt-3 text-xl font-bold">Buy original beats</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Preview everything in full, pick the license that matches your release plan and pay with Mobile Money or card. The tagless files,
              stems where your tier includes them, and your license certificate arrive by email in seconds.
            </p>
            <Link href="/beats" className="mt-5 inline-block text-sm font-bold text-acid hover:underline">
              Open the beat store →
            </Link>
          </article>
          <article className="card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-acid">02 · Studio</p>
            <h3 className="mt-3 text-xl font-bold">Record, mix, master</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Book the room online and bring your song to life — vocal recording in a treated booth, then mixing and mastering to a loud,
              streaming-ready finish for Spotify, Apple Music, Boomplay and Audiomack.
            </p>
            <Link href="/studio" className="mt-5 inline-block text-sm font-bold text-acid hover:underline">
              See availability →
            </Link>
          </article>
          <article className="card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-acid">03 · Always free</p>
            <h3 className="mt-3 text-xl font-bold">Sound kits</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Start something with our free sound kits. Download the packs, drop them in your DAW and use the sounds in your own productions —
              royalty-free, no credit needed, no strings.
            </p>
            <Link href="/sound-kits" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-acid hover:underline">
              <DownloadIcon className="h-4 w-4" />
              Get the kits →
            </Link>
          </article>
        </Reveal>
      </section>

      {/* Meet the producer */}
      <section className="glass-section">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="relative aspect-4/5 overflow-hidden rounded-3xl border border-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_20px_60px_-20px_rgba(0,0,0,0.6)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/meetbeatz-producer.jpeg" alt={`${settings.siteName} in the control room`} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-transparent to-white/5" />
            <div className="glass absolute bottom-5 left-5 right-5 rounded-2xl p-4">
              <p className="eyebrow">The man behind the boards</p>
              <p className="display mt-1 text-2xl sm:text-3xl">{settings.siteName}</p>
            </div>
          </div>

          <div>
            <p className="eyebrow">Meet the producer</p>
            <h2 className="display mt-2 text-3xl sm:text-4xl md:text-5xl">Built on feel. Mixed with intent.</h2>
            <p className="mt-5 text-base leading-relaxed text-muted">
              {settings.siteName} is a producer and mixing engineer out of {settings.location}. The sound sits where the city does: rolling Afrobeats
              log drums and warm keys, the sliding 808s and eerie bells of Asakaa drill, palm-wine highlife guitars, and the amapiano-inflected
              bounce that keeps a room moving.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Every beat starts from a blank session — chords first, then the drum pattern that gives the song its swagger, then a bassline written to
              leave space for a voice. When the mix is right, the beat is bounced tagless and uploaded here the same week, so what is in the store is
              what the studio is working on right now.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted">
              The same ear goes into sessions. Recording is about capturing a performance, not a perfect take: the room is treated, the signal chain is
              clean, and the session is run so you can hear yourself properly and actually enjoy the process. Mixing and mastering then make it
              translate — phone speaker, car, club, streaming, all of it.
            </p>

            <ul className="glass mt-8 grid gap-px overflow-hidden rounded-2xl text-sm sm:grid-cols-2">
              {[
                ["Based in", settings.location],
                ["Produces", "Afrobeats · Asakaa · Highlife · Amapiano"],
                ["Works with", "Independent artists, labels & managers"],
                ["Engineer's rule", "If it doesn't move you, it doesn't ship"],
              ].map(([label, value]) => (
                <li key={label} className="bg-white/[0.02] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{label}</p>
                  <p className="mt-1 font-semibold text-cream/90">{value}</p>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/beats" className="btn-primary !px-6 !py-3">
                Hear the beats
              </Link>
              <Link href="/contact" className="btn-ghost !px-6 !py-3">
                Say hello
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The studio */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <p className="eyebrow">The studio</p>
            <h2 className="display mt-2 text-3xl sm:text-4xl md:text-5xl">A room that treats artists like artists.</h2>
            <p className="mt-5 text-base leading-relaxed text-muted">
              Sessions are run out of a treated room with a separate vocal booth, reference monitors and a signal chain that stays out of the way of
              the performance. You get an engineer at the desk for the whole session, honest feedback on the take, and a rough mix to take home so you
              hear where the song is going.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-cream/80">
              {[
                "Treated live room and vocal booth with headphone monitoring for the artist.",
                "Vocal recording with an engineer at the desk — no timer anxiety, no take limits.",
                "Mixing and mastering in-house, delivered as streaming-ready files.",
                "Session notes and stems organised so your song is easy to come back to.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 text-acid">✦</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <p className="eyebrow">Session rates</p>
              <ul className="glass mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl">
                {services.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-bold">{s.name}</p>
                      <p className="text-xs text-muted">
                        {s.minHours}–{s.maxHours} hrs · {s.depositPercent}% deposit
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-black text-acid">
                      {money(s.pricePerHour, settings.currency)}
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">per hour</span>
                    </p>
                  </li>
                ))}
              </ul>
              <Link href="/studio" className="btn-primary mt-6 !px-6 !py-3">
                Check availability
              </Link>
            </div>
          </div>

          <div className="relative order-1 aspect-4/3 overflow-hidden rounded-3xl border border-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_20px_60px_-20px_rgba(0,0,0,0.6)] lg:order-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/studio.jpg" alt={`${settings.siteName} recording studio`} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-white/5" />
            <div className="glass absolute bottom-5 left-5 right-5 rounded-2xl p-4 sm:right-auto">
              <p className="eyebrow">Recording · Mixing · Mastering</p>
              <p className="display mt-1 text-xl sm:text-2xl">The {settings.siteName} room</p>
            </div>
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="glass-section">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
          <p className="eyebrow">How we work</p>
          <h2 className="display mt-2 max-w-2xl text-3xl sm:text-4xl md:text-5xl">Four promises that do not change.</h2>
          <Reveal className="mt-10 grid gap-5 sm:grid-cols-2" target=".card" stagger={80}>
            {VALUES.map((v, i) => (
              <article key={v.title} className="card p-6">
                <p className="display text-4xl text-acid/80">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.text}</p>
              </article>
            ))}
          </Reveal>
          <div className="glass mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
            <div>
              <p className="font-bold">Want the fine print before you buy?</p>
              <p className="mt-1 text-sm text-muted">
                The licensing guide explains every tier, and the legal pages cover privacy, terms and refunds in plain language.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/licensing" className="btn-primary">
                Licensing guide
              </Link>
              <Link href="/terms" className="btn-ghost">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
        <div className="glass-strong relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-10 md:px-16 md:py-14">
          <div className="liquid-orbs absolute inset-0 opacity-70">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-grid absolute inset-0" />
          <div className="relative">
            <p className="eyebrow">Work with {settings.siteName}</p>
            <h2 className="display mx-auto mt-3 max-w-3xl text-3xl sm:text-4xl md:text-6xl">
              Find the beat. Book the room. Finish the song.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/beats" className="btn-primary !px-7 !py-3.5 text-base">
                Shop beats
              </Link>
              <Link href="/studio" className="btn-ghost !px-7 !py-3.5 text-base">
                Book the studio
              </Link>
              <Link href="/contact" className="btn-ghost !px-7 !py-3.5 text-base">
                Contact us
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs text-muted">
              Prefer a quick answer? Call or message {settings.contactPhone} — we reply to every enquiry within one business day.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
