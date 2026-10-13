"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatAudioPlayer } from "./chat-audio-player";
import { CheckIcon, ChatIcon, CloseIcon, Equalizer, MicIcon, PhoneIcon, SendIcon } from "./icons";
import { OPEN_PRODUCER_CHAT_EVENT } from "@/lib/chat-events";
import { uploadFileInChunks } from "@/lib/client-upload";
import { formatBytes } from "@/lib/upload-rules";

/**
 * Private, WhatsApp-inspired chat between a signed-in artist and the Meetbeatz
 * producer. Artists have one thread each; the producer replies from Admin →
 * Messages. Supports text, recorded voice audio, and attached audio files.
 */
type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
  /** True once the other side has opened the message. */
  read?: boolean;
  audioUrl?: string | null;
  audioKind?: "voice" | "audio" | null;
  audioName?: string | null;
};

type StagedAudio = {
  file: File;
  kind: "voice" | "audio";
  name: string;
  previewUrl: string;
};

const POLL_MS = 7000;

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function formatRecordingTimer(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
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

export function ChatWidget({ customer }: { customer: { name: string } | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [stagedAudio, setStagedAudio] = useState<StagedAudio | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordSecondsRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!customer) return;
    try {
      const res = await fetch(open ? "/api/messages?read=1" : "/api/messages", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[]; unread?: number };
      setMessages(data.messages ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // A missed poll must not prevent the artist from using the chat.
    }
  }, [customer, open]);

  useEffect(() => {
    if (!customer) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [customer, load]);

  useEffect(() => {
    const requestOpen = () => setOpen(true);
    window.addEventListener(OPEN_PRODUCER_CHAT_EVENT, requestOpen);
    return () => window.removeEventListener(OPEN_PRODUCER_CHAT_EVENT, requestOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const stopRecordingStream = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const clearStagedAudio = useCallback(() => {
    setStagedAudio((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingStream();
    };
  }, [stopRecordingStream]);

  async function submitMessage(audioToUpload: StagedAudio | null, textDraft: string) {
    const text = textDraft.trim();
    if (!text && !audioToUpload) return;
    if (sending) return;
    setSending(true);
    setError(null);
    setUploadPercent(null);
    setUploadStatus(null);
    try {
      let audioPath: string | undefined;
      let audioKind: "voice" | "audio" | undefined;
      let audioName: string | undefined;

      if (audioToUpload) {
        setUploadPercent(0);
        setUploadStatus(audioToUpload.kind === "voice" ? "Uploading voice audio…" : `Uploading ${audioToUpload.name}…`);
        audioPath = await uploadFileInChunks(
          audioToUpload.file,
          "chat-audio",
          (sent, total) => {
            if (total > 0) setUploadPercent(Math.min(100, Math.round((sent / total) * 100)));
          },
          (msg) => setUploadStatus(msg),
        );
        audioKind = audioToUpload.kind;
        audioName = audioToUpload.name;
      }

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, audioPath, audioKind, audioName }),
      });
      const data = (await res.json()) as { error?: string; messages?: ChatMessage[] };
      if (!res.ok) throw new Error(data.error ?? "Could not send the message.");
      setMessages(data.messages ?? []);
      setDraft("");
      clearStagedAudio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
      setUploadPercent(null);
      setUploadStatus(null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await submitMessage(stagedAudio, draft);
  }

  async function startVoiceRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording requires microphone access in a supported browser on HTTPS or localhost.");
      return;
    }

    try {
      clearStagedAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      chunksRef.current = [];
      recordSecondsRef.current = 0;
      setRecordSeconds(0);

      const { mimeType, ext } = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(200);
      setRecording(true);

      recordTimerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch (err) {
      stopRecordingStream();
      setRecording(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access was blocked. Allow microphone access in your browser to record voice audio.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start voice recording.");
      }
    }
  }

  function finishRecorderToAudio(sendImmediately: boolean) {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const { mimeType, ext } = pickRecorderMime();
    const durationSec = Math.max(1, recordSecondsRef.current);
    const label = `Voice audio (${formatRecordingTimer(durationSec)})`;

    recorder.onstop = () => {
      const actualMime = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];
      stopRecordingStream();
      setRecording(false);

      if (blob.size === 0) {
        setError("Recorded voice audio was empty. Please try again.");
        return;
      }

      const file = new File([blob], `voice-${Date.now()}${ext}`, { type: actualMime });
      const previewUrl = URL.createObjectURL(blob);
      const nextStaged: StagedAudio = {
        file,
        kind: "voice",
        name: label,
        previewUrl,
      };

      if (sendImmediately) {
        void submitMessage(nextStaged, draft);
      } else {
        setStagedAudio(nextStaged);
      }
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function cancelVoiceRecording() {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    chunksRef.current = [];
    stopRecordingStream();
    setRecording(false);
    setRecordSeconds(0);
  }

  function handleAudioFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    clearStagedAudio();
    const previewUrl = URL.createObjectURL(file);
    setStagedAudio({
      file,
      kind: "audio",
      name: file.name,
      previewUrl,
    });
  }

  // This is an artist-to-producer inbox, not a public chat widget. Guests do
  // not see an entry point, and the API still rejects unauthenticated requests.
  if (!customer) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        className="wa-chat-trigger fixed right-4 z-[60] flex h-14 items-center gap-2 rounded-full px-3.5 shadow-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        aria-label={open ? "Close chat with the producer" : "Chat with the producer"}
        aria-expanded={open}
        aria-controls="artist-producer-chat"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/10">
          {open ? <CloseIcon className="h-5 w-5" /> : <ChatIcon className="h-5 w-5" />}
        </span>
        <span className="pr-1 text-sm font-bold">{open ? "Close chat" : "Chat with producer"}</span>
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#25d366] bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id="artist-producer-chat"
          role="dialog"
          aria-label="Private chat with the Meetbeatz producer"
          style={{
            bottom: "calc(10.5rem + env(safe-area-inset-bottom))",
            height: "min(34rem, calc(100dvh - 12rem))",
          }}
          className="wa-chat-panel chat-panel fixed right-3 z-[60] flex w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl"
        >
          <header className="wa-chat-header flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="wa-chat-avatar grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black" aria-hidden="true">
                MB
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Meetbeatz Producer</p>
                <p className="truncate text-[11px] text-white/75">Private chat · only you and the producer</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href="/call"
                onClick={() => setOpen(false)}
                title="Call the producer"
                aria-label="Call the producer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-extrabold text-[#062b1b] shadow transition hover:bg-[#39dc78]"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                Call
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                aria-label="Close conversation"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="wa-chat-wallpaper flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="wa-chat-intro mx-auto mt-5 max-w-[90%] rounded-xl px-3.5 py-3 text-center text-xs leading-relaxed">
                <ChatIcon className="mx-auto mb-2 h-5 w-5 text-[#25d366]" />
                Start a private conversation about beats, licenses or studio sessions. Other artists cannot see this thread.
              </div>
            )}
            {messages.map((message) =>
              message.fromRole === "system" ? (
                <p key={message.id} className="wa-chat-system mx-auto max-w-[88%] rounded-xl px-3 py-2 text-center text-[11px] leading-relaxed">
                  {message.body}
                </p>
              ) : (
                <div key={message.id} className={`flex ${message.fromRole === "customer" ? "justify-end" : "justify-start"}`}>
                  <div className={`wa-chat-bubble max-w-[86%] rounded-2xl px-3.5 py-2 ${message.fromRole === "customer" ? "wa-chat-outgoing rounded-br-md" : "wa-chat-incoming rounded-bl-md"}`}>
                    {message.fromRole === "admin" && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#25d366]">Meetbeatz Producer</p>
                    )}
                    {message.audioUrl && (
                      <ChatAudioPlayer url={message.audioUrl} kind={message.audioKind} name={message.audioName} />
                    )}
                    {message.body && (
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.body}</p>
                    )}
                    <div className="wa-chat-meta mt-1 flex items-center justify-end gap-1.5">
                      <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                      {message.fromRole === "customer" && (
                        <span className={message.read ? "wa-chat-read" : "wa-chat-sent"} aria-label={message.read ? "Read by the producer" : "Sent"}>
                          <CheckIcon className="h-3 w-3" />
                          {message.read && <CheckIcon className="-ml-2 h-3 w-3" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {error && <p role="alert" className="bg-[#202c33] px-4 py-2 text-xs text-red-300">{error}</p>}

          {uploadStatus && (
            <div className="border-t border-white/10 bg-[#182229] px-3 py-2 text-[11px] text-[#39dc78]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{uploadStatus}</span>
                {uploadPercent !== null && <span className="font-mono font-bold">{uploadPercent}%</span>}
              </div>
              {uploadPercent !== null && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#25d366] transition-all duration-150"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {stagedAudio && !recording && (
            <div className="border-t border-white/10 bg-[#182229] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#25d366]/20 text-[11px] font-bold text-[#39dc78]">
                    {stagedAudio.kind === "voice" ? <MicIcon className="h-3 w-3" /> : "♫"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-white">{stagedAudio.name}</p>
                    <p className="text-[10px] text-white/60">{formatBytes(stagedAudio.file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearStagedAudio}
                  disabled={sending}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/20"
                >
                  <CloseIcon className="h-3 w-3" />
                  Remove
                </button>
              </div>
              <audio controls src={stagedAudio.previewUrl} className="mt-1.5 h-7 w-full" />
            </div>
          )}

          {recording ? (
            <div className="wa-chat-composer flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-danger animate-ping" />
                <span className="text-[11px] font-bold text-white">Recording…</span>
                <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#39dc78]">
                  {formatRecordingTimer(recordSeconds)}
                </span>
                <Equalizer className="h-3 text-[#39dc78]" />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => finishRecorderToAudio(false)}
                  className="rounded-full border border-[#25d366]/40 bg-[#25d366]/15 px-2.5 py-1 text-[11px] font-bold text-[#39dc78] hover:bg-[#25d366]/25"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => finishRecorderToAudio(true)}
                  className="wa-chat-send inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold"
                >
                  <SendIcon className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={send} className="wa-chat-composer shrink-0 space-y-2 px-3 py-2.5">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.aif,.aiff,.opus,.webm"
                onChange={handleAudioFilePick}
                className="sr-only"
                aria-label="Attach audio file"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void startVoiceRecording()}
                  disabled={sending}
                  className="inline-flex items-center gap-1 rounded-full border border-[#25d366]/40 bg-[#25d366]/15 px-2.5 py-1 text-[11px] font-bold text-[#39dc78] transition hover:bg-[#25d366]/25 disabled:opacity-45"
                  title="Record voice audio"
                >
                  <MicIcon className="h-3 w-3" />
                  Record voice
                </button>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={sending}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/90 transition hover:bg-white/15 disabled:opacity-45"
                  title="Attach audio file"
                >
                  <span aria-hidden>♫</span>
                  Send audio
                </button>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(event as unknown as React.FormEvent);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder={stagedAudio ? "Add a caption or press Send…" : "Message the producer…"}
                  aria-label="Message the producer"
                  className="wa-chat-input max-h-24 min-h-10 flex-1 resize-y px-4 py-2.5 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="wa-chat-send grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={sending || (!draft.trim() && !stagedAudio)}
                  aria-label={sending ? "Sending message" : "Send message"}
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
