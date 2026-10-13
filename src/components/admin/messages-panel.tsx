"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, SendIcon } from "@/components/icons";

/**
 * Producer side of a private artist thread. Polls the messages API while
 * mounted so a new question arrives without a refresh.
 */
type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
  read?: boolean;
};

const POLL_MS = 7000;

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
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
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, body: text }),
      });
      const data = (await res.json()) as { error?: string; messages?: ChatMessage[] };
      if (!res.ok) throw new Error(data.error ?? "Could not send the reply.");
      setMessages(data.messages ?? []);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="wa-chat-panel flex h-[32rem] flex-col overflow-hidden rounded-2xl">
      <header className="wa-chat-header flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div className="min-w-0">
          <p className="truncate font-bold">Private chat with {customer.name}</p>
          <p className="truncate text-xs text-white/70">{customer.email} · only you and this artist can see this thread</p>
        </div>
        <Link href="/admin/orders" className="btn-ghost !px-3 !py-1.5 text-xs">
          Their orders →
        </Link>
      </header>
      <div ref={scrollRef} className="wa-chat-wallpaper flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="wa-chat-intro mx-auto mt-8 max-w-[85%] rounded-xl px-4 py-3 text-center text-sm">
            No messages yet. Send a reply to start this private conversation.
          </p>
        )}
        {messages.map((message) =>
          message.fromRole === "system" ? (
            <p key={message.id} className="wa-chat-system mx-auto max-w-[85%] rounded-xl px-3 py-2 text-center text-[11px]">
              {message.body}
            </p>
          ) : (
            <div key={message.id} className={`flex ${message.fromRole === "admin" ? "justify-end" : "justify-start"}`}>
              <div className={`wa-chat-bubble max-w-[80%] rounded-2xl px-3.5 py-2 ${message.fromRole === "admin" ? "wa-chat-outgoing rounded-br-md" : "wa-chat-incoming rounded-bl-md"}`}>
                <p className={`mb-0.5 text-[10px] font-bold uppercase tracking-wider ${message.fromRole === "admin" ? "text-[#25d366]" : "text-white/70"}`}>
                  {message.fromRole === "admin" ? "Meetbeatz Producer" : customer.name.split(" ")[0]}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
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
      {error && <p role="alert" className="bg-[#202c33] px-4 pb-2 text-xs text-red-300">{error}</p>}
      <form onSubmit={send} className="wa-chat-composer flex items-end gap-2 p-3">
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
          placeholder="Reply to the artist…"
          aria-label="Reply to the artist"
          className="wa-chat-input max-h-24 min-h-10 flex-1 resize-y px-4 py-2.5 text-sm outline-none"
        />
        <button type="submit" className="wa-chat-send grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45" disabled={sending || !draft.trim()} aria-label={sending ? "Sending reply" : "Send reply"}>
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
    </section>
  );
}
