"use client";

import Link from "next/link";
import { usePlayer } from "./player/player-context";
import { Equalizer, PauseIcon, PlayIcon } from "./icons";
import type { BeatCardData } from "@/lib/catalog";
import { money } from "@/lib/format";
import { toTrack } from "@/lib/track";

export function CoverArt({ beat, className = "" }: { beat: { cover: string | null; title: string }; className?: string }) {
  return beat.cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={beat.cover} alt={beat.title} className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className={`grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(198,241,53,0.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(120,80,255,0.45),transparent_50%),#141417] ${className}`}>
      <span className="display px-4 text-center text-2xl text-cream/90">{beat.title}</span>
    </div>
  );
}

export function BeatCard({ beat, queue, currency }: { beat: BeatCardData; queue: BeatCardData[]; currency: string }) {
  const { toggle, isCurrent, playing } = usePlayer();
  const active = isCurrent(beat.id);
  const isPlaying = active && playing;

  return (
    <div className={`card group overflow-hidden transition hover:border-line-2 ${active ? "border-acid/50" : ""}`}>
      <div className="relative aspect-square overflow-hidden bg-panel-2">
        <Link href={`/beats/${beat.slug}`} className="block h-full w-full">
          <CoverArt beat={beat} className="transition duration-500 group-hover:scale-105" />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <button
          type="button"
          onClick={() => toggle(toTrack(beat), queue.map(toTrack))}
          className={`absolute bottom-3 left-3 grid h-12 w-12 place-items-center rounded-full bg-acid text-ink shadow-xl transition hover:scale-105 ${active ? "" : "sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"}`}
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
        >
          {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="absolute right-3 top-3 flex gap-1.5">
          {beat.isDemo && <span className="badge bg-black/60 backdrop-blur">Demo</span>}
          {beat.isFeatured && <span className="badge-acid bg-black/60 backdrop-blur">Featured</span>}
        </div>
        {isPlaying && (
          <div className="absolute bottom-5 right-3 text-acid">
            <Equalizer />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/beats/${beat.slug}`} className="block truncate text-base font-bold hover:text-acid">
              {beat.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted">
              {[beat.genre, beat.bpm ? `${beat.bpm} BPM` : null, beat.musicalKey].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted">from</p>
            <p className="text-sm font-bold text-acid">{beat.priceFrom !== null ? money(beat.priceFrom, currency) : "—"}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          {beat.mood ? <span className="badge">{beat.mood}</span> : <span />}
          <Link href={`/beats/${beat.slug}`} className="text-xs font-bold text-cream/80 hover:text-acid">
            Buy license →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function BeatGrid({ beats, currency }: { beats: BeatCardData[]; currency: string }) {
  if (beats.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-muted">No beats match that search yet. Check back soon — new drops every week.</div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {beats.map((b) => (
        <BeatCard key={b.id} beat={b} queue={beats} currency={currency} />
      ))}
    </div>
  );
}
