/**
 * Screen-capture guard configuration, shared by the server (which decides the
 * mode from Settings) and the browser component that enforces it.
 *
 * Nothing here may import `fs`, `@/db` or anything else server-only: the guard
 * is a client component and imports this file directly.
 *
 * ── What a browser can and cannot do ────────────────────────────────────────
 * No website can stop an operating-system screen recorder. The recorder runs
 * outside the browser, in the OS compositor, and no web API is allowed to see
 * it or interrupt it — that is true of every browser on every platform, and any
 * product claiming otherwise is selling a deterrent, not a block. What the web
 * *does* allow, and what this guard uses, is:
 *
 *   1. `Permissions-Policy: display-capture=()` (see next.config.mjs) — stops
 *      in-browser capture: `getDisplayMedia()`, tab/window/screen sharing and
 *      any extension that asks for it. This is a real, enforced block.
 *   2. Detection of the capture devices Safari exposes while an OS recording is
 *      running, plus the `securitypolicyviolation` event Chrome fires when
 *      something tries to capture anyway.
 *   3. Veiling — hiding the artwork behind an opaque panel the moment the page
 *      loses focus or is backgrounded, which is when a recorder is switched to.
 *   4. A forensic watermark naming the viewer, so a leak that does escape can be
 *      traced back to the account it came from. This is the layer the industry
 *      actually relies on (it is how screener copies of films are tracked).
 *   5. Keyboard and pointer interception for PrtSc, save-page, print and
 *      devtools, which stops the casual rip.
 *
 * Truly blocking playback of the audio itself needs DRM (Widevine/FairPlay via
 * an EME licence server) plus hardware-backed output protection — a different
 * and much larger project. See SECURITY.md.
 */

export type ScreenGuardMode = "off" | "watermark" | "block";

export const SCREEN_GUARD_MODES: ScreenGuardMode[] = ["off", "watermark", "block"];

export const SCREEN_GUARD_LABELS: Record<ScreenGuardMode, { name: string; hint: string }> = {
  off: {
    name: "Off",
    hint: "No protection. Previews play normally and nothing is reported.",
  },
  watermark: {
    name: "Watermark + report",
    hint: "Every page carries the viewer's name, capture attempts are blocked where the browser allows it and reported to your dashboard, but nothing is hidden.",
  },
  block: {
    name: "Full block (recommended)",
    hint: "Watermark and reporting, plus the artwork is hidden the moment the page loses focus or a recorder is detected, and Print Screen / save / print are intercepted.",
  },
};

/** The setting value is free text in the database, so it is normalised once, here. */
export function normalizeScreenGuardMode(value: string | null | undefined): ScreenGuardMode {
  const v = String(value ?? "").trim().toLowerCase();
  return (SCREEN_GUARD_MODES as string[]).includes(v) ? (v as ScreenGuardMode) : "block";
}

/**
 * Device labels that mean "a screen is being captured right now".
 *
 * Safari (macOS and iOS) lists the OS recorder as a video input while it runs —
 * on iOS a system screen recording appears as "Screen Recording", on macOS as
 * "Capture screen 0". Chrome and Firefox hide labels until camera permission is
 * granted, so there the guard falls back to counting devices that appear after
 * the page loaded.
 */
export const CAPTURE_DEVICE_PATTERN =
  /screen\s*[-_ ]?\s*record|screenrecord|capture\s*screen|screen\s*capture|display\s*capture|screencast/i;

/** Software whose virtual camera only exists while it is running (OBS, ManyCam…). */
export const CAPTURE_SOFTWARE_PATTERN = /obs\s*virtual|manycam|virtual\s*camera|screen\s*studio|kap\s*camera/i;

/** Event kinds the reporting API accepts; anything else is dropped. */
export const SECURITY_EVENT_KINDS = [
  "capture_device",
  "capture_software",
  "display_capture",
  "policy_violation",
  "print_screen",
  "save_attempt",
  "devtools",
  "hidden",
] as const;

export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

export const SECURITY_EVENT_SEVERITY: Record<SecurityEventKind, "low" | "medium" | "high"> = {
  capture_device: "high",
  capture_software: "medium",
  display_capture: "high",
  policy_violation: "medium",
  print_screen: "medium",
  save_attempt: "low",
  devtools: "low",
  hidden: "low",
};

export const SECURITY_EVENT_LABELS: Record<SecurityEventKind, string> = {
  capture_device: "Screen recorder detected",
  capture_software: "Recording software running",
  display_capture: "In-browser screen capture attempted",
  policy_violation: "Capture blocked by policy",
  print_screen: "Print Screen pressed",
  save_attempt: "Save / print page attempted",
  devtools: "Developer tools opened",
  hidden: "Page hidden while protected",
};

/** One incident as the browser reports it. */
export type SecurityEventInput = {
  kind: SecurityEventKind;
  detail?: string;
  path?: string;
  visitorId?: string;
};

/** What the guard needs to render; assembled server-side from Settings + session. */
export type ScreenGuardConfig = {
  mode: ScreenGuardMode;
  siteName: string;
  /** Signed-in artist's email, or "" — printed into the watermark. */
  viewer: string;
};
