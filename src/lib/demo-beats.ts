import fs from "fs";
import os from "os";
import path from "path";
import { synthBeat, type SynthOptions } from "./audio-synth";

/**
 * Demo beats shipped with the store. The audio is generated procedurally by
 * ./audio-synth so a fresh install is playable before Meetbeatz uploads real beats.
 *
 * The WAV files live in ./uploads when the filesystem is writable. On read-only
 * hosts (Vercel functions) the demo audio is synthesized on demand and cached in
 * the OS temp folder instead, so previews and purchases still work.
 */
export type DemoBeat = {
  title: string;
  slug: string;
  genre: string;
  mood: string;
  bpm: number;
  musicalKey: string;
  tags: string;
  description: string;
  synth: SynthOptions;
  cover: string;
  featured: boolean;
};

export const DEMO_BEATS: DemoBeat[] = [
  {
    title: "Midnight in Osu",
    slug: "midnight-in-osu",
    genre: "Afrobeats",
    mood: "Smooth",
    bpm: 102,
    musicalKey: "F# minor",
    tags: "afrobeats, wizkid type beat, burna boy, smooth",
    description: "Late-night Afrobeats groove with rolling log drums, warm keys and a bassline that sits deep in the pocket.",
    synth: { bpm: 102, rootHz: 92.5, minor: true, seed: 11, style: "afro" },
    cover: "/images/covers/demo-1.jpg",
    featured: true,
  },
  {
    title: "Kumasi Drill",
    slug: "kumasi-drill",
    genre: "Asakaa / Drill",
    mood: "Dark",
    bpm: 142,
    musicalKey: "C minor",
    tags: "asakaa, drill, kumerica, dark, sliding 808",
    description: "Hard-hitting Asakaa drill with sliding 808s, eerie bells and skipping hi-hats built for the streets of Kumasi.",
    synth: { bpm: 142, rootHz: 65.4, minor: true, seed: 23, style: "drill" },
    cover: "/images/covers/demo-2.jpg",
    featured: true,
  },
  {
    title: "Sunday Highlife",
    slug: "sunday-highlife",
    genre: "Highlife",
    mood: "Uplifting",
    bpm: 118,
    musicalKey: "G major",
    tags: "highlife, guitar, uplifting, kuami eugene type beat",
    description: "Feel-good highlife with palm-wine guitars, bright horns and a bounce made for weddings and Sunday afternoons.",
    synth: { bpm: 118, rootHz: 98, minor: false, seed: 37, style: "highlife" },
    cover: "/images/covers/demo-3.jpg",
    featured: true,
  },
];

export function demoAudioFileName(slug: string): string {
  return `demo-${DEMO_BEATS.findIndex((demo) => demo.slug === slug) + 1}.wav`;
}

export function demoBeatBySlug(slug: string | null | undefined): DemoBeat | null {
  if (!slug) return null;
  return DEMO_BEATS.find((demo) => demo.slug === slug) ?? null;
}

const cache = new Map<string, Buffer>();

/** Synthesized WAV for a demo beat (deterministic, cached in memory). */
export function demoAudioBuffer(slug: string | null | undefined): Buffer | null {
  const demo = demoBeatBySlug(slug);
  if (!demo) return null;
  const cached = cache.get(demo.slug);
  if (cached) return cached;
  const buffer = synthBeat(demo.synth);
  cache.set(demo.slug, buffer);
  return buffer;
}

/**
 * Last-resort source for demo audio: writes the generated WAV to the OS temp
 * folder (always writable) and returns its path, or null for non-demo beats.
 */
export function demoAudioTempPath(slug: string | null | undefined): string | null {
  const demo = demoBeatBySlug(slug);
  const buffer = demoAudioBuffer(slug);
  if (!demo || !buffer) return null;
  const file = path.join(os.tmpdir(), `meetbeatz-${demo.slug}.wav`);
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size !== buffer.length) {
      fs.writeFileSync(file, buffer);
    }
    return file;
  } catch {
    return null;
  }
}
