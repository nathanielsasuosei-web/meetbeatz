"use client";

import Link from "next/link";
import { usePlayer } from "./player-context";
import { PlayIcon, PauseIcon, SkipIcon } from "@/components/icons";

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerBar() {
  const { current, playing, progress, duration, currentTime, toggle, seek, next, prev } = usePlayer();
  if (!current) return null;

  return (
    <>
      <div className="h-24" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/90 backdrop-blur-xl">
        <button
          type="button"
          aria-label="Seek"
          className="group relative block h-1.5 w-full cursor-pointer bg-line"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - rect.left) / rect.width);
          }}
        >
          <span className="absolute inset-y-0 left-0 bg-acid" style={{ width: `${progress * 100}%` }} />
        </button>
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href={current.href} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-panel-2">
              {current.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-acid/40 to-ink" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{current.title}</p>
              <p className="truncate text-xs text-muted">{current.subtitle}</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button type="button" onClick={prev} className="hidden rounded-full p-2 text-muted hover:text-cream sm:block" aria-label="Previous">
              <SkipIcon className="h-5 w-5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => toggle()}
              className="grid h-11 w-11 place-items-center rounded-full bg-acid text-ink transition hover:bg-acid-2"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
            </button>
            <button type="button" onClick={next} className="hidden rounded-full p-2 text-muted hover:text-cream sm:block" aria-label="Next">
              <SkipIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="hidden w-24 text-right font-mono text-xs text-muted md:block">
            {fmt(currentTime)} / {fmt(duration)}
          </div>
          <Link href={current.href} className="btn-primary hidden !px-4 !py-2 text-xs sm:inline-flex">
            Get this beat
          </Link>
        </div>
      </div>
    </>
  );
}
