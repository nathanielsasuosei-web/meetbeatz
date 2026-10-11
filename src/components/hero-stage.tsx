"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { CoverArt } from "@/components/beat-card";
import { Equalizer } from "@/components/icons";
import { usePlayer } from "@/components/player/player-context";
import type { BeatCardData } from "@/lib/catalog";

/**
 * Placement of the beat sleeves that orbit the platter. `px`/`py` are positions
 * inside the square stage, `z` is depth in px — the parallax you get for free
 * from `perspective` is what makes the tilt read as 3D rather than a skewed
 * photo.
 */
const SLEEVES = [
  { px: "16%", py: "26%", z: 150, rot: -17, dur: 7.5, delay: -0.8 },
  { px: "84%", py: "20%", z: 60, rot: 15, dur: 9.25, delay: -3.1 },
  { px: "20%", py: "78%", z: 20, rot: 12, dur: 8.4, delay: -5.4 },
  { px: "82%", py: "74%", z: 200, rot: -11, dur: 10.5, delay: -2.2 },
];

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * The animated 3D hero: a tilting turntable stage with a spinning platter, a
 * receding grid floor, depth rings and the current drops floating in front of
 * it as sleeves.
 *
 * Motion is driven by a single rAF loop that eases the rendered rotation toward
 * the pointer position, so it never snaps — and it stops asking for frames once
 * it settles. Everything decorative, so the whole stage is aria-hidden; the
 * tracklist below it carries the same beats as real, reachable content.
 */
export function HeroStage({ beats, siteName }: { beats: BeatCardData[]; siteName: string }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const { current, playing } = usePlayer();

  useEffect(() => {
    const stage = stageRef.current;
    const tilt = tiltRef.current;
    if (!stage || !tilt) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let targetShift = 0;
    let rx = 0;
    let ry = 0;
    let shift = 0;
    let raf = 0;

    const frame = () => {
      // Exponential ease: frame-rate independent enough for a UI tilt, and it
      // never overshoots, which is what keeps it feeling smooth.
      rx += (targetX - rx) * 0.075;
      ry += (targetY - ry) * 0.075;
      shift += (targetShift - shift) * 0.09;
      tilt.style.setProperty("--rx", `${rx.toFixed(3)}deg`);
      tilt.style.setProperty("--ry", `${ry.toFixed(3)}deg`);
      tilt.style.setProperty("--sy", `${shift.toFixed(2)}px`);
      const settled = Math.abs(targetX - rx) < 0.02 && Math.abs(targetY - ry) < 0.02 && Math.abs(targetShift - shift) < 0.15;
      raf = settled ? 0 : requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const nx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 2;
      const ny = ((e.clientY - (r.top + r.height / 2)) / r.height) * 2;
      targetY = clamp(nx, -1.6, 1.6) * 13;
      targetX = clamp(-ny, -1.6, 1.6) * 9;
      start();
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      start();
    };
    const onScroll = () => {
      // The stage drifts up and back as the page scrolls, then settles.
      targetShift = Math.min(56, Math.max(0, window.scrollY) * 0.09);
      start();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const sleeves = beats.slice(0, SLEEVES.length);

  return (
    <div ref={stageRef} className="hero3d mx-auto w-full max-w-[34rem]" aria-hidden="true">
      <div ref={tiltRef} className="hero3d-tilt">
        <div className="hero3d-idle">
          <span className="hero3d-bloom" />
          <span className="hero3d-floor" />
          <span className="hero3d-ring hero3d-ring-a" />
          <span className="hero3d-ring hero3d-ring-b" />

          <div className="hero3d-disc">
            <span className="hero3d-disc-face" />
            <span className="hero3d-disc-edge" />
          </div>

          {/* The label stands upright on the platter — that mismatch of angles is
              what sells the depth. */}
          <div className="hero3d-label">
            <Image src="/images/logo.png" alt="" width={128} height={128} className="h-full w-full rounded-2xl object-cover" />
            <span className="hero3d-label-glass" />
          </div>

          {sleeves.map((beat, i) => {
            const spot = SLEEVES[i];
            const live = current?.id === beat.id;
            return (
              <div
                key={beat.id}
                className="hero3d-sleeve"
                style={
                  {
                    "--px": spot.px,
                    "--py": spot.py,
                    "--z": `${spot.z}px`,
                    "--rot": `${spot.rot}deg`,
                    "--dur": `${spot.dur}s`,
                    "--delay": `${spot.delay}s`,
                  } as CSSProperties
                }
              >
                <div className={`hero3d-sleeve-in ${live ? "is-live" : ""}`}>
                  <CoverArt beat={beat} className="rounded-[inherit]" />
                  <span className="hero3d-sleeve-gloss" />
                  {live && (
                    <span className="hero3d-sleeve-eq text-[var(--acid-on)]">
                      <Equalizer />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="hero3d-readout">
            <span className={`hero3d-readout-bars ${playing ? "is-on" : ""}`}>
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="hero3d-readout-text">
              {current ? `Now spinning · ${current.title}` : `${siteName} · ${beats.length} beats on the rack`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
