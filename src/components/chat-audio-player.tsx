"use client";

import { useRef, useState } from "react";
import { DownloadIcon, Equalizer, MicIcon, PauseIcon, PlayIcon } from "./icons";

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function ChatAudioPlayer({
  url,
  kind = "audio",
  name,
}: {
  url: string;
  kind?: "voice" | "audio" | null;
  name?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isVoice = kind === "voice";
  const label = name || (isVoice ? "Voice audio" : "Audio track");
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    const next = (Number(e.target.value) / 100) * duration;
    el.currentTime = next;
    setCurrentTime(next);
  }

  return (
    <div className="my-1.5 min-w-[14.5rem] max-w-full rounded-xl border border-white/15 bg-black/25 p-2.5">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#25d366] text-[#062b1b] shadow transition hover:bg-[#39dc78]"
        >
          {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4 translate-x-[1px]" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-bold text-white/95">
              {isVoice ? (
                <MicIcon className="h-3.5 w-3.5 shrink-0 text-[#39dc78]" />
              ) : (
                <span className="text-xs leading-none text-[#39dc78]" aria-hidden>
                  ♫
                </span>
              )}
              <span className="truncate">{label}</span>
            </span>
            {playing && <Equalizer className="h-3 shrink-0 text-[#39dc78]" />}
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={progress}
              onChange={handleSeek}
              aria-label={`Seek ${label}`}
              className="h-1.5 w-full cursor-pointer accent-[#25d366]"
            />
            <span className="shrink-0 font-mono text-[10px] text-white/75">
              {playing || currentTime > 0 ? formatClock(currentTime) : duration > 0 ? formatClock(duration) : "0:00"}
            </span>
          </div>
        </div>

        <a
          href={url}
          download={label}
          title={`Download ${label}`}
          aria-label={`Download ${label}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <DownloadIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
