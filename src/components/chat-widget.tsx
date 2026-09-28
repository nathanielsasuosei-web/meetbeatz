"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatIcon, CloseIcon } from "./icons";

/**
 * Floating support chat for signed-in artists ("chat box" bottom-right).
 *
 * The thread lives in the database (one conversation per customer), the admin
 * answers from Admin → Messages, and this widget polls for replies while it is
 * open — and for unread answers while it is closed.
 */

type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
};

const POLL_MS = 7000;

export function ChatWidget({ customer }: { customer: { name: string } | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!customer) return;
    const res = await fetch("/api/messages");
    if (!res.ok) return;
    const data = (await res.json()) as { messages?: ChatMessage[]; unread?: number };
    setMessages(data.messages ?? []);
    setUnread(data.unread ?? 0); // the GET marks replies as read server-side
  }, [customer]);

  useEffect(() => {
    if (!customer) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [customer, load]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [open, messages.length]);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send the message.");
      setMessages(data.messages ?? []);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-acid text-ink shadow-2xl transition hover:scale-105"
        aria-label={open ? "Close chat" : "Chat with us"}
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatIcon className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-44 right-4 z-50 flex h-[26rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
          <div className="border-b border-line bg-panel-2 px-4 py-3">
            <p className="text-sm font-bold">Chat with Meetbeatz</p>
            <p className="text-[11px] text-muted">{customer ? `Hi ${customer.name.split(" ")[0]} — ask us anything` : "Sign in to start chatting"}</p>
          </div>

          {!customer ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <ChatIcon className="h-10 w-10 text-acid" />
              <p className="text-sm text-muted">
                Artists with an account can chat with us here — questions about beats, licenses, payments or studio
                sessions.
              </p>
              <Link href="/account/login" className="btn-primary !py-2.5 text-sm">
                Sign in to chat
              </Link>
              <Link href="/account/register" className="text-xs font-semibold text-acid hover:underline">
                Create an account
              </Link>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.length === 0 && (
                  <p className="px-2 pt-6 text-center text-xs text-muted">
                    No messages yet. Say hello — this chat goes straight to Meetbeatz.
                  </p>
                )}
                {messages.map((m) =>
                  m.fromRole === "system" ? (
                    <p key={m.id} className="mx-auto max-w-[85%] rounded-xl bg-white/5 px-3 py-2 text-center text-[11px] text-muted">
                      {m.body}
                    </p>
                  ) : (
                    <div key={m.id} className={`flex ${m.fromRole === "customer" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.fromRole === "customer" ? "rounded-br-md bg-acid text-ink" : "rounded-bl-md bg-panel-2 text-cream"
                        }`}
                      >
                        {m.fromRole === "admin" && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-acid">Meetbeatz</p>}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                    </div>
                  ),
                )}
              </div>
              {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
              <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(e as unknown as React.FormEvent);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder="Type a message…"
                  className="field max-h-24 min-h-10 flex-1 resize-y !py-2 text-sm"
                />
                <button type="submit" className="btn-primary !px-4 !py-2.5 text-sm" disabled={sending || !draft.trim()}>
                  {sending ? "…" : "Send"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
