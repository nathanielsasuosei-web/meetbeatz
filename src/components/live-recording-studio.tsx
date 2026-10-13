"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatAudioPlayer } from "@/components/chat-audio-player";
import { DownloadIcon, Equalizer, MicIcon, PhoneIcon, SendIcon } from "@/components/icons";
import { uploadFileInChunks } from "@/lib/client-upload";

export type BackingBeatOption = {
  id: number;
  title: string;
  bpm: number | null;
  musicalKey: string;
  previewUrl: string;
};

export type ArtistRecipientOption = {
  id: number;
  name: string;
  email: string;
};

type RecordedTake = {
  id: number;
  name: string;
  durationSec: number;
  createdAt: string;
  beatTitle: string | null;
  file: File;
  url: string;
};

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function pickRecorderMime(): { mimeType: string; ext: string } {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return { mimeType: "", ext: ".webm" };
  }
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: "audio/webm;codecs=opus", ext: ".webm" },
    { mimeType: "audio/webm", ext: ".webm" },
    { mimeType: "audio/ogg;codecs=opus", ext: ".ogg" },
    { mimeType: "audio/mp4", ext: ".m4a" },
  ];
  for (const item of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(item.mimeType)) {
      return item;
    }
  }
  return { mimeType: "", ext: ".webm" };
}

export function LiveRecordingStudio({
  initialOpen,
  isProducer,
  producerName,
  customer,
  beats,
  artists = [],
}: {
  initialOpen: boolean;
  isProducer: boolean;
  producerName?: string | null;
  customer?: { id: number; name: string } | null;
  beats: BackingBeatOption[];
  artists?: ArtistRecipientOption[];
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [toggling, setToggling] = useState(false);
  const [toggleNotice, setToggleNotice] = useState<string | null>(null);

  const [selectedBeatId, setSelectedBeatId] = useState<string>(beats[0] ? String(beats[0].id) : "none");
  const [customBeatUrl, setCustomBeatUrl] = useState<string | null>(null);
  const [customBeatName, setCustomBeatName] = useState<string | null>(null);
  const [playBeatOnRecord, setPlayBeatOnRecord] = useState(true);
  const [beatVolume, setBeatVolume] = useState(0.65);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(artists[0]?.id ?? null);
  const [sendingTakeId, setSendingTakeId] = useState<number | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  const beatAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordSecondsRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const takeCounterRef = useRef(1);

  const activeBeat =
    selectedBeatId === "custom"
      ? customBeatUrl
        ? { title: customBeatName || "Custom backing track", url: customBeatUrl }
        : null
      : selectedBeatId !== "none"
        ? (() => {
            const found = beats.find((b) => String(b.id) === selectedBeatId);
            return found ? { title: found.title, url: found.previewUrl } : null;
          })()
        : null;

  useEffect(() => {
    if (beatAudioRef.current) {
      beatAudioRef.current.volume = beatVolume;
    }
  }, [beatVolume]);

  const stopRecordingHardware = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (beatAudioRef.current) {
      beatAudioRef.current.pause();
    }
    setMicLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingHardware();
    };
  }, [stopRecordingHardware]);

  async function handleToggleAccess(nextOpen: boolean) {
    if (!isProducer || toggling) return;
    setToggling(true);
    setToggleNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/live-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: nextOpen }),
      });
      const data = (await res.json().catch(() => ({}))) as { open?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update Live Recording access.");
      const updated = Boolean(data.open);
      setIsOpen(updated);
      setToggleNotice(
        updated
          ? "Live Recording is now OPEN to all artists."
          : "Live Recording is now set to Coming Soon (producer access only).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Live Recording access.");
    } finally {
      setToggling(false);
    }
  }

  function handleCustomBeatUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (customBeatUrl) URL.revokeObjectURL(customBeatUrl);
    const nextUrl = URL.createObjectURL(file);
    setCustomBeatUrl(nextUrl);
    setCustomBeatName(file.name);
    setSelectedBeatId("custom");
  }

  async function startLiveTake() {
    setError(null);
    setSendStatus(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Live recording requires microphone access in a supported browser on HTTPS or localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      recordSecondsRef.current = 0;
      setRecordSeconds(0);

      // Set up real-time microphone level meter
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const audioCtx = new Ctx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tickMeter = () => {
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i];
          const avg = sum / buffer.length;
          setMicLevel(Math.min(100, Math.round((avg / 140) * 100)));
          rafRef.current = window.requestAnimationFrame(tickMeter);
        };
        rafRef.current = window.requestAnimationFrame(tickMeter);
      }

      const { mimeType } = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.start(200);
      setRecording(true);

      if (playBeatOnRecord && activeBeat && beatAudioRef.current) {
        beatAudioRef.current.currentTime = 0;
        beatAudioRef.current.volume = beatVolume;
        void beatAudioRef.current.play().catch(() => {});
      }

      timerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch (err) {
      stopRecordingHardware();
      setRecording(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access was blocked. Allow microphone access in your browser to start live recording.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start live recording.");
      }
    }
  }

  function stopLiveTake() {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const { mimeType, ext } = pickRecorderMime();
    const durationSec = Math.max(1, recordSecondsRef.current);
    const takeNum = takeCounterRef.current++;
    const currentBeatTitle = activeBeat?.title ?? null;
    const takeLabel = currentBeatTitle
      ? `Live Take #${takeNum} · ${currentBeatTitle} (${formatClock(durationSec)})`
      : `Live Take #${takeNum} (${formatClock(durationSec)})`;

    recorder.onstop = () => {
      const actualMime = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];
      stopRecordingHardware();
      setRecording(false);

      if (blob.size === 0) {
        setError("Recorded take was empty. Check your microphone and try again.");
        return;
      }

      const file = new File([blob], `live-take-${takeNum}-${Date.now()}${ext}`, { type: actualMime });
      const url = URL.createObjectURL(blob);
      setTakes((prev) => [
        {
          id: Date.now(),
          name: takeLabel,
          durationSec,
          createdAt: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          beatTitle: currentBeatTitle,
          file,
          url,
        },
        ...prev,
      ]);
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function cancelLiveTake() {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    chunksRef.current = [];
    stopRecordingHardware();
    setRecording(false);
    setRecordSeconds(0);
  }

  async function sendTakeToChat(take: RecordedTake) {
    if (sendingTakeId !== null) return;
    setSendingTakeId(take.id);
    setError(null);
    setSendStatus(`Uploading ${take.name}…`);

    try {
      const audioPath = await uploadFileInChunks(
        take.file,
        "chat-audio",
        (sent, total) => {
          if (total > 0) {
            const pct = Math.min(100, Math.round((sent / total) * 100));
            setSendStatus(`Uploading ${take.name} (${pct}%)…`);
          }
        },
      );

      if (isProducer) {
        if (!selectedRecipientId) {
          throw new Error("Select a registered artist account to send this live recording take to.");
        }
        const res = await fetch("/api/admin/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: selectedRecipientId,
            body: `🎙️ Live Studio Recording: ${take.name}`,
            audioPath,
            audioKind: "voice",
            audioName: take.name,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not send live recording to artist chat.");
        const artistName = artists.find((a) => a.id === selectedRecipientId)?.name ?? "artist";
        setSendStatus(`Sent "${take.name}" to ${artistName}'s private chat.`);
      } else if (customer) {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: `🎙️ Live Studio Recording: ${take.name}`,
            audioPath,
            audioKind: "voice",
            audioName: take.name,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not send live recording to the producer.");
        setSendStatus(`Sent "${take.name}" to Meetbeatz Producer in your private chat.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the recorded take.");
      setSendStatus(null);
    } finally {
      setSendingTakeId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // LOCKED / COMING SOON VIEW FOR ARTISTS & VISITORS (when !isOpen && !isProducer)
  // ---------------------------------------------------------------------------
  if (!isOpen && !isProducer) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="card overflow-hidden p-0">
          <div className="border-b border-line bg-gradient-to-br from-acid/12 via-transparent to-deep-red/15 p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="eyebrow flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Meetbeatz Virtual Booth · Live Recording
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300">
                Coming Soon
              </span>
            </div>

            <h1 className="display mt-4 text-4xl sm:text-6xl">
              Live Recording{" "}
              <span className="text-acid">Coming Soon.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream/80">
              Our online Live Recording Studio is currently locked while the Meetbeatz producer prepares the booth. Soon you will be able to load beats, record live vocal takes directly in your browser, and send your stems straight to the producer.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass-subtle rounded-2xl p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-acid/15 text-acid">
                  <MicIcon className="h-5 w-5" />
                </span>
                <h2 className="mt-3 font-bold text-cream">Live Vocal Booth</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Record uncompressed vocal takes over any Meetbeatz beat with real-time input metering.
                </p>
              </div>

              <div className="glass-subtle rounded-2xl p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-acid/15 text-acid">
                  <Equalizer className="text-acid" />
                </span>
                <h2 className="mt-3 font-bold text-cream">Multi-Take Session Rack</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Audition multiple takes side-by-side, download your recordings, or send them straight to chat.
                </p>
              </div>

              <div className="glass-subtle rounded-2xl p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-acid/15 text-acid">
                  <PhoneIcon className="h-5 w-5" />
                </span>
                <h2 className="mt-3 font-bold text-cream">Producer-Controlled Access</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  The Meetbeatz producer opens the live recording room when ready for remote recording sessions.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Status · Coming Soon</p>
                <p className="mt-1 text-sm text-cream/90">
                  Want the producer to open a live recording session for you or book the physical studio right now?
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/call" className="call-accept-animated !px-5 !py-2.5 !text-xs">
                  <span className="call-btn-icon !h-7 !w-7">
                    <PhoneIcon className="h-4 w-4 animate-phone-ring" />
                  </span>
                  <span>Call Producer</span>
                </Link>
                <Link href="/studio" className="btn-primary !px-5 !py-2.5 !text-xs">
                  Book In-Studio Session
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ACTIVE LIVE RECORDING STUDIO (Always accessible to Producer, and accessible
  // to Artists when Producer has opened it)
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {isProducer && (
        <section className="mb-6 rounded-2xl border border-acid/40 bg-acid/10 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">Producer Access Control · Live Recording Gate</span>
                {isOpen ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366]/25 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#39dc78]">
                    <span className="h-2 w-2 rounded-full bg-[#39dc78] animate-ping" />
                    Open to Artists
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
                    Closed to Artists · Showing &ldquo;Coming Soon&rdquo;
                  </span>
                )}
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-cream/85">
                Signed in as producer <strong className="text-cream">{producerName || "Meetbeatz"}</strong>. You always have full access to the Live Recording Studio below.{" "}
                {isOpen
                  ? "Artists can currently access and record in this studio. Click on the right to close it back to 'Coming Soon'."
                  : "Artists currently see 'Coming Soon' and cannot enter until you open it."}
              </p>
              {toggleNotice && <p className="mt-2 text-xs font-bold text-[#39dc78]">{toggleNotice}</p>}
            </div>

            <div className="flex items-center gap-3">
              {isOpen ? (
                <button
                  type="button"
                  onClick={() => void handleToggleAccess(false)}
                  disabled={toggling}
                  className="btn-danger !px-5 !py-2.5 !text-xs"
                >
                  {toggling ? "Updating…" : "Close & Set to Coming Soon"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleToggleAccess(true)}
                  disabled={toggling}
                  className="call-accept-animated !px-5 !py-2.5 !text-xs"
                >
                  <span className="call-btn-icon !h-7 !w-7">
                    <MicIcon className="h-4 w-4" />
                  </span>
                  <span>{toggling ? "Opening…" : "Open Live Recording to Artists"}</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="card overflow-hidden p-0">
        <header className="border-b border-line bg-gradient-to-br from-acid/10 via-transparent to-deep-red/15 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-danger animate-ping" />
              Meetbeatz Live Recording Booth
            </p>
            <div className="flex items-center gap-2">
              {!isOpen && isProducer && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-0.5 text-[11px] font-bold text-amber-300">
                  Public: Coming Soon · Producer Preview
                </span>
              )}
              <span className="badge-acid">{isProducer ? "Producer Console" : "Artist Studio"}</span>
            </div>
          </div>

          <h1 className="display mt-3 text-4xl sm:text-5xl">Live Recording Studio</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Select a Meetbeatz backing beat or load your own instrumental, monitor your microphone input level in real time, record live vocal or instrument takes, and send them directly to chat.
          </p>
        </header>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr]">
          {/* Left column: Backing track & Live Mic Booth */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="eyebrow">1 · Backing Beat / Instrumental</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="live-beat-select" className="label">
                    Choose backing beat
                  </label>
                  <select
                    id="live-beat-select"
                    value={selectedBeatId}
                    onChange={(e) => setSelectedBeatId(e.target.value)}
                    disabled={recording}
                    className="field"
                  >
                    <option value="none">No backing beat (Acapella / Voice only)</option>
                    {beats.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.title} {b.bpm ? `· ${b.bpm} BPM` : ""} {b.musicalKey ? `· ${b.musicalKey}` : ""}
                      </option>
                    ))}
                    {customBeatUrl && <option value="custom">Custom: {customBeatName}</option>}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-cream/85">
                    <input
                      type="checkbox"
                      checked={playBeatOnRecord}
                      onChange={(e) => setPlayBeatOnRecord(e.target.checked)}
                      className="accent-[#25d366]"
                    />
                    Auto-play backing beat when recording starts
                  </label>

                  <label className="btn-ghost cursor-pointer !px-3 !py-1.5 !text-xs">
                    <span>Load custom beat</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                      onChange={handleCustomBeatUpload}
                      disabled={recording}
                      className="sr-only"
                    />
                  </label>
                </div>

                {activeBeat && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-bold text-cream">♫ {activeBeat.title}</span>
                      <span className="font-mono text-[11px] text-muted">Beat vol {Math.round(beatVolume * 100)}%</span>
                    </div>
                    <audio ref={beatAudioRef} src={activeBeat.url} controls className="mt-2 h-8 w-full" />
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={beatVolume}
                      onChange={(e) => setBeatVolume(Number(e.target.value))}
                      aria-label="Backing beat volume"
                      className="mt-2 h-1.5 w-full cursor-pointer accent-acid"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">2 · Live Microphone Booth</p>
                {recording && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/20 px-3 py-0.5 font-mono text-xs font-bold text-danger">
                    <span className="h-2 w-2 rounded-full bg-danger animate-ping" />
                    REC {formatClock(recordSeconds)}
                  </span>
                )}
              </div>

              {/* Input level meter */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Mic input level</span>
                  <span className="font-mono text-cream">{recording ? `${micLevel}%` : "Standby"}</span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full border border-white/10 bg-black/40 p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#25d366] via-acid to-danger transition-all duration-75"
                    style={{ width: `${recording ? Math.max(6, micLevel) : 0}%` }}
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-danger">
                  {error}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {!recording ? (
                  <button
                    type="button"
                    onClick={() => void startLiveTake()}
                    className="call-accept-animated !px-6 !py-3"
                  >
                    <span className="call-btn-icon">
                      <MicIcon className="h-5 w-5" />
                    </span>
                    <span>Start Live Recording</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={stopLiveTake}
                      className="call-accept-animated !px-5 !py-2.5 !text-xs"
                    >
                      <span className="call-btn-icon !h-7 !w-7">
                        <MicIcon className="h-4 w-4" />
                      </span>
                      <span>Finish &amp; Save Take ({formatClock(recordSeconds)})</span>
                    </button>
                    <button
                      type="button"
                      onClick={cancelLiveTake}
                      className="call-decline-animated !px-5 !py-2.5 !text-xs"
                    >
                      <span>Discard Take</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Recorded Takes Rack */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">3 · Recorded Session Takes</p>
              <span className="badge">{takes.length} {takes.length === 1 ? "take" : "takes"}</span>
            </div>

            {isProducer && artists.length > 0 && (
              <div className="mt-3">
                <label htmlFor="take-recipient-select" className="label">
                  Send recorded takes to artist chat
                </label>
                <select
                  id="take-recipient-select"
                  value={selectedRecipientId ?? ""}
                  onChange={(e) => setSelectedRecipientId(Number(e.target.value) || null)}
                  className="field"
                >
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sendStatus && (
              <p className="mt-3 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 px-3 py-2 text-xs font-semibold text-[#39dc78]">
                {sendStatus}
              </p>
            )}

            {takes.length === 0 ? (
              <div className="mt-6 flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center">
                <MicIcon className="h-8 w-8 text-muted" />
                <p className="mt-3 text-sm font-bold text-cream">No live takes recorded yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted">
                  Click &ldquo;Start Live Recording&rdquo; on the left to record a vocal or instrument take. Your takes will appear here for playback, download, or sending to chat.
                </p>
              </div>
            ) : (
              <div className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
                {takes.map((take) => (
                  <div key={take.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-cream">{take.name}</p>
                      <span className="shrink-0 font-mono text-[10px] text-muted">{take.createdAt}</span>
                    </div>

                    <ChatAudioPlayer url={take.url} kind="voice" name={take.name} />

                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      <a
                        href={take.url}
                        download={take.file.name}
                        className="btn-ghost !px-3 !py-1 !text-xs"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        Download
                      </a>
                      {(isProducer ? artists.length > 0 : Boolean(customer)) && (
                        <button
                          type="button"
                          onClick={() => void sendTakeToChat(take)}
                          disabled={sendingTakeId === take.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1 text-xs font-extrabold text-[#062b1b] transition hover:bg-[#39dc78] disabled:opacity-50"
                        >
                          <SendIcon className="h-3.5 w-3.5" />
                          {sendingTakeId === take.id
                            ? "Sending…"
                            : isProducer
                              ? "Send to Artist Chat"
                              : "Send to Producer Chat"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
