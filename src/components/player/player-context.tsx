"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Track = {
  id: number;
  title: string;
  subtitle: string;
  cover: string | null;
  src: string;
  href: string;
};

type PlayerContextValue = {
  current: Track | null;
  playing: boolean;
  progress: number; // 0..1
  duration: number;
  currentTime: number;
  play: (track: Track, queue?: Track[]) => void;
  toggle: (track?: Track, queue?: Track[]) => void;
  pause: () => void;
  seek: (fraction: number) => void;
  next: () => void;
  prev: () => void;
  isCurrent: (id: number) => boolean;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const play = useCallback((track: Track, newQueue?: Track[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (newQueue) setQueue(newQueue);
    setCurrent((prev) => {
      if (!prev || prev.id !== track.id) {
        audio.src = track.src;
        setProgress(0);
        setCurrentTime(0);
      }
      return track;
    });
    void audio.play().catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(
    (track?: Track, newQueue?: Track[]) => {
      const audio = audioRef.current;
      if (!audio) return;
      const target = track ?? current;
      if (!target) return;
      if (current && current.id === target.id) {
        if (audio.paused) void audio.play().catch(() => setPlaying(false));
        else audio.pause();
      } else {
        play(target, newQueue);
      }
    },
    [current, play],
  );

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!current || queue.length === 0) return;
      const idx = queue.findIndex((t) => t.id === current.id);
      const nextIdx = (idx + dir + queue.length) % queue.length;
      play(queue[nextIdx]);
    },
    [current, queue, play],
  );

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      if (queue.length > 1) next();
      else setPlaying(false);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [queue, next]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      playing,
      progress,
      duration,
      currentTime,
      play,
      toggle,
      pause,
      seek,
      next,
      prev,
      isCurrent: (id: number) => current?.id === id,
    }),
    [current, playing, progress, duration, currentTime, play, toggle, pause, seek, next, prev],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
