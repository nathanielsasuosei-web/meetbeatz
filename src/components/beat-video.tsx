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
      // Capture hardening, matching the screen guard (see
      // src/components/screen-guard.tsx): no download or remote-playback entry in
      // the controls, and no picture-in-picture — a detached PiP window floats
      // above everything and is the easiest way to film a preview with a phone.
      controlsList="nodownload noremoteplayback noplaybackrate"
      disablePictureInPicture
      onContextMenu={(event) => event.preventDefault()}
      data-sg-protect=""
      className="aspect-video w-full rounded-3xl border border-white/15 bg-black object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_16px_48px_-16px_rgba(0,0,0,0.55)]"
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
