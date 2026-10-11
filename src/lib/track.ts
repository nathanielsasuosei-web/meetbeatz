import type { Track } from "@/components/player/player-context";
import type { BeatCardData } from "./catalog";

export function toTrack(beat: BeatCardData): Track {
  return {
    id: beat.id,
    title: beat.title,
    subtitle: [beat.genre, beat.bpm ? `${beat.bpm} BPM` : null, beat.musicalKey].filter(Boolean).join(" · "),
    cover: beat.cover,
    // Cards without a tagged preview remain listed, but the UI does not offer
    // play. The empty fallback keeps Track's browser-audio type strict.
    src: beat.previewUrl ?? "",
    href: `/beats/${beat.slug}`,
  };
}
