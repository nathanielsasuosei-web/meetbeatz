"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLOUR_PRESETS,
  DEFAULT_ADJUSTMENTS,
  EXPORT_SIZES,
  clampAdjustments,
  exportGraded,
  isUntouched,
  renderGraded,
  type ColourAdjustments,
} from "@/lib/colour-adjust";
import { formatBytes } from "@/lib/upload-rules";

/**
 * The colour adjuster: grade cover artwork in the browser and export a
 * store-ready square.
 *
 * Nothing is uploaded — the file stays on the device, which is the point when
 * what is being graded is the artwork for an unreleased song. The live preview
 * and the download both go through `renderGraded`, so what you see is what comes
 * out, at whatever resolution you pick.
 */

/** The preview is rendered at this many pixels on its long edge. */
const PREVIEW_MAX = 1000;

type SliderKey = Exclude<keyof ColourAdjustments, never>;

const CONTROLS: Array<{
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Where the control sits when untouched — 0 for bipolar, 100 for percentages. */
  neutral: number;
  suffix?: string;
  hint?: string;
}> = [
  { key: "exposure", label: "Exposure", min: 20, max: 220, step: 1, neutral: 100, suffix: "%", hint: "Overall lightness" },
  { key: "contrast", label: "Contrast", min: 20, max: 250, step: 1, neutral: 100, suffix: "%" },
  { key: "saturation", label: "Saturation", min: 0, max: 250, step: 1, neutral: 100, suffix: "%" },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, neutral: 0, hint: "Cold blue ↔ warm amber" },
  { key: "hue", label: "Hue shift", min: -180, max: 180, step: 1, neutral: 0, suffix: "°" },
  { key: "fade", label: "Fade", min: 0, max: 100, step: 1, neutral: 0, suffix: "%", hint: "Lifts the blacks" },
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1, neutral: 0, suffix: "%" },
  { key: "grain", label: "Grain", min: 0, max: 100, step: 1, neutral: 0, suffix: "%" },
  { key: "sepia", label: "Sepia", min: 0, max: 100, step: 1, neutral: 0, suffix: "%" },
  { key: "grayscale", label: "Black & white", min: 0, max: 100, step: 1, neutral: 0, suffix: "%" },
  { key: "blur", label: "Softness", min: 0, max: 12, step: 0.1, neutral: 0, suffix: "px" },
];

/** Builds a sample cover so the tool can be tried without a file to hand. */
async function makeSampleCover(siteName: string): Promise<HTMLImageElement> {
  const size = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the sample cover.");

  const sky = ctx.createLinearGradient(0, 0, size, size);
  sky.addColorStop(0, "#2b0d16");
  sky.addColorStop(0.45, "#6d1220");
  sky.addColorStop(1, "#0b0b10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(size * 0.72, size * 0.3, 20, size * 0.72, size * 0.3, size * 0.55);
  glow.addColorStop(0, "rgba(198,241,53,0.55)");
  glow.addColorStop(1, "rgba(198,241,53,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Equaliser bars, so the sample reads as music artwork rather than a gradient.
  ctx.fillStyle = "rgba(5,5,6,0.55)";
  for (let i = 0; i < 26; i++) {
    const h = 90 + Math.abs(Math.sin(i * 1.7)) * 380;
    ctx.fillRect(70 + i * 42, size - 140 - h, 22, h);
  }

  ctx.fillStyle = "#f4f1ea";
  ctx.font = "700 96px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(siteName.toUpperCase(), 70, 200);
  ctx.font = "500 44px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(244,241,234,0.7)";
  ctx.fillText("sample cover · grade me", 72, 268);

  const url = canvas.toDataURL("image/png");
  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not build the sample cover."));
    image.src = url;
  });
  return image;
}

export function ColourAdjuster({ siteName }: { siteName: string }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [adj, setAdj] = useState<ColourAdjustments>(DEFAULT_ADJUSTMENTS);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportSize, setExportSize] = useState(3000);
  const [exportType, setExportType] = useState<"image/png" | "image/jpeg">("image/jpeg");
  const [quality, setQuality] = useState(92);
  const [result, setResult] = useState<{ name: string; size: number } | null>(null);

  const afterRef = useRef<HTMLCanvasElement | null>(null);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const urlRef = useRef("");
  const frame = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);

  useEffect(() => releaseUrl, [releaseUrl]);

  const adopt = useCallback(
    (next: HTMLImageElement, name: string, ownedUrl: string) => {
      releaseUrl();
      urlRef.current = ownedUrl;
      setImage(next);
      setFileName(name);
      setError("");
      setResult(null);
      const ratio = Math.min(1, PREVIEW_MAX / Math.max(next.width, next.height, 1));
      setDims({
        w: Math.max(1, Math.round(next.width * ratio)),
        h: Math.max(1, Math.round(next.height * ratio)),
      });
    },
    [releaseUrl],
  );

  const loadFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setError("That is not an image file. Use a JPG, PNG or WebP.");
        return;
      }
      if (file.size > 40 * 1024 * 1024) {
        setError("That image is larger than 40 MB — export a smaller copy and try again.");
        return;
      }
      const url = URL.createObjectURL(file);
      const next = new Image();
      next.onload = () => adopt(next, file.name, url);
      next.onerror = () => {
        URL.revokeObjectURL(url);
        setError("That image could not be opened. It may be corrupted or an unsupported format.");
      };
      next.src = url;
    },
    [adopt],
  );

  const loadSample = useCallback(async () => {
    setBusy(true);
    try {
      const sample = await makeSampleCover(siteName);
      // A data URL is not an object URL, so there is nothing to revoke later.
      setImage(sample);
      setFileName("sample-cover.png");
      setError("");
      setResult(null);
      releaseUrl();
      const ratio = Math.min(1, PREVIEW_MAX / Math.max(sample.width, sample.height, 1));
      setDims({ w: Math.round(sample.width * ratio), h: Math.round(sample.height * ratio) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the sample cover.");
    } finally {
      setBusy(false);
    }
  }, [releaseUrl, siteName]);

  // One repaint per animation frame, whichever control moved.
  useEffect(() => {
    if (!image || !dims.w) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      for (const [ref, grade] of [
        [afterRef, adj],
        [beforeRef, DEFAULT_ADJUSTMENTS],
      ] as const) {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) continue;
        if (canvas.width !== dims.w || canvas.height !== dims.h) {
          canvas.width = dims.w;
          canvas.height = dims.h;
        }
        renderGraded(ctx, image, grade, dims.w, dims.h, dims.w / Math.max(1, image.width));
      }
    });
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [image, adj, dims]);

  const set = useCallback((key: SliderKey, value: number) => {
    setAdj((current) => clampAdjustments({ ...current, [key]: value }));
  }, []);

  const applyPreset = useCallback((patch: Partial<ColourAdjustments>) => {
    setAdj(clampAdjustments(patch));
  }, []);

  const download = useCallback(async () => {
    if (!image) return;
    setBusy(true);
    setError("");
    try {
      const blob = await exportGraded(image, adj, { size: exportSize, type: exportType, quality: quality / 100 });
      const url = URL.createObjectURL(blob);
      const base = (fileName || "cover").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "cover";
      const size = exportSize > 0 ? exportSize : dims.w;
      const name = `${base}-graded-${size}.${exportType === "image/png" ? "png" : "jpg"}`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking immediately can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setResult({ name, size: blob.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export failed. Try a smaller size or PNG.");
    } finally {
      setBusy(false);
    }
  }, [adj, dims.w, exportSize, exportType, fileName, image, quality]);

  const untouched = isUntouched(adj);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            loadFile(event.dataTransfer.files?.[0]);
          }}
          className={`relative overflow-hidden rounded-3xl border bg-black/40 transition ${
            dragging ? "border-acid/70" : "border-white/15"
          }`}
        >
          {image ? (
            <>
              <div className="relative w-full" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
                <canvas ref={afterRef} className="absolute inset-0 h-full w-full" />
                <canvas
                  ref={beforeRef}
                  className="absolute inset-0 h-full w-full"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-cream/80 shadow-[0_0_12px_rgba(0,0,0,0.6)]"
                  style={{ left: `${split}%` }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-ink/80 text-[10px] font-bold text-cream backdrop-blur"
                  style={{ left: `${split}%` }}
                >
                  ⇔
                </span>
                <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cream/80">
                  Before
                </span>
                <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-acid/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink">
                  After
                </span>
                {/* Transparent so the pointer never lands on the canvas: the
                    guard blocks right-click on images, and a compare handle is
                    the only interaction this surface needs. */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={split}
                  onChange={(event) => setSplit(Number(event.target.value))}
                  aria-label="Compare the original with the grade"
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-[11px] text-muted">
                <span className="truncate font-mono">{fileName}</span>
                <span>
                  {image.width} × {image.height}px
                  {untouched ? " · ungraded" : " · graded"}
                </span>
              </div>
            </>
          ) : (
            <div className="grid min-h-[22rem] place-items-center px-6 py-16 text-center">
              <div>
                <p className="display text-2xl">Drop your cover art here</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  JPG, PNG or WebP up to 40 MB. The file never leaves this device — grading happens in your browser.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
                    Choose an image
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void loadSample()} disabled={busy}>
                    Try a sample cover
                  </button>
                </div>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            className="hidden"
            onChange={(event) => {
              loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-ok" role="status">
            Saved <span className="font-mono">{result.name}</span> ({formatBytes(result.size)}). Check your downloads
            folder.
          </p>
        )}

        <div className="card p-4">
          <p className="label">Export</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
            <select
              className="field"
              value={exportSize}
              onChange={(event) => setExportSize(Number(event.target.value))}
              aria-label="Export size"
            >
              {EXPORT_SIZES.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={exportType}
              onChange={(event) => setExportType(event.target.value as "image/png" | "image/jpeg")}
              aria-label="Export format"
            >
              <option value="image/jpeg">JPEG (smaller)</option>
              <option value="image/png">PNG (lossless)</option>
            </select>
            <button type="button" className="btn-primary justify-center" onClick={() => void download()} disabled={!image || busy}>
              {busy ? "Working…" : "Download"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="label !mb-0 shrink-0" htmlFor="sg-quality">
              JPEG quality
            </label>
            <input
              id="sg-quality"
              type="range"
              min={50}
              max={100}
              step={1}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="w-full accent-[var(--color-acid)]"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{quality}%</span>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Non-square artwork is centre-cropped when you export a square size — that is what Spotify, Apple Music and the
            rest require (3000 × 3000, under 650 × 650 is rejected by some stores).
          </p>
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="card p-4">
          <p className="label">Looks</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOUR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                title={preset.hint}
                onClick={() => applyPreset(preset.adjustments)}
                className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-acid/50 hover:text-cream"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="label !mb-0">Adjust</p>
            <button
              type="button"
              className="text-xs font-semibold text-muted transition hover:text-cream disabled:opacity-40"
              onClick={() => setAdj(DEFAULT_ADJUSTMENTS)}
              disabled={untouched}
            >
              Reset all
            </button>
          </div>
          <div className="mt-3 space-y-3.5">
            {CONTROLS.map((control) => {
              const value = adj[control.key];
              const changed = value !== control.neutral;
              return (
                <div key={control.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label className="text-xs font-semibold text-cream/90" htmlFor={`sg-${control.key}`}>
                      {control.label}
                      {control.hint && <span className="ml-2 font-normal text-muted">{control.hint}</span>}
                    </label>
                    <span className={`font-mono text-[11px] ${changed ? "text-acid" : "text-muted"}`}>
                      {control.step < 1 ? value.toFixed(1) : Math.round(value)}
                      {control.suffix ?? ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id={`sg-${control.key}`}
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={value}
                      disabled={!image}
                      onChange={(event) => set(control.key, Number(event.target.value))}
                      className="w-full accent-[var(--color-acid)] disabled:opacity-40"
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-muted transition hover:bg-white/10 hover:text-cream disabled:opacity-30"
                      onClick={() => set(control.key, control.neutral)}
                      disabled={!image || !changed}
                      aria-label={`Reset ${control.label}`}
                    >
                      ⟲
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {image && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()}>
              Replace image
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                releaseUrl();
                setImage(null);
                setFileName("");
                setDims({ w: 0, h: 0 });
                setResult(null);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
