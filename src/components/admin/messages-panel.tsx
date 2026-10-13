"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatAudioPlayer } from "@/components/chat-audio-player";
import { CheckIcon, CloseIcon, Equalizer, MicIcon, PhoneIcon, SendIcon } from "@/components/icons";
import { uploadFileInChunks } from "@/lib/client-upload";
import { formatBytes } from "@/lib/upload-rules";

/**
 * Producer side of a private artist thread. Polls the messages API while
 * mounted so a new question arrives without a refresh, and lets the producer
 * record voice audio notes or attach audio files directly in the chat.
 */
type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
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

export function MessagesPanel({
  customerId,
  customer,
  initialMessages,
}: {
  customerId: number;
  customer: { name: string; email: string };
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [stagedAudio, setStagedAudio] = useState<StagedAudio | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordSecondsRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/messages?customerId=${customerId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[] };
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // Leave the current conversation usable if a poll fails.
    }
  }, [customerId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

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

  async function submitReply(audioToUpload: StagedAudio | null, textDraft: string) {
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

      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          body: text,
          audioPath,
          audioKind,
          audioName,
        }),
      });
      const data = (await res.json()) as { error?: string; messages?: ChatMessage[] };
      if (!res.ok) throw new Error(data.error ?? "Could not send the reply.");
      setMessages(data.messages ?? []);
      setDraft("");
      clearStagedAudio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setSending(false);
      setUploadPercent(null);
      setUploadStatus(null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await submitReply(stagedAudio, draft);
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
        void submitReply(nextStaged, draft);
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

  return (
    <section className="wa-chat-panel flex h-[36rem] flex-col overflow-hidden rounded-2xl">
      <header className="wa-chat-header flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div className="min-w-0">
          <p className="truncate font-bold">Private chat with {customer.name}</p>
          <p className="truncate text-xs text-white/70">{customer.email} · only you and this artist can see this thread</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/call" className="btn-ghost !px-3 !py-1.5 text-xs">
            <PhoneIcon className="h-3.5 w-3.5" />
            Audio call
          </Link>
          <Link href="/admin/orders" className="btn-ghost !px-3 !py-1.5 text-xs">
            Their orders →
          </Link>
        </div>
      </header>

      <div ref={scrollRef} className="wa-chat-wallpaper flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="wa-chat-intro mx-auto mt-8 max-w-[85%] rounded-xl px-4 py-3 text-center text-sm">
            No messages yet. Send a text reply, record a voice note, or attach an audio file to start this private conversation.
          </p>
        )}
        {messages.map((message) =>
          message.fromRole === "system" ? (
            <p key={message.id} className="wa-chat-system mx-auto max-w-[85%] rounded-xl px-3 py-2 text-center text-[11px]">
              {message.body}
            </p>
          ) : (
            <div key={message.id} className={`flex ${message.fromRole === "admin" ? "justify-end" : "justify-start"}`}>
              <div
                className={`wa-chat-bubble max-w-[82%] rounded-2xl px-3.5 py-2 ${
                  message.fromRole === "admin" ? "wa-chat-outgoing rounded-br-md" : "wa-chat-incoming rounded-bl-md"
                }`}
              >
                <p
                  className={`mb-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    message.fromRole === "admin" ? "text-[#25d366]" : "text-white/70"
                  }`}
                >
                  {message.fromRole === "admin" ? "Meetbeatz Producer" : customer.name.split(" ")[0]}
                </p>

                {message.audioUrl && (
                  <ChatAudioPlayer url={message.audioUrl} kind={message.audioKind} name={message.audioName} />
                )}

                {message.body && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                )}

                <div className="wa-chat-meta mt-1 flex items-center justify-end gap-1.5">
                  <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                  {message.fromRole === "admin" && (
                    <span className={message.read ? "wa-chat-read" : "wa-chat-sent"} aria-label={message.read ? "Read by the artist" : "Sent"}>
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

      {error && (
        <p role="alert" className="bg-[#202c33] px-4 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {uploadStatus && (
        <div className="border-t border-white/10 bg-[#182229] px-4 py-2 text-xs text-[#39dc78]">
          <div className="flex items-center justify-between gap-2">
            <span>{uploadStatus}</span>
            {uploadPercent !== null && <span className="font-mono font-bold">{uploadPercent}%</span>}
          </div>
          {uploadPercent !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#25d366] transition-all duration-150"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {stagedAudio && !recording && (
        <div className="border-t border-white/10 bg-[#182229] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#25d366]/20 text-xs font-bold text-[#39dc78]">
                {stagedAudio.kind === "voice" ? <MicIcon className="h-3.5 w-3.5" /> : "♫"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{stagedAudio.name}</p>
                <p className="text-[10px] text-white/60">
                  {stagedAudio.kind === "voice" ? "Recorded voice audio" : "Audio file"} · {formatBytes(stagedAudio.file.size)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearStagedAudio}
              disabled={sending}
              aria-label="Remove attached audio"
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/20"
            >
              <CloseIcon className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
          <audio controls src={stagedAudio.previewUrl} className="mt-2 h-8 w-full" />
        </div>
      )}

      {recording ? (
        <div className="wa-chat-composer flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-danger animate-ping" />
            <span className="text-xs font-bold text-white">Recording voice audio…</span>
            <span className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs font-bold text-[#39dc78]">
              {formatRecordingTimer(recordSeconds)}
            </span>
            <Equalizer className="text-[#39dc78]" />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelVoiceRecording}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => finishRecorderToAudio(false)}
              className="rounded-full border border-[#25d366]/40 bg-[#25d366]/15 px-3 py-1.5 text-xs font-bold text-[#39dc78] hover:bg-[#25d366]/25"
            >
              Stop &amp; preview
            </button>
            <button
              type="button"
              onClick={() => finishRecorderToAudio(true)}
              className="wa-chat-send inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold"
              aria-label="Send recorded voice audio"
            >
              <SendIcon className="h-4 w-4" />
              Send voice
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="wa-chat-composer space-y-2 p-3">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.aif,.aiff,.opus,.webm"
            onChange={handleAudioFilePick}
            className="sr-only"
            aria-label="Attach audio file"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void startVoiceRecording()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#25d366]/40 bg-[#25d366]/15 px-3 py-1.5 text-xs font-bold text-[#39dc78] transition hover:bg-[#25d366]/25 disabled:opacity-45"
              title="Record voice audio with your microphone"
            >
              <MicIcon className="h-3.5 w-3.5" />
              Record voice
            </button>

            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90 transition hover:bg-white/15 disabled:opacity-45"
              title="Attach and send an audio file in the chat"
            >
              <span aria-hidden>♫</span>
              Send audio
            </button>
          </div>

          <div className="flex items-end gap-2">
            <textarea
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
              placeholder={stagedAudio ? "Add an optional caption or press Send…" : "Reply to the artist…"}
              aria-label="Reply to the artist"
              className="wa-chat-input max-h-24 min-h-10 flex-1 resize-y px-4 py-2.5 text-sm outline-none"
            />
            <button
              type="submit"
              className="wa-chat-send grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45"
              disabled={sending || (!draft.trim() && !stagedAudio)}
              aria-label={sending ? "Sending reply" : "Send reply"}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
