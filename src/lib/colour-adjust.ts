/**
 * Canvas colour grading for cover artwork.
 *
 * Pure functions over an `HTMLImageElement` so the same code drives the live
 * preview and the full-resolution export — a grade that looks right on screen
 * must come out of the downloaded file identically, and the only way to
 * guarantee that is to render both through one path.
 *
 * Everything runs in the browser. The artwork never leaves the machine, which
 * is both the privacy answer ("we cannot see your unreleased cover") and the
 * cost answer (no image processing on a serverless function).
 */

export type ColourAdjustments = {
  /** Overall lightness, in percent. 100 is untouched. */
  exposure: number;
  contrast: number;
  saturation: number;
  /** −100 cold blue … +100 warm amber. */
  temperature: number;
  /** Hue rotation in degrees, for a deliberate colour shift. */
  hue: number;
  /** Lifts the blacks into a milky, faded-print look. */
  fade: number;
  /** Darkens the corners. */
  vignette: number;
  /** Film grain, as a percentage of full strength. */
  grain: number;
  sepia: number;
  grayscale: number;
  blur: number;
};

export const DEFAULT_ADJUSTMENTS: ColourAdjustments = {
  exposure: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  hue: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  sepia: 0,
  grayscale: 0,
  blur: 0,
};

export type ColourPreset = { name: string; hint: string; adjustments: Partial<ColourAdjustments> };

/**
 * Starting points, not looks-in-a-box: each one nudges a few controls and leaves
 * the rest alone so the artist can still steer.
 */
export const COLOUR_PRESETS: ColourPreset[] = [
  { name: "Original", hint: "Back to the file as it was", adjustments: {} },
  { name: "Neon night", hint: "Cold, punchy, high contrast", adjustments: { contrast: 128, saturation: 132, temperature: -34, vignette: 34 } },
  { name: "Warm vinyl", hint: "Amber shift with lifted blacks", adjustments: { temperature: 46, fade: 26, saturation: 92, grain: 22 } },
  { name: "Asakaa drill", hint: "Desaturated, gritty, dark corners", adjustments: { saturation: 58, contrast: 122, temperature: -16, grain: 38, vignette: 44 } },
  { name: "Highlife", hint: "Bright, warm and clean", adjustments: { exposure: 108, saturation: 118, temperature: 22, contrast: 106 } },
  { name: "Faded tape", hint: "Soft, washed, grainy", adjustments: { fade: 46, contrast: 84, saturation: 74, grain: 46, blur: 0.4 } },
  { name: "Mono", hint: "Black and white with bite", adjustments: { grayscale: 100, contrast: 124, vignette: 22 } },
];

/** Export sizes. 3000×3000 is what the DSPs ask for as cover artwork. */
export const EXPORT_SIZES = [
  { label: "Original", value: 0 },
  { label: "3000 × 3000 (store artwork)", value: 3000 },
  { label: "1400 × 1400", value: 1400 },
  { label: "800 × 800 (thumbnail)", value: 800 },
] as const;

/** Clamps every control to the range the UI offers, so a bad preset cannot overflow. */
export function clampAdjustments(value: Partial<ColourAdjustments>): ColourAdjustments {
  const merged = { ...DEFAULT_ADJUSTMENTS, ...value };
  const between = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return {
    exposure: between(merged.exposure, 20, 220),
    contrast: between(merged.contrast, 20, 250),
    saturation: between(merged.saturation, 0, 250),
    temperature: between(merged.temperature, -100, 100),
    hue: between(merged.hue, -180, 180),
    fade: between(merged.fade, 0, 100),
    vignette: between(merged.vignette, 0, 100),
    grain: between(merged.grain, 0, 100),
    sepia: between(merged.sepia, 0, 100),
    grayscale: between(merged.grayscale, 0, 100),
    blur: between(merged.blur, 0, 12),
  };
}

export function isUntouched(a: ColourAdjustments): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as Array<keyof ColourAdjustments>).every(
    (key) => a[key] === DEFAULT_ADJUSTMENTS[key],
  );
}

/** The `ctx.filter` string for the parts the browser implements natively. */
export function filterString(a: ColourAdjustments, scale: number): string {
  const parts: string[] = [];
  if (a.exposure !== 100) parts.push(`brightness(${(a.exposure / 100).toFixed(3)})`);
  if (a.contrast !== 100) parts.push(`contrast(${(a.contrast / 100).toFixed(3)})`);
  if (a.saturation !== 100) parts.push(`saturate(${(a.saturation / 100).toFixed(3)})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue.toFixed(1)}deg)`);
  if (a.sepia) parts.push(`sepia(${(a.sepia / 100).toFixed(3)})`);
  if (a.grayscale) parts.push(`grayscale(${(a.grayscale / 100).toFixed(3)})`);
  // Blur is in CSS pixels of the *destination*, so it has to scale with the
  // export size or a 3000px render comes out sharper than the preview.
  if (a.blur) parts.push(`blur(${(a.blur * scale).toFixed(2)}px)`);
  return parts.length ? parts.join(" ") : "none";
}

/** Centre-crop source rect for a square output, keeping the whole subject. */
function coverRect(srcW: number, srcH: number, outW: number, outH: number) {
  const scale = Math.max(outW / srcW, outH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (outW - w) / 2, y: (outH - h) / 2, w, h };
}

let grainPattern: CanvasPattern | null = null;

/** A tileable noise pattern, generated once per page and reused for every render. */
function getGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainPattern) return grainPattern;
  const size = 128;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return null;
  const data = tileCtx.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    // Mid-grey noise: `overlay` leaves mid-grey alone and pushes the extremes,
    // which reads as grain rather than as a wash.
    const v = 96 + Math.floor(Math.random() * 64);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tileCtx.putImageData(data, 0, 0);
  grainPattern = ctx.createPattern(tile, "repeat");
  return grainPattern;
}

/**
 * Draws `image` into `ctx` at `outW × outH`, centre-cropped to fill, with the
 * whole grade applied. `scale` is the ratio between this output and the preview,
 * used to keep blur and grain size-independent.
 */
export function renderGraded(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | ImageBitmap,
  adjustments: ColourAdjustments,
  outW: number,
  outH: number,
  scale = 1,
): void {
  const a = clampAdjustments(adjustments);
  const srcW = "width" in image ? image.width : outW;
  const srcH = "height" in image ? image.height : outH;
  const rect = coverRect(srcW, srcH, outW, outH);

  ctx.save();
  ctx.clearRect(0, 0, outW, outH);
  ctx.filter = filterString(a, scale);
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  // Everything below is a composited pass, so it ignores ctx.filter.
  if (a.temperature) {
    const strength = Math.abs(a.temperature) / 100;
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(0.85, strength * 0.9);
    ctx.fillStyle = a.temperature > 0 ? "#ff9a2e" : "#3fa9ff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  if (a.fade) {
    ctx.save();
    ctx.globalAlpha = (a.fade / 100) * 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  if (a.vignette) {
    const radius = Math.hypot(outW, outH) / 2;
    const gradient = ctx.createRadialGradient(outW / 2, outH / 2, radius * 0.32, outW / 2, outH / 2, radius);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${((a.vignette / 100) * 0.85).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  if (a.grain) {
    const pattern = getGrain(ctx);
    if (pattern) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = (a.grain / 100) * 0.4;
      // Scale the tile with the output so grain stays the same physical size.
      ctx.translate(outW / 2, outH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-outW / 2, -outH / 2);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, outW, outH);
      ctx.restore();
    }
  }
}

/** Renders a grade to an offscreen canvas and returns it as a Blob for download. */
export async function exportGraded(
  image: HTMLImageElement | ImageBitmap,
  adjustments: ColourAdjustments,
  opts: { size: number; type: "image/png" | "image/jpeg"; quality: number },
): Promise<Blob> {
  const srcW = "width" in image ? image.width : 1;
  const srcH = "height" in image ? image.height : 1;
  // `size` of 0 means "keep the file's own dimensions and aspect ratio".
  const outW = opts.size > 0 ? opts.size : Math.round(srcW);
  const outH = opts.size > 0 ? opts.size : Math.round(srcH);
  const scale = outW / Math.max(1, srcW);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create a drawing surface for the export.");
  // JPEG has no alpha: without a background the transparent parts of a PNG come
  // out black, which looks like a bug in the grade.
  if (opts.type === "image/jpeg") {
    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(0, 0, outW, outH);
  }
  renderGraded(ctx, image, adjustments, outW, outH, scale);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, opts.type, opts.quality));
  if (!blob) throw new Error("The browser could not encode that image. Try PNG instead.");
  return blob;
}
