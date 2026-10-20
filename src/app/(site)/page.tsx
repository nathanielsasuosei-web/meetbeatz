import Link from "next/link";
import Image from "next/image";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats, licenses, soundKits } from "@/db/schema";
import { BeatList } from "@/components/beat-card";
import { DownloadIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { listBeats } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { formatBytes } from "@/lib/upload-rules";
import { HeroWave } from "@/components/hero-wave";

export const dynamic = "force-dynamic";

const MARQUEE = ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money", "Visa & Mastercard", "Instant email delivery", "Licensed & legal", "Recording · Mixing · Mastering"];

export default async function HomePage() {
  const [settings, featured, latest, [beatCount], [licenseCount], publicKits] = await Promise.all([
    getSettings(),
    listBeats({ featured: true, limit: 8 }),
    listBeats({ limit: 8 }),
    db.select({ value: count() }).from(beats).where(eq(beats.isPublished, true)),
    db.select({ value: count() }).from(licenses),
    db.select().from(soundKits).where(eq(soundKits.isPublished, true)).orderBy(desc(soundKits.createdAt)).limit(4),
  ]);
  const showcase = featured.length >= 4 ? featured : latest;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/meetbeatz-producer.jpeg" alt="" className="h-full w-full object-cover object-[center_30%] opacity-50" />
          <div className="red-glass-wash absolute inset-0" />
          <div className="hero-grid absolute inset-0" />
          <div className="liquid-orbs absolute inset-0">
            <span />
            <span />
            <span />
          </div>
          <HeroWave />
        </div>
        <div className="hero-copy relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 md:pb-28 md:pt-28">
          <div className="glass inline-flex rounded-full px-4 py-1.5">
            <p className="eyebrow !tracking-[0.18em]">Beat store · Recording studio · {settings.location}</p>
          </div>
          <h1 className="mt-6">
            <Image
              src="/images/logo.png"
              alt={`${settings.siteName} logo`}
              width={128}
              height={128}
              priority
              className="hero-logo h-16 w-16 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.5)] sm:h-24 sm:w-24 md:h-32 md:w-32"
            />
            <span className="sr-only">{settings.siteName}</span>
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/beats" className="btn-primary px-7! py-3.5! text-base">
              Browse beats
            </Link>
            <Link href="/sound-kits" className="btn-ghost px-7! py-3.5! text-base">
              Sound Kits
            </Link>
            <Link href="/studio" className="btn-ghost px-7! py-3.5! text-base">
              Book studio time
            </Link>
          </div>
          <dl className="hero-stats glass mt-14 grid max-w-2xl grid-cols-3 gap-6 rounded-2xl p-6">
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
      <div className="glass-marquee py-3">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm font-black uppercase tracking-[0.2em]">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={i} className="flex items-center gap-10">
              {item} <span className="text-ink/50">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Featured beats */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Fresh from the lab</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Featured beats</h2>
          </div>
          <Link href="/beats" className="btn-ghost">
            View all beats →
          </Link>
        </div>
        <Reveal target=".card" stagger={90}>
          <BeatList beats={showcase} currency={settings.currency} />
        </Reveal>
      </section>

      {publicKits.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Free downloads</p>
              <h2 className="display mt-2 text-4xl md:text-5xl">Sound Kits</h2>
            </div>
            <Link href="/sound-kits" className="btn-ghost">
              View all kits →
            </Link>
          </div>
          <Reveal className="grid gap-4 md:grid-cols-2" target=".card" stagger={90}>
            {publicKits.map((kit) => (
              <article key={kit.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold">{kit.name}</h3>
                  {kit.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{kit.description}</p> : null}
                  <p className="mt-2 text-xs text-muted">
                    {formatBytes(kit.fileSize)} · {formatDate(kit.createdAt)}
                  </p>
                </div>
                <a href={`/api/sound-kits/${kit.id}`} className="btn-primary shrink-0" download>
                  <DownloadIcon className="h-4 w-4" />
                  Download
                </a>
              </article>
            ))}
          </Reveal>
        </section>
      )}
    </>
  );
}
