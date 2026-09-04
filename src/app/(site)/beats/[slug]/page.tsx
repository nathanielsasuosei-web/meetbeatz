import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BeatGrid, CoverArt } from "@/components/beat-card";
import { LicensePicker } from "@/components/license-picker";
import { PlayButton } from "@/components/play-button";
import { getBeatBySlug, listBeats, toCard } from "@/lib/catalog";
import { num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { toTrack } from "@/lib/track";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBeatBySlug(slug);
  return { title: data ? `${data.beat.title} — ${data.beat.genre || "Beat"}` : "Beat" };
}

export default async function BeatDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getBeatBySlug(slug);
  if (!data || (!data.beat.isPublished && !data.beat.exclusiveSold)) notFound();
  const { beat, licenses } = data;
  const settings = await getSettings();
  const card = toCard(beat, licenses[0]?.price ?? null);
  const related = (await listBeats({ genre: beat.genre || undefined, limit: 5 })).filter((b) => b.id !== beat.id).slice(0, 4);
  const tags = beat.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Link href="/beats" className="text-sm font-semibold text-muted hover:text-cream">
        ← Back to all beats
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-panel-2">
            <CoverArt beat={card} />
            {!beat.exclusiveSold && (
              <div className="absolute bottom-5 left-5">
                <PlayButton track={toTrack(card)} className="px-5 py-3 shadow-2xl" label="Play preview" />
              </div>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              ["BPM", beat.bpm ? String(beat.bpm) : "—"],
              ["Key", beat.musicalKey || "—"],
              ["Mood", beat.mood || "—"],
            ].map(([k, v]) => (
              <div key={k} className="card px-3 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className="mt-1 truncate text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {beat.genre && <span className="badge-acid">{beat.genre}</span>}
            {beat.isDemo && <span className="badge">Demo beat</span>}
            {beat.exclusiveSold && <span className="badge !border-danger/40 !text-danger">Exclusive rights sold</span>}
          </div>
          <h1 className="display mt-4 text-5xl md:text-6xl">{beat.title}</h1>
          <p className="mt-2 text-sm text-muted">Prod. by {settings.siteName}</p>
          {beat.description && <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/80">{beat.description}</p>}
          {tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Link key={t} href={`/beats?q=${encodeURIComponent(t)}`} className="badge hover:border-cream/40">
                  #{t}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-10">
            <p className="eyebrow">Choose your license</p>
            <h2 className="mt-2 text-2xl font-bold">Licensing options</h2>
            <div className="mt-5">
              {beat.exclusiveSold ? (
                <div className="card p-6 text-sm text-muted">
                  Exclusive rights to this beat have been sold, so it is no longer available for licensing.{" "}
                  <Link href="/beats" className="font-semibold text-acid">
                    Browse other beats →
                  </Link>
                </div>
              ) : (
                <LicensePicker beatSlug={beat.slug} licenses={licenses} feePercent={num(settings.feePercent)} currency={settings.currency} />
              )}
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <p className="eyebrow">More like this</p>
          <h2 className="display mt-2 text-3xl">Similar beats</h2>
          <div className="mt-6">
            <BeatGrid beats={related} currency={settings.currency} />
          </div>
        </section>
      )}
    </div>
  );
}
