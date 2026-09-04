"use client";

import { usePlayer, type Track } from "./player/player-context";
import { PauseIcon, PlayIcon } from "./icons";

export function PlayButton({ track, className = "", label }: { track: Track; className?: string; label?: string }) {
  const { toggle, isCurrent, playing } = usePlayer();
  const isPlaying = isCurrent(track.id) && playing;
  return (
    <button
      type="button"
      onClick={() => toggle(track)}
      className={`inline-flex items-center gap-2 rounded-full bg-acid font-bold text-ink transition hover:bg-acid-2 ${className}`}
      aria-label={isPlaying ? "Pause preview" : "Play preview"}
    >
      {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
      {label && <span>{isPlaying ? "Pause preview" : label}</span>}
    </button>
  );
}
