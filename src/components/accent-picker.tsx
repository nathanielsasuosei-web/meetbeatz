"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCENT_PRESETS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, normalizeHex } from "@/lib/accent";
import { PaletteIcon } from "@/components/icons";

/**
 * Floating accent picker — the "adjustable colour".
 *
 * Picking a swatch (or any colour from the native picker) rewrites the accent
 * custom properties on <html> through the same `window.__mbSetAccent` the
 * pre-paint script uses, so buttons, badges, the player bar, the nav pill and
 * the 3D hero all re-tint instantly. The choice is remembered in localStorage
 * and applied before first paint on the next visit.
 */
export function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setHex(normalizeHex(window.localStorage.getItem(ACCENT_STORAGE_KEY)));
    } catch {
      /* storage blocked — the picker still works, it just will not remember */
    }
  }, []);

  // Close on Escape or a click/tap outside the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const apply = useCallback((value: string | null) => {
    const clean = normalizeHex(value);
    setHex(clean);
    try {
      if (clean) window.localStorage.setItem(ACCENT_STORAGE_KEY, clean);
      else window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.__mbSetAccent?.(clean);
  }, []);

  const current = hex ?? DEFAULT_ACCENT;

  return (
    <div ref={wrapRef} className="accent-dock no-print">
      {open && (
        <div className="glass accent-pop" role="dialog" aria-label="Accent colour">
          <p className="eyebrow">Accent colour</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Tints the buttons, player and hero glow. Saved on this device.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply(p.hex)}
                title={p.label}
                aria-label={p.label}
                aria-pressed={current === p.hex}
                className={`accent-swatch ${current === p.hex ? "is-on" : ""}`}
                style={{ background: p.hex }}
              />
            ))}
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-black/25 px-3 py-2">
            <span className="text-xs font-semibold text-cream/85">Custom</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase text-muted">{current}</span>
              <input
                type="color"
                value={current}
                onChange={(e) => apply(e.target.value)}
                className="accent-input"
                aria-label="Pick a custom accent colour"
              />
            </span>
          </label>
          {hex && (
            <button type="button" onClick={() => apply(null)} className="mt-3 text-xs font-semibold text-muted hover:text-acid">
              Reset to studio acid
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Change accent colour"
        className="glass accent-fab"
      >
        <span className="accent-fab-dot" style={{ background: current }} />
        <PaletteIcon className="h-4 w-4" />
        <span className="hidden text-xs font-bold sm:inline">Colour</span>
      </button>
    </div>
  );
}
