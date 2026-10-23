import type { CSSProperties } from "react";

/**
 * Website background & liquid-glass theme engine.
 *
 * Pure functions shared by Server Components (`src/app/layout.tsx`,
 * `src/app/(site)/layout.tsx`) and the producer's live customiser in
 * `src/components/admin/website-appearance-editor.tsx`, ensuring the live
 * preview in Admin → Settings matches the rendered storefront pixel for pixel.
 */

export const BACKGROUND_STYLES = ["liquid", "aurora", "solid"] as const;
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];

export const BACKGROUND_STYLE_INFO: Record<
  BackgroundStyle,
  { name: string; description: string }
> = {
  liquid: {
    name: "Liquid Glass",
    description: "Animated colour washes, floating glass droplets and tinted cards",
  },
  aurora: {
    name: "Aurora Gradient",
    description: "Smooth ambient multi-tone washes with frosted glass surfaces",
  },
  solid: {
    name: "Solid Matte",
    description: "Clean distraction-free studio background colour with subtle glass",
  },
};

export type BackgroundPreset = {
  id: string;
  name: string;
  hint: string;
  style: BackgroundStyle;
  primaryColor: string;
  secondaryColor: string;
  baseColor: string;
  intensity: number;
  recommendedAccent: string;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "crimson",
    name: "Crimson Studio",
    hint: "Signature Meetbeatz red liquid glass",
    style: "liquid",
    primaryColor: "#f6182a",
    secondaryColor: "#b8081a",
    baseColor: "#050506",
    intensity: 100,
    recommendedAccent: "#c6f135",
  },
  {
    id: "obsidian",
    name: "Obsidian Night",
    hint: "Sleek smoked charcoal & deep black",
    style: "liquid",
    primaryColor: "#52525b",
    secondaryColor: "#27272a",
    baseColor: "#040405",
    intensity: 85,
    recommendedAccent: "#c6f135",
  },
  {
    id: "sapphire",
    name: "Midnight Sapphire",
    hint: "Deep cobalt & electric cyan wash",
    style: "liquid",
    primaryColor: "#2563eb",
    secondaryColor: "#0891b2",
    baseColor: "#030712",
    intensity: 100,
    recommendedAccent: "#38bdf8",
  },
  {
    id: "violet",
    name: "Royal Violet",
    hint: "Lush ultraviolet & magenta glow",
    style: "liquid",
    primaryColor: "#9333ea",
    secondaryColor: "#db2777",
    baseColor: "#07040f",
    intensity: 100,
    recommendedAccent: "#e879f9",
  },
  {
    id: "emerald",
    name: "Emerald Lab",
    hint: "Deep forest green & neon jade glass",
    style: "liquid",
    primaryColor: "#10b981",
    secondaryColor: "#047857",
    baseColor: "#030907",
    intensity: 95,
    recommendedAccent: "#c6f135",
  },
  {
    id: "amber",
    name: "Gold & Amber",
    hint: "Warm analog tape gold & bronze glow",
    style: "liquid",
    primaryColor: "#d97706",
    secondaryColor: "#b45309",
    baseColor: "#090603",
    intensity: 95,
    recommendedAccent: "#fbbf24",
  },
  {
    id: "sunset",
    name: "Sunset Aurora",
    hint: "Smooth fiery coral & rose gradient",
    style: "aurora",
    primaryColor: "#f97316",
    secondaryColor: "#e11d48",
    baseColor: "#090406",
    intensity: 105,
    recommendedAccent: "#fde047",
  },
  {
    id: "matte",
    name: "Pure Matte Dark",
    hint: "Minimal solid dark studio canvas",
    style: "solid",
    primaryColor: "#27272a",
    secondaryColor: "#18181b",
    baseColor: "#070709",
    intensity: 60,
    recommendedAccent: "#c6f135",
  },
];

export const HERO_IMAGE_PRESETS = [
  {
    id: "producer",
    value: "/images/meetbeatz-producer.jpeg",
    label: "Producer portrait",
    hint: "Default control-room portrait",
  },
  {
    id: "studio",
    value: "/images/studio.jpg",
    label: "Studio console",
    hint: "Mixing room & booth",
  },
  {
    id: "stage",
    value: "/images/hero.jpg",
    label: "Stage glow",
    hint: "Atmospheric moody backdrop",
  },
  {
    id: "none",
    value: "none",
    label: "No photo (Theme only)",
    hint: "Pure colour / liquid-glass hero",
  },
] as const;

export const DEFAULT_BACKGROUND_SETTINGS = {
  bgStyle: "liquid" as BackgroundStyle,
  bgPrimaryColor: "#f6182a",
  bgSecondaryColor: "#b8081a",
  bgBaseColor: "#050506",
  bgIntensity: "100",
  heroImage: "/images/meetbeatz-producer.jpeg",
  heroImageOpacity: "50",
} as const;

export type ThemeInput = {
  accentColor: string;
  bgStyle: string;
  bgPrimaryColor: string;
  bgSecondaryColor: string;
  bgBaseColor: string;
  bgIntensity: string | number;
};

type Rgb = [number, number, number];

export function normalizeBackgroundStyle(value: string | undefined | null): BackgroundStyle {
  return (BACKGROUND_STYLES as readonly string[]).includes(String(value))
    ? (value as BackgroundStyle)
    : DEFAULT_BACKGROUND_SETTINGS.bgStyle;
}

export function normalizeHexColor(value: string | undefined | null, fallback: string): string {
  const cleaned = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(cleaned) ? cleaned : fallback;
}

export function normalizeIntensity(value: string | number | undefined | null): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(150, Math.max(0, Math.round(parsed)));
}

export function normalizeHeroOpacity(value: string | number | undefined | null): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(90, Math.max(5, Math.round(parsed)));
}

/**
 * Accepts only `"none"`, built-in `/images/...` paths or producer-uploaded
 * `/api/media/backgrounds/...` paths so untrusted external URLs cannot be stored.
 */
export function normalizeHeroImage(value: string | undefined | null): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return DEFAULT_BACKGROUND_SETTINGS.heroImage;
  if (trimmed === "none") return "none";
  if (/^\/images\/[a-zA-Z0-9._/-]+\.(jpe?g|png|webp)$/i.test(trimmed) && !trimmed.includes("..")) {
    return trimmed;
  }
  if (/^\/api\/media\/backgrounds\/[a-zA-Z0-9._-]+\.(jpe?g|png|webp)$/i.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_BACKGROUND_SETTINGS.heroImage;
}

export function detectMatchingPreset(input: {
  bgStyle: string;
  bgPrimaryColor: string;
  bgSecondaryColor: string;
  bgBaseColor: string;
}): string | null {
  const style = normalizeBackgroundStyle(input.bgStyle);
  const p = normalizeHexColor(input.bgPrimaryColor, DEFAULT_BACKGROUND_SETTINGS.bgPrimaryColor);
  const s = normalizeHexColor(input.bgSecondaryColor, DEFAULT_BACKGROUND_SETTINGS.bgSecondaryColor);
  const b = normalizeHexColor(input.bgBaseColor, DEFAULT_BACKGROUND_SETTINGS.bgBaseColor);
  const match = BACKGROUND_PRESETS.find(
    (preset) =>
      preset.style === style &&
      preset.primaryColor.toLowerCase() === p &&
      preset.secondaryColor.toLowerCase() === s &&
      preset.baseColor.toLowerCase() === b,
  );
  return match?.id ?? null;
}

function hexToRgb(hex: string, fallback: string): Rgb {
  const safe = normalizeHexColor(hex, fallback);
  return [
    parseInt(safe.slice(1, 3), 16),
    parseInt(safe.slice(3, 5), 16),
    parseInt(safe.slice(5, 7), 16),
  ];
}

function mixRgb(a: Rgb, b: Rgb, ratio: number): Rgb {
  const t = Math.min(1, Math.max(0, ratio));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

function rgbTriplet([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`;
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Computes every CSS custom property required by `globals.css` so changing the
 * theme harmonises the page canvas, liquid washes, droplets, frosted cards,
 * form fields, sticky glass header and hero overlays in one pass.
 */
export function buildThemeVariables(input: ThemeInput): Record<string, string> {
  const style = normalizeBackgroundStyle(input.bgStyle);
  const primary = hexToRgb(input.bgPrimaryColor, DEFAULT_BACKGROUND_SETTINGS.bgPrimaryColor);
  const secondary = hexToRgb(input.bgSecondaryColor, DEFAULT_BACKGROUND_SETTINGS.bgSecondaryColor);
  const base = hexToRgb(input.bgBaseColor, DEFAULT_BACKGROUND_SETTINGS.bgBaseColor);
  const accent = hexToRgb(input.accentColor, "#c6f135");
  const scale = normalizeIntensity(input.bgIntensity) / 100;

  const deep = mixRgb(base, secondary, 0.56);
  const surface = mixRgb(base, primary, 0.27);
  const field = mixRgb(base, primary, 0.1);
  const nav = mixRgb(base, secondary, 0.22);
  const border = mixRgb([255, 255, 255], primary, 0.36);
  const highlight = mixRgb([255, 255, 255], primary, 0.14);

  const isSolid = style === "solid";
  const gradStart = rgbToHex(mixRgb(base, secondary, isSolid ? 0.04 : 0.1 * Math.min(scale, 1.3)));
  const gradMid = rgbToHex(mixRgb(base, secondary, isSolid ? 0.015 : 0.03 * Math.min(scale, 1.3)));
  const gradEnd = rgbToHex(mixRgb(base, [0, 0, 0], isSolid ? 0.18 : 0.45));

  return {
    "--color-ink": rgbToHex(base),
    "--color-ink-2": rgbToHex(mixRgb(base, primary, 0.05)),
    "--color-panel": rgbToHex(mixRgb(base, primary, 0.14)),
    "--color-panel-2": rgbToHex(mixRgb(base, primary, 0.22)),
    "--color-line": rgbToHex(mixRgb(base, mixRgb(primary, [255, 255, 255], 0.18), 0.31)),
    "--color-line-2": rgbToHex(mixRgb(base, mixRgb(primary, [255, 255, 255], 0.24), 0.42)),
    "--color-acid": rgbToHex(accent),
    "--color-acid-2": `rgb(${accent.map((c) => Math.round(c * 0.72)).join(" ")})`,
    "--accent-rgb": rgbTriplet(accent),
    "--bg-primary-rgb": rgbTriplet(primary),
    "--bg-secondary-rgb": rgbTriplet(secondary),
    "--bg-base-rgb": rgbTriplet(base),
    "--bg-deep-rgb": rgbTriplet(deep),
    "--bg-surface-rgb": rgbTriplet(surface),
    "--bg-field-rgb": rgbTriplet(field),
    "--bg-nav-rgb": rgbTriplet(nav),
    "--bg-border-rgb": rgbTriplet(border),
    "--bg-highlight-rgb": rgbTriplet(highlight),
    "--bg-grad-start": gradStart,
    "--bg-grad-mid": gradMid,
    "--bg-grad-end": gradEnd,
    "--bg-w1": isSolid ? "0" : Math.min(1, 0.68 * scale).toFixed(3),
    "--bg-w2": isSolid ? "0" : Math.min(1, 0.58 * scale).toFixed(3),
    "--bg-w3": isSolid ? "0" : Math.min(1, 0.72 * scale).toFixed(3),
    "--bg-w4": isSolid ? "0" : Math.min(1, 0.24 * scale).toFixed(3),
    "--bg-droplet-opacity": style === "liquid" ? Math.min(1, 0.8 * Math.min(1.25, scale)).toFixed(3) : "0",
    "--bg-orb-opacity": isSolid ? "0" : Math.min(1, 0.55 * Math.min(1.25, scale)).toFixed(3),
  };
}

export function buildThemeStyle(input: ThemeInput): CSSProperties {
  return buildThemeVariables(input) as CSSProperties;
}
