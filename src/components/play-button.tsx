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
      className={`inline-flex items-center gap-2 rounded-full bg-acid font-bold text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-4px_rgba(198,241,53,0.5),0_4px_12px_-2px_rgba(0,0,0,0.4)] transition hover:scale-[1.02] hover:bg-acid-2 ${className}`}
      aria-label={isPlaying ? "Pause preview" : "Play preview"}
    >
      {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
      {label && <span>{isPlaying ? "Pause preview" : label}</span>}
    </button>
  );
}
