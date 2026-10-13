"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, ChatIcon, CloseIcon, SendIcon } from "./icons";
import { OPEN_PRODUCER_CHAT_EVENT } from "@/lib/chat-events";

/**
 * Private, WhatsApp-inspired chat between a signed-in artist and the Meetbeatz
 * producer. Artists have one thread each; the producer replies from Admin →
 * Messages. The API independently enforces both sides' session roles.
 */
type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
  /** True once the other side has opened the message. */
  read?: boolean;
};

const POLL_MS = 7000;

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function ChatWidget({ customer }: { customer: { name: string } | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json()) as { error?: string; messages?: ChatMessage[] };
      if (!res.ok) throw new Error(data.error ?? "Could not send the message.");
      setMessages(data.messages ?? []);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
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
            height: "min(32rem, calc(100dvh - 12rem))",
          }}
          className="wa-chat-panel chat-panel fixed right-3 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl"
        >
          <header className="wa-chat-header flex shrink-0 items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="wa-chat-avatar grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black" aria-hidden="true">
                MB
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Meetbeatz Producer</p>
                <p className="truncate text-[11px] text-white/75">Private chat · only you and the producer</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label="Close conversation"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
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
                  <div className={`wa-chat-bubble max-w-[84%] rounded-2xl px-3.5 py-2 ${message.fromRole === "customer" ? "wa-chat-outgoing rounded-br-md" : "wa-chat-incoming rounded-bl-md"}`}>
                    {message.fromRole === "admin" && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#25d366]">Meetbeatz Producer</p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.body}</p>
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

          {error && <p role="alert" className="bg-[#202c33] px-4 pb-2 text-xs text-red-300">{error}</p>}
          <form onSubmit={send} className="wa-chat-composer flex shrink-0 items-end gap-2 px-3 py-3">
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
              placeholder="Message the producer…"
              aria-label="Message the producer"
              className="wa-chat-input max-h-24 min-h-10 flex-1 resize-y px-4 py-2.5 text-sm outline-none"
            />
            <button
              type="submit"
              className="wa-chat-send grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45"
              disabled={sending || !draft.trim()}
              aria-label={sending ? "Sending message" : "Send message"}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
