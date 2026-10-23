"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BACKGROUND_PRESETS,
  BACKGROUND_STYLES,
  BACKGROUND_STYLE_INFO,
  DEFAULT_BACKGROUND_SETTINGS,
  HERO_IMAGE_PRESETS,
  buildThemeStyle,
  buildThemeVariables,
  detectMatchingPreset,
  type BackgroundStyle,
} from "@/lib/background-theme";
import { uploadFileInChunks } from "@/lib/client-upload";
import type { SiteSettings } from "@/lib/settings";

type AppearanceProps = {
  settings: Pick<
    SiteSettings,
    | "siteName"
    | "location"
    | "accentColor"
    | "bgStyle"
    | "bgPrimaryColor"
    | "bgSecondaryColor"
    | "bgBaseColor"
    | "bgIntensity"
    | "heroImage"
    | "heroImageOpacity"
  >;
  saveAppearanceAction: (formData: FormData) => void | Promise<void>;
};

const BUILTIN_HERO_VALUES = new Set<string>(HERO_IMAGE_PRESETS.map((p) => p.value));

function applyThemeToBody(input: {
  accentColor: string;
  bgStyle: string;
  bgPrimaryColor: string;
  bgSecondaryColor: string;
  bgBaseColor: string;
  bgIntensity: string | number;
}) {
  if (typeof document === "undefined") return;
  const vars = buildThemeVariables(input);
  document.body.dataset.bgStyle = input.bgStyle;
  for (const [key, value] of Object.entries(vars)) {
    document.body.style.setProperty(key, value);
  }
}

export function WebsiteAppearanceEditor({ settings, saveAppearanceAction }: AppearanceProps) {
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(settings.bgStyle);
  const [bgPrimaryColor, setBgPrimaryColor] = useState(settings.bgPrimaryColor);
  const [bgSecondaryColor, setBgSecondaryColor] = useState(settings.bgSecondaryColor);
  const [bgBaseColor, setBgBaseColor] = useState(settings.bgBaseColor);
  const [bgIntensity, setBgIntensity] = useState(Number(settings.bgIntensity) || 100);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [heroImage, setHeroImage] = useState(settings.heroImage);
  const [heroImageOpacity, setHeroImageOpacity] = useState(Number(settings.heroImageOpacity) || 50);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRef = useRef(settings);
  savedRef.current = settings;

  const savedSignature = [
    settings.bgStyle,
    settings.bgPrimaryColor,
    settings.bgSecondaryColor,
    settings.bgBaseColor,
    settings.bgIntensity,
    settings.accentColor,
    settings.heroImage,
    settings.heroImageOpacity,
  ].join("|");

  useEffect(() => {
    setBgStyle(settings.bgStyle);
    setBgPrimaryColor(settings.bgPrimaryColor);
    setBgSecondaryColor(settings.bgSecondaryColor);
    setBgBaseColor(settings.bgBaseColor);
    setBgIntensity(Number(settings.bgIntensity) || 100);
    setAccentColor(settings.accentColor);
    setHeroImage(settings.heroImage);
    setHeroImageOpacity(Number(settings.heroImageOpacity) || 50);
    applyThemeToBody(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature]);

  // Live-preview every colour / style / intensity change across the whole browser window.
  useEffect(() => {
    applyThemeToBody({
      accentColor,
      bgStyle,
      bgPrimaryColor,
      bgSecondaryColor,
      bgBaseColor,
      bgIntensity,
    });
  }, [accentColor, bgStyle, bgPrimaryColor, bgSecondaryColor, bgBaseColor, bgIntensity]);

  // If the producer navigates away without saving, restore the persisted theme on body.
  useEffect(() => {
    return () => {
      applyThemeToBody(savedRef.current);
    };
  }, []);

  const activePresetId = useMemo(
    () =>
      detectMatchingPreset({
        bgStyle,
        bgPrimaryColor,
        bgSecondaryColor,
        bgBaseColor,
      }),
    [bgStyle, bgPrimaryColor, bgSecondaryColor, bgBaseColor],
  );

  const activePreset = useMemo(
    () => BACKGROUND_PRESETS.find((preset) => preset.id === activePresetId) ?? null,
    [activePresetId],
  );

  const previewStyle = useMemo(
    () =>
      buildThemeStyle({
        accentColor,
        bgStyle,
        bgPrimaryColor,
        bgSecondaryColor,
        bgBaseColor,
        bgIntensity,
      }),
    [accentColor, bgStyle, bgPrimaryColor, bgSecondaryColor, bgBaseColor, bgIntensity],
  );

  const isDirty =
    bgStyle !== settings.bgStyle ||
    bgPrimaryColor.toLowerCase() !== settings.bgPrimaryColor.toLowerCase() ||
    bgSecondaryColor.toLowerCase() !== settings.bgSecondaryColor.toLowerCase() ||
    bgBaseColor.toLowerCase() !== settings.bgBaseColor.toLowerCase() ||
    String(bgIntensity) !== String(settings.bgIntensity) ||
    accentColor.toLowerCase() !== settings.accentColor.toLowerCase() ||
    heroImage !== settings.heroImage ||
    String(heroImageOpacity) !== String(settings.heroImageOpacity);

  const customUploadedHero = !BUILTIN_HERO_VALUES.has(heroImage) ? heroImage : null;

  async function handleHeroUpload(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    setUploadPct(0);
    setUploadStatus("Uploading photo…");
    try {
      const storedPath = await uploadFileInChunks(
        file,
        "backgrounds",
        (sent, total) => setUploadPct(total > 0 ? Math.round((sent / total) * 100) : 0),
        (msg) => setUploadStatus(msg),
      );
      setHeroImage(`/api/media/${storedPath}`);
      setUploadStatus("Uploaded — click Save background to publish.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload image.");
      setUploadStatus("");
    } finally {
      setUploading(false);
    }
  }

  function resetDefaults() {
    setBgStyle(DEFAULT_BACKGROUND_SETTINGS.bgStyle);
    setBgPrimaryColor(DEFAULT_BACKGROUND_SETTINGS.bgPrimaryColor);
    setBgSecondaryColor(DEFAULT_BACKGROUND_SETTINGS.bgSecondaryColor);
    setBgBaseColor(DEFAULT_BACKGROUND_SETTINGS.bgBaseColor);
    setBgIntensity(Number(DEFAULT_BACKGROUND_SETTINGS.bgIntensity));
    setAccentColor("#c6f135");
    setHeroImage(DEFAULT_BACKGROUND_SETTINGS.heroImage);
    setHeroImageOpacity(Number(DEFAULT_BACKGROUND_SETTINGS.heroImageOpacity));
    setUploadError("");
    setUploadStatus("");
  }

  const intensityScale = bgIntensity / 100;

  return (
    <section id="appearance" className="card scroll-mt-6 p-5 sm:p-6">
      {/* Hidden controlled inputs ensure native form actions always receive exact values */}
      <input type="hidden" name="bgStyle" value={bgStyle} />
      <input type="hidden" name="bgIntensity" value={String(bgIntensity)} />
      <input type="hidden" name="heroImage" value={heroImage} />
      <input type="hidden" name="heroImageOpacity" value={String(heroImageOpacity)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Website background &amp; appearance</h2>
            <span className="badge-acid">{activePreset ? activePreset.name : "Custom palette"}</span>
            {isDirty && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                Unsaved preview
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            Choose a liquid-glass preset or custom colour palette for the entire website, and control or hide the
            homepage hero banner photo. Changes preview live as you adjust them.
          </p>
        </div>
        <a href="/" target="_blank" rel="noreferrer" className="btn-ghost !px-3.5 !py-1.5 text-xs">
          Open storefront ↗
        </a>
      </div>

      {/* ── Live Storefront Preview Stage ── */}
      <div
        style={previewStyle}
        className="relative mt-5 overflow-hidden rounded-2xl border border-white/15 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.75)]"
      >
        {/* Simulated site canvas + washes */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              bgStyle === "solid"
                ? `linear-gradient(160deg, var(--bg-grad-start) 0%, var(--bg-grad-mid) 46%, var(--bg-grad-end) 100%)`
                : `radial-gradient(ellipse 72% 56% at 10% 8%, rgb(var(--bg-primary-rgb) / ${(0.68 * intensityScale).toFixed(2)}), transparent 60%),
                   radial-gradient(ellipse 58% 46% at 94% 16%, rgb(var(--bg-secondary-rgb) / ${(0.58 * intensityScale).toFixed(2)}), transparent 58%),
                   radial-gradient(ellipse 78% 52% at 48% 105%, rgb(var(--bg-deep-rgb) / ${(0.72 * intensityScale).toFixed(2)}), transparent 62%),
                   linear-gradient(160deg, var(--bg-grad-start) 0%, var(--bg-grad-mid) 46%, var(--bg-grad-end) 100%)`,
          }}
        />
        {/* Hero photo preview when enabled */}
        {heroImage !== "none" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={heroImage}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_30%] transition-opacity duration-200"
            style={{ opacity: heroImageOpacity / 100 }}
          />
        )}
        <div className="red-glass-wash pointer-events-none absolute inset-0 opacity-85" />
        {bgStyle === "liquid" && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span
              className="position-blob absolute -left-8 -top-10 h-36 w-36 rounded-full blur-xl"
              style={{
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), rgb(var(--bg-primary-rgb) / ${(0.6 * intensityScale).toFixed(2)}) 60%, transparent 75%)`,
              }}
            />
            <span
              className="position-blob absolute -bottom-10 right-6 h-32 w-44 rounded-full blur-xl"
              style={{
                background: `radial-gradient(circle at 45% 45%, rgb(var(--bg-secondary-rgb) / ${(0.65 * intensityScale).toFixed(2)}), transparent 72%)`,
              }}
            />
          </div>
        )}

        {/* Mini header + hero preview chrome */}
        <div className="relative z-10 p-4 sm:p-5">
          <div className="glass-strong flex items-center justify-between rounded-full px-3.5 py-2 text-[11px]">
            <span className="display tracking-[0.18em] text-cream">
              {(settings.siteName || "MEETBEATZ").toUpperCase()}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden text-cream/70 sm:inline">Beats · Sound Kits · Studio</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                style={{ background: accentColor, color: bgBaseColor }}
              >
                Book session
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accentColor }}>
                  Live preview · {BACKGROUND_STYLE_INFO[bgStyle].name}
                </span>
              </div>
              <p className="display mt-2.5 text-xl text-cream sm:text-2xl">
                 Beat store · Studio · {settings.location || "Accra, Ghana"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="btn-primary pointer-events-none !px-4 !py-1.5 !text-xs">Browse beats</span>
                <span className="btn-ghost pointer-events-none !px-4 !py-1.5 !text-xs">Sound Kits</span>
              </div>
            </div>

            <div className="card p-3 sm:w-56">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Featured beat</p>
                  <p className="text-xs font-bold text-cream">Accra Midnight Bounce</p>
                </div>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black"
                  style={{ background: accentColor, color: "#050506" }}
                >
                  ▶
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 1: Curated Presets ── */}
      <div className="mt-6">
        <label className="label">1. Theme presets</label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {BACKGROUND_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setBgStyle(preset.style);
                  setBgPrimaryColor(preset.primaryColor);
                  setBgSecondaryColor(preset.secondaryColor);
                  setBgBaseColor(preset.baseColor);
                  setBgIntensity(preset.intensity);
                }}
                className={`group flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-acid bg-white/[0.08] shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]"
                    : "border-white/12 bg-white/[0.025] hover:border-white/28 hover:bg-white/[0.05]"
                }`}
              >
                <div
                  className="h-8 w-full rounded-lg border border-white/15"
                  style={{
                    background:
                      preset.style === "solid"
                        ? preset.baseColor
                        : `radial-gradient(circle at 22% 28%, ${preset.primaryColor}, transparent 62%), radial-gradient(circle at 82% 72%, ${preset.secondaryColor}, transparent 65%), ${preset.baseColor}`,
                  }}
                />
                <div className="mt-2 flex w-full items-center justify-between gap-1">
                  <span className="truncate text-xs font-bold text-cream">{preset.name}</span>
                  {active && <span className="text-[10px] font-black text-acid">✓</span>}
                </div>
                <span className="line-clamp-1 text-[10px] text-muted">{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 2: Backdrop Style ── */}
      <div className="mt-5">
        <label className="label">2. Backdrop style</label>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {BACKGROUND_STYLES.map((styleKey) => {
            const info = BACKGROUND_STYLE_INFO[styleKey];
            const selected = bgStyle === styleKey;
            return (
              <button
                key={styleKey}
                type="button"
                onClick={() => setBgStyle(styleKey)}
                className={`rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-acid bg-white/[0.08]"
                    : "border-white/12 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cream">{info.name}</span>
                  {selected && <span className="text-[10px] font-black text-acid">Active</span>}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted">{info.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 3: Custom Colours & Intensity ── */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="label !mb-0">3. Custom colours &amp; glow strength</label>
          {activePreset && activePreset.recommendedAccent.toLowerCase() !== accentColor.toLowerCase() && (
            <button
              type="button"
              onClick={() => setAccentColor(activePreset.recommendedAccent)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-cream transition hover:border-white/30"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: activePreset.recommendedAccent }}
              />
              Pair accent ({activePreset.recommendedAccent})
            </button>
          )}
        </div>

        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <input
              id="bgPrimaryColor"
              name="bgPrimaryColor"
              type="color"
              value={bgPrimaryColor}
              onChange={(e) => setBgPrimaryColor(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-ink-2 p-1"
            />
            <div className="min-w-0">
              <label htmlFor="bgPrimaryColor" className="block text-xs font-semibold text-cream">
                Primary liquid glow
              </label>
              <p className="font-mono text-[11px] uppercase text-muted">{bgPrimaryColor} · main wash &amp; glass tint</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <input
              id="bgSecondaryColor"
              name="bgSecondaryColor"
              type="color"
              value={bgSecondaryColor}
              onChange={(e) => setBgSecondaryColor(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-ink-2 p-1"
            />
            <div className="min-w-0">
              <label htmlFor="bgSecondaryColor" className="block text-xs font-semibold text-cream">
                Secondary wash
              </label>
              <p className="font-mono text-[11px] uppercase text-muted">{bgSecondaryColor} · ambient depth glow</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <input
              id="bgBaseColor"
              name="bgBaseColor"
              type="color"
              value={bgBaseColor}
              onChange={(e) => setBgBaseColor(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-ink-2 p-1"
            />
            <div className="min-w-0">
              <label htmlFor="bgBaseColor" className="block text-xs font-semibold text-cream">
                Base canvas colour
              </label>
              <p className="font-mono text-[11px] uppercase text-muted">{bgBaseColor} · deep page backdrop</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <input
              id="accentColor"
              name="accentColor"
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-ink-2 p-1"
            />
            <div className="min-w-0">
              <label htmlFor="accentColor" className="block text-xs font-semibold text-cream">
                Store accent colour
              </label>
              <p className="font-mono text-[11px] uppercase text-muted">{accentColor} · buttons &amp; hero wave</p>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label htmlFor="bgIntensity" className="font-semibold text-cream">
              Colour glow intensity
            </label>
            <span className="font-mono text-muted">
              {bgStyle === "solid" ? "Muted (Solid mode)" : `${bgIntensity}%`}
            </span>
          </div>
          <input
            id="bgIntensity"
            type="range"
            min={0}
            max={150}
            step={5}
            value={bgIntensity}
            disabled={bgStyle === "solid"}
            onChange={(e) => setBgIntensity(Number(e.target.value))}
            className="range-acid mt-1.5 w-full cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>

      {/* ── Step 4: Homepage Hero Banner Photo ── */}
      <div className="mt-5 border-t border-white/10 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label className="label !mb-0">4. Homepage hero banner photo</label>
            <p className="mt-0.5 text-[11px] text-muted">
              Choose a studio photo behind the top homepage hero, upload your own, or switch to colour theme only.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void handleHeroUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost !px-3.5 !py-1.5 text-xs"
            >
              {uploading ? `Uploading ${uploadPct}%…` : "+ Upload photo"}
            </button>
          </div>
        </div>

        {uploadError && (
          <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {uploadError}
          </p>
        )}
        {!uploadError && uploadStatus && (
          <p className="mt-2 text-xs text-acid">{uploadStatus}</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {HERO_IMAGE_PRESETS.map((option) => {
            const selected = heroImage === option.value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setHeroImage(option.value)}
                className={`overflow-hidden rounded-xl border p-2 text-left transition ${
                  selected
                    ? "border-acid bg-white/[0.08] shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]"
                    : "border-white/12 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                {option.value === "none" ? (
                  <div
                    className="grid h-14 w-full place-items-center rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-wider text-cream/80"
                    style={{
                      background: `radial-gradient(circle at 25% 30%, ${bgPrimaryColor}, transparent 65%), radial-gradient(circle at 80% 75%, ${bgSecondaryColor}, transparent 65%), ${bgBaseColor}`,
                    }}
                  >
                    Theme only
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={option.value}
                    alt=""
                    className="h-14 w-full rounded-lg object-cover object-[center_30%]"
                  />
                )}
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-bold text-cream">{option.label}</span>
                  {selected && <span className="text-[10px] font-black text-acid">✓</span>}
                </div>
                <p className="line-clamp-1 text-[10px] text-muted">{option.hint}</p>
              </button>
            );
          })}

          {customUploadedHero && (
            <button
              type="button"
              onClick={() => setHeroImage(customUploadedHero)}
              className="overflow-hidden rounded-xl border border-acid bg-white/[0.08] p-2 text-left shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={customUploadedHero}
                alt=""
                className="h-14 w-full rounded-lg object-cover object-center"
              />
              <div className="mt-2 flex items-center justify-between gap-1">
                <span className="truncate text-xs font-bold text-cream">Uploaded photo</span>
                <span className="text-[10px] font-black text-acid">✓</span>
              </div>
              <p className="line-clamp-1 text-[10px] text-muted">Custom hero banner</p>
            </button>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label htmlFor="heroImageOpacity" className="font-semibold text-cream">
              Hero photo visibility
            </label>
            <span className="font-mono text-muted">
              {heroImage === "none" ? "Hidden" : `${heroImageOpacity}%`}
            </span>
          </div>
          <input
            id="heroImageOpacity"
            type="range"
            min={5}
            max={90}
            step={5}
            value={heroImageOpacity}
            disabled={heroImage === "none"}
            onChange={(e) => setHeroImageOpacity(Number(e.target.value))}
            className="range-acid mt-1.5 w-full cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>

      {/* ── Save / Reset Bar ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={resetDefaults} className="btn-ghost !px-4 !py-2 text-xs">
          Reset to default Crimson
        </button>
        <button
          type="submit"
          formAction={saveAppearanceAction}
          disabled={uploading}
          className="btn-primary !px-6 !py-2.5"
        >
          Save website background
        </button>
      </div>
    </section>
  );
}
