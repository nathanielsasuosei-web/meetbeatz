"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAPTURE_DEVICE_PATTERN,
  CAPTURE_SOFTWARE_PATTERN,
  SECURITY_EVENT_LABELS,
  SECURITY_EVENT_SEVERITY,
  type ScreenGuardConfig,
  type SecurityEventKind,
} from "@/lib/screen-guard";

/**
 * Screen-capture guard for the storefront.
 *
 * It layers everything a browser is actually allowed to do about recording, in
 * rough order of how much they stop:
 *
 *   • refuse and report `getDisplayMedia()` — in-browser screen/tab sharing,
 *     which `Permissions-Policy: display-capture=()` (next.config.mjs) already
 *     blocks in Chromium; the hook covers the browsers that ignore the header
 *     and makes the refusal visible instead of a silent failure;
 *   • watch `mediaDevices` for the capture device Safari exposes while an OS
 *     recorder runs, and for virtual cameras from OBS-style software;
 *   • intercept PrtSc, ⌘⇧3/4/5, Ctrl+S/P/U and devtools shortcuts, and try to
 *     blank the clipboard after a PrtSc;
 *   • veil the artwork when the page is backgrounded or loses focus, which is
 *     the moment a recorder window is switched to;
 *   • block right-click and drag on media so covers cannot be lifted;
 *   • print a forensic watermark naming the viewer on every page;
 *   • report each incident to `/api/screen-guard` for the producer dashboard.
 *
 * Read the limits in src/lib/screen-guard.ts before promising anyone a hard
 * block: an OS-level recorder runs outside the browser and no web page can see
 * it on Chrome, Firefox or Android. What this does is remove the easy paths and
 * make the hard ones traceable.
 */

/** How long a lost focus is tolerated before the artwork is hidden. */
const BLUR_GRACE_MS = 900;
/** Identical incident within this window is not reported twice. */
const REPORT_COOLDOWN_MS = 20_000;
/** Hard ceiling per page session, so a stuck key cannot flood the API. */
const MAX_REPORTS = 40;
/** How often the capture-device scan repeats, in ms. */
const SCAN_INTERVAL_MS = 2000;
const VISITOR_KEY = "mb-guard-visitor";

type Severity = "low" | "medium" | "high";

type Alert = { kind: SecurityEventKind; detail: string; severity: Severity };

function newVisitorId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Per-tab id, so repeat incidents from one visitor can be grouped in the dashboard. */
function visitorId(): string {
  try {
    const existing = window.sessionStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = newVisitorId();
    window.sessionStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    // Private browsing with storage disabled — the guard still works, it just
    // cannot group repeat incidents for this visitor.
    return newVisitorId();
  }
}

/** Stops every preview the moment a capture is detected: no audio left to rip. */
function pauseAllMedia() {
  document.querySelectorAll<HTMLMediaElement>("audio, video").forEach((el) => {
    try {
      el.pause();
    } catch {
      // A media element that refuses to pause is not worth breaking the guard over.
    }
  });
}

/**
 * Best-effort clipboard wipe after Print Screen. Windows puts the screenshot on
 * the clipboard; overwriting it with a transparent pixel removes that copy where
 * the async clipboard API is allowed to write images.
 */
async function blankClipboard() {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    if (typeof ClipboardItem !== "undefined" && clipboard.write) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        await clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return;
      }
    }
    await clipboard.writeText?.("");
  } catch {
    // Denied or unsupported — the on-screen warning still tells the visitor it
    // was noticed, and the incident is still reported.
  }
}

/**
 * Builds the repeating watermark tile. Drawn into a canvas and used as a CSS
 * background so one element covers the viewport without touching layout or
 * pointer events. Empty until mounted: a data URL cannot be rendered on the
 * server, and shipping different markup to the two would break hydration.
 */
function useWatermark(label: string, enabled: boolean, mounted: boolean): string {
  return useMemo(() => {
    if (!enabled || !mounted || typeof document === "undefined" || !label) return "";
    const size = 320;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.scale(scale, scale);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(244, 241, 234, 0.5)";
    ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(label, 0, -9);
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(198, 241, 53, 0.45)";
    ctx.fillText(new Date().toISOString().slice(0, 16).replace("T", " "), 0, 9);
    return canvas.toDataURL("image/png");
  }, [label, enabled, mounted]);
}

export function ScreenGuard({ config }: { config: ScreenGuardConfig }) {
  const { mode, siteName, viewer } = config;
  const [alert, setAlert] = useState<Alert | null>(null);
  const [veiled, setVeiled] = useState(false);
  const [toast, setToast] = useState<Alert | null>(null);
  const [mounted, setMounted] = useState(false);
  const visitor = useRef("");
  const reports = useRef(0);
  const lastReport = useRef<Map<string, number>>(new Map());

  const send = useCallback((kind: SecurityEventKind, detail: string) => {
    const key = `${kind}|${detail}`;
    const now = Date.now();
    if (now - (lastReport.current.get(key) ?? 0) < REPORT_COOLDOWN_MS || reports.current >= MAX_REPORTS) return;
    lastReport.current.set(key, now);
    reports.current += 1;
    // Fire and forget: a visitor on a bad connection must never be blocked by
    // the report, and the guard must not throw if the API is unreachable.
    void fetch("/api/screen-guard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        detail,
        path: window.location.pathname + window.location.search,
        visitorId: visitor.current,
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  /**
   * One entry point for every sensor, so the reaction (stop playback, veil,
   * warn, report) is identical whichever one tripped.
   */
  const raise = useCallback(
    (kind: SecurityEventKind, detail: string) => {
      const severity: Severity = SECURITY_EVENT_SEVERITY[kind] ?? "medium";
      const next: Alert = { kind, detail, severity };
      send(kind, detail);
      if (severity === "high") {
        pauseAllMedia();
        if (mode === "block") setVeiled(true);
        setAlert(next);
        setToast(null);
        return;
      }
      if (mode === "block") setToast(next);
    },
    [mode, send],
  );

  // Runs first: every other effect reports through `send`, which reads this.
  useEffect(() => {
    visitor.current = visitorId();
    setMounted(true);
  }, []);

  // ── In-browser screen sharing ───────────────────────────────────────────────
  useEffect(() => {
    if (mode === "off") return;
    const media = navigator.mediaDevices;
    if (!media || typeof media.getDisplayMedia !== "function") return;
    const original = media.getDisplayMedia;
    const refusal: typeof original = () => {
      raise("display_capture", "getDisplayMedia() was called on this page");
      return Promise.reject(new DOMException("Screen sharing is not allowed on this site.", "NotAllowedError"));
    };
    try {
      Object.defineProperty(media, "getDisplayMedia", { value: refusal, writable: true, configurable: true });
    } catch {
      // Frozen by the browser — the Permissions-Policy header still applies.
    }
    return () => {
      try {
        Object.defineProperty(media, "getDisplayMedia", { value: original, writable: true, configurable: true });
      } catch {
        // Nothing to undo.
      }
    };
  }, [mode, raise]);

  // ── Capture devices: Safari exposes the OS recorder, OBS exposes a camera ───
  useEffect(() => {
    if (mode === "off") return;
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;

    // Devices already accounted for, so one recorder does not alert every scan.
    const known = new Set<string>();
    // New-but-unlabelled inputs and how many consecutive scans they survived.
    const suspects = new Map<string, number>();
    let baselined = false;

    const scan = async () => {
      let devices: MediaDeviceInfo[];
      try {
        devices = await media.enumerateDevices();
      } catch {
        return;
      }
      const inputs = devices.filter((device) => device.kind === "videoinput");
      const keyOf = (device: MediaDeviceInfo) => `${device.deviceId}|${device.label}`;

      if (!baselined) {
        baselined = true;
        inputs.forEach((device) => known.add(keyOf(device)));
        // A recorder already running when the page opened is still a recorder.
        for (const device of inputs) {
          if (CAPTURE_DEVICE_PATTERN.test(device.label)) raise("capture_device", device.label);
          else if (CAPTURE_SOFTWARE_PATTERN.test(device.label)) raise("capture_software", device.label);
        }
        return;
      }

      for (const device of inputs) {
        const key = keyOf(device);
        if (known.has(key)) continue;
        if (CAPTURE_DEVICE_PATTERN.test(device.label)) {
          known.add(key);
          raise("capture_device", device.label || "unnamed capture device");
          continue;
        }
        if (CAPTURE_SOFTWARE_PATTERN.test(device.label)) {
          known.add(key);
          raise("capture_software", device.label);
          continue;
        }
        // Chrome and Firefox hand back empty labels until camera permission is
        // granted, so a *new* video input is the only available signal there.
        // It must survive two scans, which keeps a webcam being plugged in (or a
        // label appearing after a permission prompt) from reading as a recorder.
        const hits = (suspects.get(key) ?? 0) + 1;
        suspects.set(key, hits);
        if (hits >= 2) {
          known.add(key);
          raise("capture_device", `New video input appeared${device.label ? `: ${device.label}` : " (label hidden by browser)"}`);
        }
      }
    };

    void scan();
    const timer = window.setInterval(() => void scan(), SCAN_INTERVAL_MS);
    const onChange = () => void scan();
    media.addEventListener("devicechange", onChange);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("devicechange", onChange);
    };
  }, [mode, raise]);

  // ── Permissions-Policy violations: Chromium fires these when capture is denied
  useEffect(() => {
    if (mode === "off") return;
    const onViolation = (event: Event) => {
      const violation = event as SecurityPolicyViolationEvent;
      const directive = violation.effectiveDirective || violation.violatedDirective || "";
      if (!directive.includes("display-capture")) return;
      raise("policy_violation", violation.blockedURI || directive);
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [mode, raise]);

  // ── Keyboard: PrtSc, screenshots, save, print, view source, devtools ────────
  useEffect(() => {
    if (mode === "off") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key ?? "";
      const lower = key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (lower === "printscreen" || lower === "prtsc" || lower === "prtscn") {
        event.preventDefault();
        void blankClipboard();
        raise("print_screen", "Print Screen key");
        return;
      }
      // macOS ⌘⇧3 full screen, ⌘⇧4 selection, ⌘⇧5 recorder. The OS takes the
      // shot regardless — this reports it and warns the visitor.
      if (event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key)) {
        raise("print_screen", `macOS screenshot shortcut ⌘⇧${key}`);
        return;
      }
      if (mod && !event.shiftKey && ["s", "p", "u"].includes(lower)) {
        event.preventDefault();
        const what = lower === "s" ? "save page" : lower === "p" ? "print page" : "view source";
        raise("save_attempt", `Ctrl/⌘+${lower.toUpperCase()} (${what}) blocked`);
        return;
      }
      if (key === "F12" || (mod && event.shiftKey && ["i", "j", "c"].includes(lower))) {
        raise("devtools", key);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, raise]);

  // ── Right-click and drag on artwork and players ─────────────────────────────
  useEffect(() => {
    if (mode === "off") return;
    const isMedia = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest("[data-sg-protect], video, audio, img"));

    const onContextMenu = (event: MouseEvent) => {
      if (!isMedia(event.target)) return;
      event.preventDefault();
      raise("save_attempt", "Right-click menu blocked on artwork or player");
    };
    const onDragStart = (event: DragEvent) => {
      if (isMedia(event.target)) event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("dragstart", onDragStart, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, [mode, raise]);

  // ── Veil: hide the artwork while the page is not the one being looked at ────
  useEffect(() => {
    if (mode !== "block") return;
    // Inside an iframe (a hosted preview, an embed) the window never really has
    // focus, so veiling on blur would hide the store permanently. Backgrounding
    // is still detected there.
    const framed = window.self !== window.top;
    let blurTimer = 0;

    const onVisibility = () => {
      if (document.hidden) {
        setVeiled(true);
        raise("hidden", "Page backgrounded while protected content was open");
      } else {
        setVeiled(false);
      }
    };
    const onBlur = () => {
      if (framed) return;
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => setVeiled(true), BLUR_GRACE_MS);
    };
    const onFocus = () => {
      window.clearTimeout(blurTimer);
      setVeiled(false);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [mode, raise]);

  // Toasts are transient; the high-severity panel waits for the visitor.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Marks <html> so the print stylesheet and the media rules can react.
  useEffect(() => {
    if (mode === "off") return;
    const root = document.documentElement;
    root.classList.add("sg-guard");
    root.classList.toggle("sg-veiled", veiled);
    return () => {
      root.classList.remove("sg-guard", "sg-veiled");
    };
  }, [mode, veiled]);

  const watermark = useWatermark(viewer || visitor.current || siteName, mode !== "off", mounted);

  if (mode === "off") return null;

  return (
    <>
      {watermark && <div aria-hidden className="sg-watermark" style={{ backgroundImage: `url(${watermark})` }} />}

      {veiled && (
        <button type="button" className="sg-veil" onClick={() => setVeiled(false)}>
          <span className="sg-veil-card">
            <span className="eyebrow !tracking-[0.22em]">Content protected</span>
            <span className="display mt-2 block text-2xl sm:text-3xl">{siteName} previews are hidden</span>
            <span className="mt-3 block max-w-sm text-sm text-muted">
              Artwork and players are covered while this tab is in the background or another window has focus. Click here
              to continue.
            </span>
          </span>
        </button>
      )}

      {alert && (
        <div className="sg-modal" role="alertdialog" aria-modal="true" aria-labelledby="sg-alert-title">
          <div className="sg-modal-card">
            <p className="eyebrow !tracking-[0.22em] text-deep-red">Recording detected</p>
            <h2 id="sg-alert-title" className="display mt-2 text-2xl sm:text-3xl">
              {SECURITY_EVENT_LABELS[alert.kind]}
            </h2>
            {alert.detail && <p className="mt-3 font-mono text-xs text-cream/70">{alert.detail}</p>}
            <p className="mt-3 text-sm text-muted">
              Screen recording, screenshots and re-recording of previews are not allowed on {siteName}. Playback has been
              stopped and this attempt was logged{viewer ? ` against ${viewer}` : ""} with the browser, time and page.
            </p>
            <p className="mt-3 text-xs text-muted">
              Licensed files are delivered to your email and account — there is never a need to record a preview.
              Repeated attempts can lead to the account and its licenses being revoked.
            </p>
            <button
              type="button"
              className="btn-primary mt-5 w-full justify-center"
              onClick={() => {
                setAlert(null);
                setVeiled(false);
              }}
            >
              I understand — stop recording
            </button>
          </div>
        </div>
      )}

      {toast && !alert && (
        <div className="sg-toast" role="status">
          <div className="min-w-0">
            <p className="text-xs font-bold text-cream">{SECURITY_EVENT_LABELS[toast.kind]}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {toast.detail}
              {viewer ? ` · ${viewer}` : ""}
            </p>
          </div>
          <button type="button" className="sg-toast-close" aria-label="Dismiss warning" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
