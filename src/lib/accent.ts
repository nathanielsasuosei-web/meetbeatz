/**
 * The site accent — the "acid" used by buttons, badges, the player, the nav
 * pill and the 3D hero — is adjustable by the visitor.
 *
 * Everything hangs off a handful of custom properties on <html>:
 *
 *   --color-acid     the picked colour (Tailwind's `acid` utilities read it)
 *   --color-acid-2   a darker shade for gradients and :active states
 *   --acid-hi        a lighter shade for specular highlights
 *   --acid-hi-2      lighter still, for sheen sweeps
 *   --acid-rgb       "r g b" triple, for `rgb(var(--acid-rgb) / 0.4)` glows
 *   --acid-on        ink or cream — whichever is legible on top of the accent
 *
 * The maths lives in ONE place: the bootstrap snippet below. It runs from an
 * inline <script> in <head> (so a returning visitor never sees the default
 * colour flash before React hydrates) and it also publishes itself as
 * `window.__mbSetAccent`, which the picker calls. That way the pre-paint path
 * and the interactive path can never drift apart.
 */

export const ACCENT_STORAGE_KEY = "meetbeatz:accent";

/** The shipped brand accent, used when the visitor has not picked one. */
export const DEFAULT_ACCENT = "#c6f135";

export type AccentPreset = { id: string; label: string; hex: string };

/** Presets are chosen to stay legible as button fills on the dark ink body. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "acid", label: "Studio acid (default)", hex: "#c6f135" },
  { id: "cyan", label: "Ice cyan", hex: "#37e6ff" },
  { id: "mint", label: "Mint", hex: "#2ff5a4" },
  { id: "amber", label: "Amber", hex: "#ffb020" },
  { id: "rose", label: "Hot rose", hex: "#ff4d8d" },
  { id: "violet", label: "Neon violet", hex: "#b46bff" },
  { id: "sky", label: "Sky", hex: "#4f8cff" },
  { id: "coral", label: "Coral", hex: "#ff6a45" },
];

declare global {
  interface Window {
    /** Installed by ACCENT_BOOTSTRAP. Pass null to fall back to the brand accent. */
    __mbSetAccent?: (hex: string | null) => void;
  }
}

/**
 * Inline pre-paint script. Deliberately ES5-ish and dependency-free: it is
 * injected as a raw string into <head>, so it cannot import anything.
 */
export const ACCENT_BOOTSTRAP = `(function () {
  var KEY = ${JSON.stringify(ACCENT_STORAGE_KEY)};
  var root = document.documentElement;
  var PROPS = ["--color-acid", "--color-acid-2", "--acid-hi", "--acid-hi-2", "--acid-rgb", "--acid-on"];

  function toRgb(hex) {
    var h = String(hex || "").trim().replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function mix(rgb, amount) {
    var target = amount > 0 ? 255 : 0;
    var t = Math.abs(amount);
    return [
      Math.round(rgb[0] + (target - rgb[0]) * t),
      Math.round(rgb[1] + (target - rgb[1]) * t),
      Math.round(rgb[2] + (target - rgb[2]) * t)
    ];
  }

  function css(rgb) {
    return "rgb(" + rgb[0] + " " + rgb[1] + " " + rgb[2] + ")";
  }

  function setAccent(hex) {
    var rgb = toRgb(hex);
    if (!rgb) {
      for (var i = 0; i < PROPS.length; i++) root.style.removeProperty(PROPS[i]);
      root.removeAttribute("data-accent");
      return;
    }
    /* Perceived brightness, 0-1: decides whether ink or cream sits on the fill. */
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    root.style.setProperty("--color-acid", css(rgb));
    root.style.setProperty("--color-acid-2", css(mix(rgb, -0.24)));
    root.style.setProperty("--acid-hi", css(mix(rgb, 0.3)));
    root.style.setProperty("--acid-hi-2", css(mix(rgb, 0.52)));
    root.style.setProperty("--acid-rgb", rgb.join(" "));
    root.style.setProperty("--acid-on", lum > 0.55 ? "#120206" : "#f4f1ea");
    root.setAttribute("data-accent", css(rgb));
  }

  window.__mbSetAccent = setAccent;

  try {
    setAccent(window.localStorage.getItem(KEY));
  } catch (e) {
    /* Private mode / blocked storage: the brand accent simply stays. */
  }
})();`;

/** Normalises "#abc" / "ABC" / " abc " into a lowercase "#aabbcc", or null. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  let h = value.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
