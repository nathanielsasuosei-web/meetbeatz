"use client";

import Link from "next/link";
import { CoverArt } from "@/components/beat-card";
import { Equalizer, PauseIcon, PlayIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-context";
import type { BeatCardData } from "@/lib/catalog";
import { money } from "@/lib/format";
import { toTrack } from "@/lib/track";

/**
 * The store as a tracklist: one row per beat, numbered, with the preview button,
 * key facts and price on the row. Complements the card grid — the same beats,
 * readable at a glance and quick to scrub through.
 */
export function BeatList({ beats, currency, startAt = 1, className = "" }: { beats: BeatCardData[]; currency: string; startAt?: number; className?: string }) {
  const { toggle, isCurrent, playing } = usePlayer();

  if (beats.length === 0) {
    return <div className="card p-10 text-center text-sm text-muted">No beats match that search yet. Check back soon — new drops every week.</div>;
  }

  const queue = beats.map(toTrack);

  return (
    <ol className={`beat-list ${className}`} start={startAt}>
      {beats.map((beat, i) => {
        const active = isCurrent(beat.id);
        const isPlaying = active && playing;
        return (
          <li key={beat.id} className={`beat-row ${active ? "is-active" : ""}`}>
            <span className="beat-row-n" aria-hidden="true">
              {isPlaying ? <Equalizer /> : String(startAt + i).padStart(2, "0")}
            </span>

            <button
              type="button"
              onClick={() => toggle(toTrack(beat), queue)}
              className="beat-row-play"
              aria-label={isPlaying ? `Pause ${beat.title}` : `Play ${beat.title}`}
            >
              {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
            </button>

            <Link href={`/beats/${beat.slug}`} className="beat-row-cover" tabIndex={-1} aria-hidden="true">
              <CoverArt beat={beat} />
            </Link>

            <div className="beat-row-main">
              <Link href={`/beats/${beat.slug}`} className="beat-row-title">
                {beat.title}
              </Link>
              <p className="beat-row-sub">
                {[beat.genre, beat.bpm ? `${beat.bpm} BPM` : null, beat.musicalKey, beat.mood].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="beat-row-meta">
              {beat.isFeatured && <span className="badge-acid">Featured</span>}
              {beat.isDemo && <span className="badge">Demo</span>}
              <span className="beat-row-plays tabular-nums" title="Full preview plays">
                ▶ {beat.plays.toLocaleString("en-US")}
              </span>
            </div>

            <div className="beat-row-price">
              <span className="text-[10px] uppercase tracking-wider text-muted">from</span>
              <span className="block font-bold text-acid">{beat.priceFrom !== null ? money(beat.priceFrom, currency) : "—"}</span>
            </div>

            <Link href={`/beats/${beat.slug}`} className="beat-row-buy">
              Buy
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
