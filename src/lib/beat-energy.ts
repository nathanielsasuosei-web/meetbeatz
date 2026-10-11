"use client";

/**
 * Beat energy for the home hero's 3D orb.
 *
 * Two sources feed the same four numbers (`bass`, `mid`, `treble`, `level`, each
 * 0..1) so the orb is always moving:
 *
 *   1. The real thing — an AnalyserNode tapped onto the beat preview that the
 *      player bar is playing, so the orb genuinely pumps with the kick and the
 *      hats of whatever beat is on.
 *   2. A synthetic Afrobeats-ish pulse (~102 BPM, four-on-the-floor kick,
 *      off-beat hats) used before anything plays, when the analyser cannot be
 *      attached, and as a gentle idle breathing pattern.
 *
 * The tap is deliberately conservative. Routing an <audio> element through an
 * AudioContext means the element's own output is replaced by whatever the
 * context plays, so anything that goes wrong here is *audible* — the customer
 * taps play and hears nothing. Every failure therefore bails out before the
 * element is touched, and the orb silently falls back to the synthetic pulse:
 *
 *   - the clip has to be same-origin (a tainted MediaElementSource outputs
 *     silence, which would mute a cross-origin preview);
 *   - the context has to be running before we wire anything up (a suspended
 *     context is a silent context);
 *   - iOS is skipped entirely. Safari there has a long history of muting an
 *     element once it is connected to a context, and a muted store is a much
 *     worse outcome than a less literal visualiser.
 */

export type BeatEnergy = {
  /** Low end — kick and bass. */
  bass: number;
  /** Mids — melody, snares, vocals. */
  mid: number;
  /** Highs — hats and shakers. */
  treble: number;
  /** Weighted overall energy, the number to drive global scale/glow with. */
  level: number;
};

const FFT_SIZE = 2048;

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let wired: HTMLAudioElement | null = null;

const smoothed: BeatEnergy = { bass: 0, mid: 0, treble: 0, level: 0 };
let primed = false;

/** Safari on iOS can mute an element that is routed through an AudioContext. */
function tapIsRisky(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS;
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/**
 * Taps `element` with an analyser. Resolves true once frequency data is
 * readable. Safe to call repeatedly — the second call is a no-op — and returns
 * false (leaving the element untouched) whenever the tap cannot be made safely.
 */
export async function connectBeatEnergy(element: HTMLAudioElement): Promise<boolean> {
  if (analyser) return true;
  if (wired === element) return false;
  if (!element.src || tapIsRisky()) return false;

  try {
    if (new URL(element.src, window.location.href).origin !== window.location.origin) return false;
  } catch {
    return false;
  }

  const Ctor = audioContextCtor();
  if (!Ctor) return false;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return false;
  }

  try {
    if (ctx.state !== "running") await ctx.resume();
  } catch {
    /* resume() rejects when the page has no activation yet — handled below. */
  }
  if (ctx.state !== "running") {
    void ctx.close().catch(() => {});
    return false;
  }

  let node: AnalyserNode;
  let source: MediaElementAudioSourceNode;
  try {
    node = ctx.createAnalyser();
    node.fftSize = FFT_SIZE;
    node.smoothingTimeConstant = 0.7;
    // Past this line the element is routed through the graph, so the context
    // must stay open even if a later step fails.
    source = ctx.createMediaElementSource(element);
  } catch {
    void ctx.close().catch(() => {});
    return false;
  }

  source.connect(node);
  node.connect(ctx.destination);

  context = ctx;
  analyser = node;
  bins = new Uint8Array(node.frequencyBinCount);
  wired = element;
  return true;
}

function averageOf(data: Uint8Array<ArrayBuffer>, fromBin: number, toBin: number): number {
  const end = Math.min(toBin, data.length);
  let total = 0;
  for (let i = fromBin; i < end; i++) total += data[i];
  return end > fromBin ? total / (end - fromBin) / 255 : 0;
}

/**
 * Reads the current energy and smooths it. `dt` is the frame time in seconds so
 * the attack/release feel identical at 60 and 120 Hz.
 */
export function readBeatEnergy(elapsed: number, dt: number, playing: boolean): BeatEnergy {
  // Only listen to the analyser while something is actually playing: a paused
  // element's spectrum is silence, and the orb should drift rather than die.
  const live = playing && analyser && bins && context && context.state === "running";
  const target: BeatEnergy = live ? readSpectrum() : synthetic(elapsed, playing);

  // Fast attack so a kick is visible on the frame it lands, slower release so
  // the orb floats back down instead of flickering.
  const up = 1 - Math.exp(-dt / 0.045);
  const down = 1 - Math.exp(-dt / 0.24);
  const follow = (current: number, next: number) => current + (next - current) * (next > current ? up : down);

  smoothed.bass = follow(smoothed.bass, target.bass);
  smoothed.mid = follow(smoothed.mid, target.mid);
  smoothed.treble = follow(smoothed.treble, target.treble);
  smoothed.level = follow(smoothed.level, target.level * 0.45 + smoothed.bass * 0.3 + smoothed.mid * 0.25);

  if (!primed) {
    // First frame: start at the target instead of sliding up from zero.
    primed = true;
    smoothed.bass = target.bass;
    smoothed.mid = target.mid;
    smoothed.treble = target.treble;
    smoothed.level = target.level;
  }

  return smoothed;
}

/** Bin ranges are ~23 Hz wide at 48 kHz, so these read as bass / mids / highs. */
function readSpectrum(): BeatEnergy {
  analyser!.getByteFrequencyData(bins!);
  const data = bins!;
  const bass = clamp01(averageOf(data, 1, 9) / 0.5);
  const mid = clamp01(averageOf(data, 12, 90) / 0.38);
  const treble = clamp01(averageOf(data, 110, 340) / 0.28);
  return { bass, mid, treble, level: clamp01(bass * 0.5 + mid * 0.32 + treble * 0.18) };
}

function synthetic(elapsed: number, playing: boolean): BeatEnergy {
  if (!playing) {
    // Nothing playing: a slow sub-bass swell rolls under the sphere, so idle
    // reads as a red orb lit from below that breathes ~every 11 seconds —
    // louder than a frozen object, quieter than a beat.
    const swell = 0.5 + 0.5 * Math.sin(elapsed * 0.55);
    const drift = 0.5 + 0.5 * Math.sin(elapsed * 1.31 + 2);
    const bass = 0.3 + 0.32 * swell;
    const mid = 0.2 + 0.18 * drift;
    const treble = 0.14 + 0.12 * drift;
    return { bass: clamp01(bass), mid: clamp01(mid), treble: clamp01(treble), level: clamp01(bass * 0.5 + mid * 0.32 + treble * 0.18) };
  }

  // Playing, but with no analyser to listen to (see the note in readBeatEnergy):
  // a generic ~102 BPM Afrobeats pulse — four-on-the-floor kick, off-beat hats.
  const beats = (elapsed * 102) / 60;
  const kickPhase = beats - Math.floor(beats);
  const kick = Math.max(0, 1 - kickPhase * 3.6) ** 2;
  const hatPhase = (beats * 2) % 1;
  const hat = Math.max(0, 1 - hatPhase * 4.5) ** 2;
  const swell = 0.5 + 0.5 * Math.sin(elapsed * 0.5);
  const snare = 0.5 + 0.5 * Math.sin(elapsed * 1.7 + 1.1);

  const bass = 0.12 + 0.88 * kick;
  const mid = 0.24 + 0.5 * swell + 0.2 * snare;
  const treble = 0.1 + 0.85 * hat;
  return { bass: clamp01(bass), mid: clamp01(mid), treble: clamp01(treble), level: clamp01(bass * 0.5 + mid * 0.32 + treble * 0.18) };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
