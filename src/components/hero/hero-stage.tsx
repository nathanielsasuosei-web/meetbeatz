"use client";

import { useEffect, useRef, useState } from "react";
import { getPlayerAudioElement, usePlayer } from "@/components/player/player-context";
import { connectBeatEnergy, readBeatEnergy } from "@/lib/beat-energy";
import { createOrbScene, type OrbScene } from "@/components/hero/orb-scene";

/**
 * Mounts the hero's WebGL stage (see orb-scene.ts) and keeps it fed with the
 * energy of whatever beat the player bar is playing.
 *
 * The canvas is created imperatively rather than rendered by React, so a rebuild
 * always starts from a fresh canvas — re-initialising on a canvas whose context
 * was already disposed is a WebGL footgun, and React would hand back the same
 * element on a re-mount.
 *
 * Behind it sits `.hero-orb-glow`: the placeholder while three.js downloads, and
 * the entire visual if WebGL is missing, so the hero never has a hole in it.
 */

type Props = {
  /** Sizing/placement for the square stage, supplied by the page. */
  className?: string;
};

export function HeroStage({ className = "" }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<OrbScene | null>(null);
  const playingRef = useRef(false);
  const { playing } = usePlayer();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Bail before downloading three.js on a device that cannot run it.
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2")) {
      console.warn("[hero-orb] no WebGL2 on this device — keeping the flat hero.");
      return;
    }

    let disposed = false;
    let canvas: HTMLCanvasElement | null = null;

    const boot = async () => {
      try {
        const three = await import("three");
        if (disposed) return;

        canvas = document.createElement("canvas");
        canvas.className = "hero-canvas";
        canvas.setAttribute("aria-hidden", "true");
        host.appendChild(canvas);

        const scene = createOrbScene({
          three,
          canvas,
          container: host,
          quality: window.innerWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high",
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          readEnergy: (elapsed, dt) => readBeatEnergy(elapsed, dt, playingRef.current),
        });

        if (!scene) {
          canvas.remove();
          canvas = null;
          return;
        }
        if (disposed) {
          scene.dispose();
          canvas.remove();
          canvas = null;
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      } catch (error) {
        console.warn("[hero-orb] stage failed to start — keeping the flat hero.", error);
      }
    };

    void boot();
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      canvas?.remove();
    };
  }, []);

  // Start the player tap on the first play, and keep the orb's read of "is
  // anything playing" current. connectBeatEnergy is a no-op after it succeeds.
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    const element = getPlayerAudioElement();
    if (!element) return;
    void connectBeatEnergy(element).catch(() => {});
  }, [playing]);

  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <div
        aria-hidden="true"
        className={`hero-orb-glow absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
      />
      <div
        ref={hostRef}
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
