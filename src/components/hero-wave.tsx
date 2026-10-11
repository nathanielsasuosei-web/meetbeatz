"use client";

import { useEffect, useRef } from "react";

const MUSIC_BARS = [18, 32, 52, 38, 72, 44, 86, 58, 35, 66, 92, 54, 76, 42, 88, 62, 34, 70, 96, 48, 78, 36, 64, 90, 50, 74, 42, 82, 58, 30, 68, 46, 86, 54, 72, 38];

/**
 * A lightweight, canvas-based music wave for the home hero. Five parallax
 * waveform layers, a perspective floor and floating beat nodes give the
 * artwork a 5D stage feel without shipping a large animation library.
 */
export function HeroWave() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const layerElement = layerRef.current;
    const canvasElement = canvasRef.current;
    const contextElement = canvasElement?.getContext("2d");
    if (!layerElement || !canvasElement || !contextElement) return;

    // Keep stable, non-null references for the animation callbacks below.
    const layer: HTMLDivElement = layerElement;
    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = contextElement;

    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let start = performance.now();
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const accent = () => getComputedStyle(layer).getPropertyValue("--accent-rgb").trim() || "198 241 53";
    const color = (alpha: number) => `rgb(${accent()} / ${alpha})`;

    function resize() {
      const rect = layer.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function lineWave(
      time: number,
      layerIndex: number,
      options: { base: number; amplitude: number; alpha: number; lineWidth: number },
    ) {
      const depth = layerIndex / 5;
      const center = width * 0.5;
      const path = new Path2D();
      const step = Math.max(4, width / 180);
      const phase = time * (0.95 + layerIndex * 0.08) + layerIndex * 1.7;

      for (let x = 0; x <= width + step; x += step) {
        const distance = Math.abs(x - center) / Math.max(1, center);
        const envelope = 0.42 + (1 - Math.min(1, distance)) * 0.58;
        const primary = Math.sin(x * (0.018 + layerIndex * 0.0015) + phase);
        const detail = Math.sin(x * 0.045 - phase * 1.35 + layerIndex) * 0.34;
        const ripple = Math.sin(x * 0.009 + phase * 0.6) * 0.2;
        const y = options.base - depth * 32 + (primary + detail + ripple) * options.amplitude * envelope;
        if (x === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }

      context.save();
      context.beginPath();
      context.strokeStyle = color(options.alpha);
      context.lineWidth = options.lineWidth;
      context.shadowColor = color(options.alpha * 0.8);
      context.shadowBlur = layerIndex === 0 ? 16 : 7;
      context.stroke(path);
      context.restore();
    }

    function draw(now: number) {
      const elapsed = (now - start) / 1000;
      context.clearRect(0, 0, width, height);

      const horizon = height * 0.64;
      const glow = context.createRadialGradient(width * 0.5, horizon, 0, width * 0.5, horizon, width * 0.75);
      glow.addColorStop(0, color(0.16));
      glow.addColorStop(0.45, color(0.045));
      glow.addColorStop(1, color(0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // Perspective floor: the receding lines make the waves read as a stage,
      // not a flat equalizer pasted over the photograph.
      context.save();
      context.lineWidth = 1;
      context.strokeStyle = color(0.12);
      for (let i = 1; i <= 9; i += 1) {
        const progress = i / 9;
        const y = horizon + Math.pow(progress, 1.7) * (height - horizon + 50);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      for (let i = -8; i <= 8; i += 1) {
        const bottomX = width * 0.5 + i * width * 0.14;
        context.beginPath();
        context.moveTo(width * 0.5, horizon);
        context.lineTo(bottomX, height + 12);
        context.stroke();
      }
      context.restore();

      // Five depth layers, each with a slightly different frequency and speed.
      for (let i = 4; i >= 0; i -= 1) {
        lineWave(elapsed, i, {
          base: horizon - 8,
          amplitude: 15 + (5 - i) * 3.5,
          alpha: 0.12 + (5 - i) * 0.035,
          lineWidth: i === 0 ? 2.2 : 1,
        });
      }

      // A bright center trace and floating nodes provide the animated focal
      // point while leaving the hero copy legible above it.
      context.save();
      context.globalCompositeOperation = "lighter";
      for (let i = 0; i < 28; i += 1) {
        const x = width * 0.08 + ((i * 71 + elapsed * (16 + (i % 4) * 7)) % (width * 0.84));
        const depth = (Math.sin(i * 2.1 + elapsed * 0.55) + 1) / 2;
        const y = horizon - 34 - depth * 78 + Math.sin(elapsed * 1.4 + i) * 8;
        const radius = 1 + depth * 2.5;
        context.beginPath();
        context.fillStyle = color(0.18 + depth * 0.3);
        context.shadowColor = color(0.8);
        context.shadowBlur = 12;
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      if (!reducedMotion) frame = requestAnimationFrame(draw);
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      reducedMotion = media.matches;
      cancelAnimationFrame(frame);
      start = performance.now();
      frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(layer);
    media.addEventListener?.("change", onMotionChange);
    resize();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener?.("change", onMotionChange);
    };
  }, []);

  return (
    <div ref={layerRef} className="hero-wave-layer" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="hero-wave-bars">
        {MUSIC_BARS.map((height, index) => (
          <span key={index} style={{ height: `${height}%`, animationDelay: `${(index % 9) * -0.13}s` }} />
        ))}
      </div>
    </div>
  );
}
