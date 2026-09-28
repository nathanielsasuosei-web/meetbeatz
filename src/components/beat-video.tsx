"use client";

import { useRef } from "react";
import { recordBeatPlay } from "@/lib/record-beat-play";

export function BeatVideo({ beatId, src, poster }: { beatId: number; src: string; poster: string | null }) {
  const counted = useRef(false);
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- producer preview clip, no caption track
    <video
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      className="aspect-video w-full rounded-3xl border border-line bg-black object-cover"
      onPlaying={() => {
        if (counted.current) return;
        counted.current = true;
        recordBeatPlay(beatId);
      }}
      onEnded={() => {
        counted.current = false;
      }}
    >
      Your browser does not support embedded video.
    </video>
  );
}
