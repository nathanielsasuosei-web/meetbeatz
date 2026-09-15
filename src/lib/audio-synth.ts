/**
 * Tiny procedural beat synthesizer used to generate demo previews so the store
 * is playable before Meetbeatz uploads real beats. Produces a 16-bit mono WAV.
 */
export type SynthOptions = {
  bpm: number;
  rootHz: number;
  minor?: boolean;
  seconds?: number;
  seed?: number;
  style?: "afro" | "drill" | "highlife";
};

const SAMPLE_RATE = 22050;

export function synthBeat(opts: SynthOptions): Buffer {
  const seconds = opts.seconds ?? 16;
  const n = SAMPLE_RATE * seconds;
  const out = new Float32Array(n);
  let s = (opts.seed ?? 7) >>> 0 || 7;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const step = 60 / opts.bpm / 4; // 16th note in seconds
  const style = opts.style ?? "afro";

  const kickPat =
    style === "drill"
      ? [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0]
      : style === "highlife"
        ? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
        : [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
  const snarePat =
    style === "drill"
      ? [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]
      : [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const hatPat =
    style === "drill"
      ? [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1]
      : style === "highlife"
        ? [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
        : [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
  const shakerPat = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

  const third = opts.minor ? 3 : 4;
  const bassSeq =
    style === "drill"
      ? [0, null, null, null, null, null, 0, null, null, null, -2, null, null, null, -4, null]
      : style === "highlife"
        ? [0, null, null, null, 7, null, null, null, 5, null, null, null, 7, null, null, null]
        : [0, null, null, 0, null, null, third, null, null, null, 5, null, null, 7, null, null];
  const semi = (k: number) => opts.rootHz * Math.pow(2, k / 12);

  const add = (startSec: number, durSec: number, fn: (t: number) => number, gain: number) => {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.min(Math.floor(durSec * SAMPLE_RATE), n - start);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      out[start + i] += fn(t) * gain;
    }
  };

  const totalSteps = Math.floor(seconds / step);
  for (let st = 0; st < totalSteps; st++) {
    const t0 = st * step;
    const i = st % 16;
    if (kickPat[i]) {
      add(t0, 0.35, (t) => Math.sin(2 * Math.PI * (45 + 110 * Math.exp(-t * 28)) * t) * Math.exp(-t * 9), 0.9);
    }
    if (snarePat[i]) {
      let prev = 0;
      add(
        t0,
        0.22,
        (t) => {
          const noise = rnd() * 2 - 1;
          const hp = noise - prev * 0.6;
          prev = noise;
          return (hp * 0.7 + Math.sin(2 * Math.PI * 190 * t) * 0.5) * Math.exp(-t * 22);
        },
        0.5,
      );
    }
    if (hatPat[i]) {
      const open = style === "drill" && i % 8 === 7;
      let prev = 0;
      add(
        t0,
        open ? 0.16 : 0.05,
        (t) => {
          const noise = rnd() * 2 - 1;
          const hp = noise - prev * 0.95;
          prev = noise;
          return hp * Math.exp(-t * (open ? 25 : 70));
        },
        0.22,
      );
    }
    if (shakerPat[i] && style !== "drill") {
      add(t0 + step * 0.5, 0.04, () => (rnd() * 2 - 1) * 0.5, 0.08);
    }
    const note = bassSeq[i];
    if (note !== null && note !== undefined) {
      let len = 1;
      while (len < 8 && (bassSeq[(i + len) % 16] === null || bassSeq[(i + len) % 16] === undefined)) len++;
      const f = semi(note) / (style === "drill" ? 2 : 1);
      add(
        t0,
        step * len,
        (t) => {
          const glide = style === "drill" ? f * (1 + 0.04 * Math.exp(-t * 6)) : f;
          const saw = 2 * ((t * glide) % 1) - 1;
          return (Math.sin(2 * Math.PI * glide * t) * 0.8 + saw * 0.25) * Math.exp(-t * 2.2);
        },
        0.45,
      );
    }
  }

  // Slow chord pad (root, third, fifth) with tremolo for atmosphere
  const chord = [0, third, 7, 12].map(semi);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const f of chord) v += Math.sin(2 * Math.PI * f * 2 * t + Math.sin(t * 0.7) * 0.4);
    const trem = 0.6 + 0.4 * Math.sin(2 * Math.PI * (opts.bpm / 60 / 2) * t);
    out[i] += (v / chord.length) * 0.16 * trem;
  }

  // Fade in/out to avoid clicks, then normalize
  const fade = Math.floor(SAMPLE_RATE * 0.02);
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 0 ? 0.92 / peak : 1;

  const dataBytes = n * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, out[i] * norm));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * Fixed synth parameters for the seeded demo beats, keyed by slug.
 * Used twice: by the seeder to write preview files where the filesystem is
 * writable, and by the preview API to regenerate the identical audio in
 * memory where it isn't (serverless). Keep in sync with DEMO_BEATS in seed.ts.
 */
export const DEMO_SYNTH_BY_SLUG: Record<string, SynthOptions> = {
  "midnight-in-osu": { bpm: 102, rootHz: 92.5, minor: true, seed: 11, style: "afro" },
  "kumasi-drill": { bpm: 142, rootHz: 65.4, minor: true, seed: 23, style: "drill" },
  "sunday-highlife": { bpm: 118, rootHz: 98, minor: false, seed: 37, style: "highlife" },
};

/** Synth parameters for a demo beat, with a sensible fallback for unknown slugs. */
export function synthOptionsFor(slug: string, bpm: number | null): SynthOptions {
  return (
    DEMO_SYNTH_BY_SLUG[slug] ?? {
      bpm: bpm ?? 120,
      rootHz: 98,
      minor: true,
      seed: 7,
      style: "afro" as const,
    }
  );
}
