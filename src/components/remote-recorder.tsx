"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MicIcon } from "./icons";
import { uploadArtistFile } from "@/lib/client-upload";
import { SESSION_GOALS } from "@/lib/release";

/**
 * The browser studio: record a vocal take over a backing track, keep the good
 * ones, and send the best to the producer.
 *
 * ── Why the take never contains the beat ─────────────────────────────────────
 * The signal graph splits before the recorder:
 *
 *   mic → high-pass → gain ─┬→ recorder worklet   (this is the take)
 *                           └→ monitor gain → speakers
 *   backing <audio> → gain ─────→ speakers
 *
 * The backing track reaches the headphones but never the recorder node, so the
 * exported WAV is the voice alone. That matters twice over: the producer needs a
 * dry vocal to comp and mix, and it means a scratch take recorded over a store
 * preview cannot leak that preview into a file the artist walks away with.
 *
 * ── Why an AudioWorklet ──────────────────────────────────────────────────────
 * `MediaRecorder` would be less code, but it hands back Opus in a container the
 * browser chose, at whatever rate it felt like. Recording PCM in a worklet gives
 * a real WAV at the interface's own sample rate — the thing a mixing engineer
 * actually wants — and the worklet runs off the main thread, so a busy page
 * cannot drop samples mid-take.
 */

const WORKLET_SOURCE = `
class TakeRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      // Copy: the buffer handed to process() is reused by the audio thread.
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('take-recorder', TakeRecorder);
`;

/** Vocal high-pass in Hz: kills handling noise and plosive rumble without thinning the voice. */
const LOW_CUT_HZ = 80;
/** Bars of count-in before recording actually starts. */
const COUNTDOWN_SECONDS = 3;

type Take = {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  seconds: number;
  peak: number;
};

type BackingBeat = { id: number; title: string; previewUrl: string };

type Phase = "idle" | "requesting" | "countdown" | "recording" | "uploading" | "sending";

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Mono 16-bit PCM WAV — the format every DAW and distributor accepts. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = 44 + samples.length * 2;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function RemoteRecorder({
  beats,
  account,
  currency,
  onlineServiceSlug,
}: {
  beats: BackingBeat[];
  account: { name: string; email: string } | null;
  currency: string;
  /** The studio service the live session itself is booked and paid for under. */
  onlineServiceSlug: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [inputGain, setInputGain] = useState(100);
  const [monitor, setMonitor] = useState(true);
  const [lowCut, setLowCut] = useState(true);
  const [takes, setTakes] = useState<Take[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playingTake, setPlayingTake] = useState<string | null>(null);

  // Backing track
  const [beatId, setBeatId] = useState<number | null>(null);
  const [backingName, setBackingName] = useState("");
  const [backingVolume, setBackingVolume] = useState(70);

  // Sending to the producer
  const [goal, setGoal] = useState<string>(SESSION_GOALS[0].slug);
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [artistName, setArtistName] = useState(account?.name ?? "");
  const [artistPhone, setArtistPhone] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sentReference, setSentReference] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const backingInputRef = useRef<HTMLInputElement | null>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Web Audio graph, built once per mic session and torn down with it.
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const monitorRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const backingSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const backingGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const startedAtRef = useRef(0);
  const peakRef = useRef(0);
  const timerRef = useRef(0);
  const meterRef = useRef(0);
  const countdownRef = useRef(0);

  useEffect(() => {
    if (account?.name) setArtistName((current) => current || account.name);
  }, [account?.name]);

  /**
   * Ends a take: stops the mic and drops its chain, so the browser's recording
   * indicator goes off between takes.
   *
   * The AudioContext and the backing-track source deliberately survive. An
   * <audio> element can only be routed into one context at a time, and closing
   * and reopening a context per take would mean rebuilding that route (and, in
   * some browsers, losing the element's audio altogether) every time.
   */
  const teardown = useCallback(() => {
    window.clearInterval(timerRef.current);
    window.clearInterval(meterRef.current);
    window.clearInterval(countdownRef.current);
    for (const node of [workletRef.current, processorRef.current, analyserRef.current, monitorRef.current, gainRef.current, filterRef.current, micSourceRef.current]) {
      try {
        node?.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    workletRef.current = null;
    processorRef.current = null;
    analyserRef.current = null;
    monitorRef.current = null;
    gainRef.current = null;
    filterRef.current = null;
    micSourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  // Only the page going away closes the context.
  useEffect(
    () => () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );

  useEffect(() => teardown, [teardown]);

  const dropTake = useCallback((id: string) => {
    setTakes((current) => {
      const gone = current.find((take) => take.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((take) => take.id !== id);
    });
    setSelected((current) => (current === id ? null : current));
    setPlayingTake((current) => (current === id ? null : current));
  }, []);

  useEffect(
    () => () => {
      // Revoke whatever is left when the page goes away.
      setTakes((current) => {
        current.forEach((take) => URL.revokeObjectURL(take.url));
        return current;
      });
    },
    [],
  );

  const finishTake = useCallback(() => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const total = chunks.reduce((sum, part) => sum + part.length, 0);
    if (!total) {
      setError("Nothing was captured — the microphone may be muted or blocked.");
      setPhase("idle");
      return;
    }
    const samples = new Float32Array(total);
    let at = 0;
    for (const part of chunks) {
      samples.set(part, at);
      at += part.length;
    }
    const seconds = samples.length / sampleRateRef.current;
    const blob = encodeWav(samples, sampleRateRef.current);
    const id = `take-${Date.now().toString(36)}`;
    const take: Take = {
      id,
      name: `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      url: URL.createObjectURL(blob),
      blob,
      seconds,
      peak: peakRef.current,
    };
    peakRef.current = 0;
    setTakes((current) => [take, ...current]);
    setSelected(id);
    setElapsed(seconds);
    setNotice(`Take saved — ${clock(seconds)} of audio, WAV at ${Math.round(sampleRateRef.current / 100) / 10} kHz.`);
    setPhase("idle");
  }, []);

  const stopRecording = useCallback(() => {
    audioRef.current?.pause();
    teardown();
    finishTake();
  }, [finishTake, teardown]);

  const startCountdown = useCallback(() => {
    let remaining = COUNTDOWN_SECONDS;
    setCountdown(remaining);
    countdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        window.clearInterval(countdownRef.current);
        setCountdown(0);
        setPhase("recording");
        startedAtRef.current = Date.now();
        timerRef.current = window.setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 100);
        audioRef.current?.play().catch(() => {
          // Autoplay can be refused until the user has interacted; the take is
          // still recorded, just without the backing.
        });
      }
    }, 1000);
  }, []);

  const arm = useCallback(async () => {
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio. Try Chrome, Safari, Edge or Firefox on a device with a microphone.");
      return;
    }
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Ask for the best the device offers; the browser downgrades silently
          // when the hardware cannot do it.
          sampleRate: { ideal: 48000 },
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = ctxRef.current ?? new Ctx({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      if (ctx.state === "suspended") await ctx.resume();

      const micSource = ctx.createMediaStreamSource(stream);
      micSourceRef.current = micSource;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = LOW_CUT_HZ;
      filterRef.current = filter;

      const gain = ctx.createGain();
      gain.gain.value = inputGain / 100;
      gainRef.current = gain;

      const monitorGain = ctx.createGain();
      monitorGain.gain.value = monitor ? 1 : 0;
      monitorRef.current = monitorGain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      micSource.connect(filter);
      filter.connect(gain);
      // The recorder taps here: after the artist's gain and filter, before the
      // monitor, and never after the backing track joins.
      gain.connect(analyser);
      gain.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      // Backing track, if one is loaded, joins only at the destination. The
      // route is built once: an element can only feed one MediaElementSource,
      // and rebuilding it per take would silence the backing in some browsers.
      const backing = audioRef.current;
      if (backing && !backingSourceRef.current) {
        const source = ctx.createMediaElementSource(backing);
        const backingGain = ctx.createGain();
        backingGain.gain.value = backingVolume / 100;
        source.connect(backingGain);
        backingGain.connect(ctx.destination);
        backingSourceRef.current = source;
        backingGainRef.current = backingGain;
      }

      chunksRef.current = [];
      peakRef.current = 0;

      const collect = (chunk: Float32Array) => {
        chunksRef.current.push(chunk);
        // Guard against an unbounded take filling memory: ~10 minutes of mono
        // 48 kHz float is about 115 MB, and no vocal take needs more.
        const maxSamples = ctx.sampleRate * 60 * 10;
        const total = chunksRef.current.reduce((sum, part) => sum + part.length, 0);
        if (total >= maxSamples) stopRecording();
      };

      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
        try {
          await ctx.audioWorklet.addModule(url);
          const node = new AudioWorkletNode(ctx, "take-recorder", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
          node.port.onmessage = (event: MessageEvent<Float32Array>) => collect(event.data);
          gain.connect(node);
          workletRef.current = node;
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        // Older Safari and Firefox ESR: the deprecated processor still runs on
        // the main thread, but it records, which is what matters here.
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => collect(new Float32Array(event.inputBuffer.getChannelData(0)));
        gain.connect(processor);
        processor.connect(ctx.destination);
        processorRef.current = processor;
      }

      // Level meter, and a clip warning so the artist fixes the gain before the
      // take rather than after.
      const bins = new Uint8Array(analyser.fftSize);
      meterRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(bins);
        let peak = 0;
        for (let i = 0; i < bins.length; i++) {
          const v = Math.abs(bins[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setLevel(peak);
        if (peak > 0.98) {
          peakRef.current = 1;
          setClipping(true);
        } else {
          peakRef.current = Math.max(peakRef.current, peak);
        }
      }, 80);

      startCountdown();
    } catch (err) {
      teardown();
      setPhase("idle");
      const message = err instanceof Error ? err.message : "";
      if (/Permission|NotAllowed|denied/i.test(message)) {
        setError("Microphone access was refused. Allow it in your browser's address bar, then press Record again.");
      } else if (/NotFound|DevicesNotFound|no device/i.test(message)) {
        setError("No microphone was found. Plug one in — a phone's built-in mic is fine for a scratch take.");
      } else {
        setError(message || "The microphone could not be started.");
      }
    }
  }, [backingVolume, inputGain, monitor, startCountdown, stopRecording, teardown]);

  // Live control changes, without rebuilding the graph mid-take.
  useEffect(() => {
    if (gainRef.current && ctxRef.current) gainRef.current.gain.setTargetAtTime(inputGain / 100, ctxRef.current.currentTime, 0.02);
  }, [inputGain]);
  useEffect(() => {
    if (monitorRef.current && ctxRef.current) monitorRef.current.gain.setTargetAtTime(monitor ? 1 : 0, ctxRef.current.currentTime, 0.02);
  }, [monitor]);
  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.setTargetAtTime(lowCut ? LOW_CUT_HZ : 20, ctxRef.current?.currentTime ?? 0, 0.02);
  }, [lowCut]);
  useEffect(() => {
    if (backingGainRef.current && ctxRef.current) backingGainRef.current.gain.setTargetAtTime(backingVolume / 100, ctxRef.current.currentTime, 0.02);
    if (audioRef.current) audioRef.current.volume = ctxRef.current ? 1 : backingVolume / 100;
  }, [backingVolume]);

  const chosenTake = takes.find((take) => take.id === selected) ?? null;

  const download = useCallback(() => {
    if (!chosenTake) return;
    const anchor = document.createElement("a");
    anchor.href = chosenTake.url;
    anchor.download = `meetbeatz-take-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [chosenTake]);

  const send = useCallback(async () => {
    setError("");
    setNotice("");
    if (!account) {
      setError("Sign in to send a take to the producer.");
      return;
    }
    if (!chosenTake) {
      setError("Record or choose a take first.");
      return;
    }
    setPhase("uploading");
    setUploadProgress(0);
    try {
      const file = new File([chosenTake.blob], `${chosenTake.name.replace(/\s+/g, "-").toLowerCase()}.wav`, { type: "audio/wav" });
      const path = await uploadArtistFile(
        file,
        "takes",
        (sent, total) => setUploadProgress(Math.round((sent / total) * 100)),
        (status) => setNotice(status),
      );
      setPhase("sending");
      const response = await fetch("/api/remote-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName,
          artistEmail: account.email,
          artistPhone,
          preferredDate,
          preferredTime,
          beatId,
          goal,
          notes,
          takePath: path,
          takeName: file.name,
          takeSeconds: Math.round(chosenTake.seconds),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { reference?: string; error?: string };
      if (!response.ok || !json.reference) throw new Error(json.error ?? "The take could not be sent.");
      setSentReference(json.reference);
      setNotice("");
      setUploadProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The take could not be sent. Try again.");
    } finally {
      setPhase("idle");
    }
  }, [account, artistName, artistPhone, beatId, chosenTake, goal, notes, preferredDate, preferredTime]);

  const loadBackingFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)) {
      setError("That is not an audio file.");
      return;
    }
    setBeatId(null);
    setBackingName(file.name);
    const audio = audioRef.current;
    if (!audio) return;
    // One backing element for the whole session, so a new file replaces the old
    // source instead of stacking a second MediaElementSource onto the graph.
    audio.src = URL.createObjectURL(file);
    audio.load();
  }, []);

  const recording = phase === "recording";
  const busy = phase !== "idle";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      {/* ── Booth ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Booth</p>
              <h2 className="display mt-1 text-3xl">{recording ? "Recording…" : phase === "countdown" ? "Get ready" : "Record a take"}</h2>
            </div>
            <p className="display text-4xl tabular-nums text-acid" aria-live="off">
              {phase === "countdown" ? countdown : clock(elapsed)}
            </p>
          </div>

          {/* Level meter: the one piece of feedback that stops a ruined take. */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Input level</span>
              <span className={clipping ? "font-bold text-danger" : ""}>{clipping ? "Clipping — turn the gain down" : "Peaks should reach the yellow, not the red"}</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/50">
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.min(100, level * 130).toFixed(1)}%`,
                  background: level > 0.98 ? "#ff5c5c" : level > 0.8 ? "#f5c542" : "var(--color-acid)",
                }}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!recording && phase !== "countdown" ? (
              <button type="button" className="btn-primary" onClick={() => void arm()} disabled={busy}>
                <MicIcon className="h-4 w-4" />
                {phase === "requesting" ? "Waiting for the mic…" : "Record"}
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={stopRecording}>
                Stop &amp; keep take
              </button>
            )}
            {takes.length > 0 && !recording && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setElapsed(0);
                  setClipping(false);
                }}
              >
                Reset timer
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="inputGain">Mic gain</label>
              <div className="flex items-center gap-2">
                <input id="inputGain" type="range" min={0} max={250} step={1} value={inputGain} onChange={(e) => setInputGain(Number(e.target.value))} className="w-full accent-[var(--color-acid)]" />
                <span className="w-12 shrink-0 text-right font-mono text-xs text-muted">{inputGain}%</span>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="backingVolume">Backing volume</label>
              <div className="flex items-center gap-2">
                <input id="backingVolume" type="range" min={0} max={100} step={1} value={backingVolume} onChange={(e) => setBackingVolume(Number(e.target.value))} className="w-full accent-[var(--color-acid)]" />
                <span className="w-12 shrink-0 text-right font-mono text-xs text-muted">{backingVolume}%</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted" htmlFor="monitor">
              <input id="monitor" type="checkbox" className="h-4 w-4 accent-[var(--color-acid)]" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} />
              Hear myself (headphones only — speakers will feed back)
            </label>
            <label className="flex items-center gap-2 text-sm text-muted" htmlFor="lowCut">
              <input id="lowCut" type="checkbox" className="h-4 w-4 accent-[var(--color-acid)]" checked={lowCut} onChange={(e) => setLowCut(e.target.checked)} />
              Low cut at {LOW_CUT_HZ} Hz
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="mt-4 rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-ok" role="status">
              {notice}
            </p>
          )}
          <audio ref={audioRef} className="hidden" loop preload="auto" />
        </div>

        <div className="card p-5">
          <p className="label">Backing track</p>
          <p className="mb-2 text-[11px] text-muted">
            Only your voice is recorded — the backing reaches your headphones, never the file. A scratch take over a store
            preview is fine for the session; the licensed beat is used for the final record.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="beat">From the store</label>
              <select
                id="beat"
                className="field"
                value={beatId ?? ""}
                disabled={recording}
                onChange={(event) => {
                  const id = Number(event.target.value) || null;
                  setBeatId(id);
                  const beat = beats.find((b) => b.id === id);
                  setBackingName(beat ? beat.title : "");
                  const audio = audioRef.current;
                  if (!audio) return;
                  if (beat) {
                    audio.src = beat.previewUrl;
                    audio.load();
                  } else {
                    audio.removeAttribute("src");
                    audio.load();
                  }
                }}
              >
                <option value="">No backing</option>
                {beats.map((beat) => (
                  <option key={beat.id} value={beat.id}>
                    {beat.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="own">Or your own instrumental</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost" disabled={recording} onClick={() => backingInputRef.current?.click()}>
                  Load a file
                </button>
                <input
                  ref={backingInputRef}
                  id="own"
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac"
                  className="hidden"
                  onChange={(event) => {
                    loadBackingFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
              {backingName && <p className="mt-1.5 truncate font-mono text-[11px] text-muted">{backingName}</p>}
            </div>
          </div>
          {!recording && audioRef.current && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const audio = audioRef.current;
                  if (!audio?.src) return;
                  if (audio.paused) void audio.play().catch(() => setError("Press Record first — the browser will not start audio on its own."));
                  else audio.pause();
                }}
              >
                Play / pause backing
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Takes & handover ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="card p-5">
          <p className="label">Takes ({takes.length})</p>
          {takes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing recorded yet. Takes stay in this browser tab until you send one — nothing is uploaded automatically.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {takes.map((take) => {
                const isChosen = take.id === selected;
                return (
                  <li key={take.id}>
                    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${isChosen ? "border-acid/50 bg-acid/10" : "border-white/10 bg-white/[0.02]"}`}>
                      <button
                        type="button"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-xs transition hover:border-acid hover:text-acid"
                        aria-label={playingTake === take.id ? `Pause ${take.name}` : `Play ${take.name}`}
                        onClick={() => {
                          const player = takeAudioRef.current;
                          if (!player) return;
                          if (playingTake === take.id) {
                            player.pause();
                            setPlayingTake(null);
                            return;
                          }
                          player.src = take.url;
                          void player.play().catch(() => setError("This browser would not play that take."));
                          setPlayingTake(take.id);
                        }}
                      >
                        {playingTake === take.id ? "❚❚" : "▶"}
                      </button>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(take.id)}>
                        <span className="block truncate text-sm font-semibold">{take.name}</span>
                        <span className="block text-[11px] text-muted">
                          {clock(take.seconds)} · {formatWavSize(take.blob.size)}
                          {take.peak >= 1 ? " · clipped" : ""}
                        </span>
                      </button>
                      {isChosen && <span className="badge-acid shrink-0">selected</span>}
                      <button type="button" className="shrink-0 text-xs text-muted transition hover:text-danger" onClick={() => dropTake(take.id)} aria-label={`Delete ${take.name}`}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <audio
            ref={takeAudioRef}
            className="hidden"
            onEnded={() => setPlayingTake(null)}
            onPause={() => setPlayingTake(null)}
          />
          {chosenTake && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <button type="button" className="btn-ghost" onClick={download}>
                Download WAV
              </button>
            </div>
          )}
        </div>

        <div className="card p-5">
          <p className="eyebrow">Send to the producer</p>
          <h3 className="mt-1 text-xl font-bold">Book the live session</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Send your best take with a preferred time and the producer replies in your chat, directs the session live, and
            comps the vocal afterwards. The session itself is booked and paid for under{" "}
            <Link href={`/studio?service=${onlineServiceSlug}`} className="text-acid hover:underline">
              online studio time
            </Link>
            , charged per hour in {currency}.
          </p>

          {sentReference ? (
            <div className="mt-4 rounded-2xl border border-ok/30 bg-ok/10 p-4">
              <p className="font-bold text-ok">Take sent — reference {sentReference}</p>
              <p className="mt-1 text-sm text-muted">
                It is on your <Link href="/account" className="text-acid hover:underline">account page</Link> and in the
                producer&apos;s dashboard. You will get a reply in the chat bubble, and by email.
              </p>
              <button type="button" className="btn-ghost mt-3" onClick={() => setSentReference("")}>
                Send another take
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="artistName">Artist name</label>
                  <input id="artistName" className="field" value={artistName} onChange={(e) => setArtistName(e.target.value)} maxLength={120} />
                </div>
                <div>
                  <label className="label" htmlFor="artistPhone">WhatsApp / phone</label>
                  <input id="artistPhone" className="field" value={artistPhone} onChange={(e) => setArtistPhone(e.target.value)} placeholder="+233 24 000 0000" maxLength={40} />
                </div>
                <div>
                  <label className="label" htmlFor="goal">What you want from the session</label>
                  <select id="goal" className="field" value={goal} onChange={(e) => setGoal(e.target.value)}>
                    {SESSION_GOALS.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="preferredDate">Preferred date</label>
                  <input id="preferredDate" type="date" className="field" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="preferredTime">Preferred time</label>
                  <input id="preferredTime" type="time" className="field" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="notes">Notes</label>
                  <textarea id="notes" className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Key, tempo, what you want to fix, references…" />
                </div>
              </div>

              {phase === "uploading" && (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                    <span className="block h-full rounded-full bg-acid transition-[width]" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">Uploading the take… {uploadProgress}%</p>
                </div>
              )}

              {!account ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Recording and downloading are free and need no account. To send a take to the producer,{" "}
                  <Link href="/account/register" className="font-bold underline">
                    create a free account
                  </Link>{" "}
                  — it keeps your files and the session on your page.
                </div>
              ) : (
                <button type="button" className="btn-primary w-full justify-center" onClick={() => void send()} disabled={busy || !chosenTake}>
                  {phase === "sending" ? "Sending…" : chosenTake ? "Send this take to the producer" : "Record a take first"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatWavSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
