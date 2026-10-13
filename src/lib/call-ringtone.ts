"use client";

/**
 * Synthesizes incoming call ringing alerts (for the producer) and outgoing
 * ringback tones (for the artist) using the Web Audio API, with zero external
 * audio assets required.
 */

type StopFn = () => void;

function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

/**
 * Plays an unmistakable incoming studio call ringtone pattern for the producer:
 * two melodic dual-tone bursts followed by a pause, repeating every 2.4 seconds.
 */
export function startIncomingRingtone(): StopFn {
  const ctx = createAudioContext();
  let stopped = false;

  const playBurst = (startOffset: number, duration: number, freqA: number, freqB: number) => {
    if (!ctx || stopped || ctx.state !== "running") return;
    const now = ctx.currentTime + startOffset;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    gain.gain.setValueAtTime(0.18, now + duration - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sine";
    oscB.type = "triangle";
    oscA.frequency.setValueAtTime(freqA, now);
    oscB.frequency.setValueAtTime(freqB, now);

    // Subtle warble modulation (20 Hz) for classic telephone ring texture
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(20, now);
    lfoGain.gain.setValueAtTime(18, now);
    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);
    lfoGain.connect(oscB.frequency);

    oscA.connect(gain);
    oscB.connect(gain);

    oscA.start(now);
    oscB.start(now);
    lfo.start(now);

    oscA.stop(now + duration);
    oscB.stop(now + duration);
    lfo.stop(now + duration);
  };

  const triggerCycle = () => {
    if (stopped) return;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    // Dual burst ring-ring pattern
    playBurst(0, 0.38, 523.25, 659.25); // C5 + E5
    playBurst(0.48, 0.44, 587.33, 783.99); // D5 + G5

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate([260, 120, 320]);
      } catch {
        // Ignore vibration errors on unsupported devices
      }
    }
  };

  // Unlock AudioContext on first user interaction if suspended
  const unlock = () => {
    if (!ctx || stopped) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => triggerCycle()).catch(() => {});
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }

  triggerCycle();
  const interval = typeof window !== "undefined" ? window.setInterval(triggerCycle, 2200) : null;

  return () => {
    stopped = true;
    if (interval !== null) window.clearInterval(interval);
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
    if (ctx) {
      void ctx.close().catch(() => {});
    }
  };
}

/**
 * Plays a soft outgoing ringback tone for the artist while waiting for the producer to answer.
 */
export function startOutgoingRingback(): StopFn {
  const ctx = createAudioContext();
  let stopped = false;

  const triggerTone = () => {
    if (stopped || !ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    if (ctx.state !== "running") return;

    const now = ctx.currentTime;
    const duration = 0.85;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
    gain.gain.setValueAtTime(0.08, now + duration - 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  };

  triggerTone();
  const interval = typeof window !== "undefined" ? window.setInterval(triggerTone, 3000) : null;

  return () => {
    stopped = true;
    if (interval !== null) window.clearInterval(interval);
    if (ctx) {
      void ctx.close().catch(() => {});
    }
  };
}
