"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/format";

/**
 * The admin side of a customer's support thread: live messages and a reply
 * box. Polls the messages API while mounted so a new customer question shows
 * up without a refresh.
 */

type ChatMessage = {
  id: number;
  fromRole: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
};

const POLL_MS = 7000;

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
      const data = await res.json();
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
      const data = await res.json();
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
    <div className="card flex h-[32rem] flex-col p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <p className="font-bold">{customer.name}</p>
          <p className="text-xs text-muted">{customer.email}</p>
        </div>
        <Link href="/admin/orders" className="btn-ghost !px-3 !py-1.5 text-xs">
          Their orders →
        </Link>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="pt-8 text-center text-sm text-muted">No messages yet.</p>}
        {messages.map((m) =>
          m.fromRole === "system" ? (
            <p key={m.id} className="mx-auto max-w-[85%] rounded-xl bg-white/5 px-3 py-2 text-center text-[11px] text-muted">
              {m.body}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.fromRole === "admin" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.fromRole === "admin" ? "rounded-br-md bg-acid text-ink" : "rounded-bl-md bg-panel-2 text-cream"
                }`}
              >
                <p className={`mb-0.5 text-[10px] font-bold uppercase tracking-wider ${m.fromRole === "admin" ? "text-ink/60" : "text-acid"}`}>
                  {m.fromRole === "admin" ? "You" : customer.name.split(" ")[0]}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.fromRole === "admin" ? "text-ink/50" : "text-muted"}`}>{formatDate(m.createdAt)}</p>
              </div>
            </div>
          ),
        )}
      </div>
      {error && <p className="px-4 pb-2 text-xs text-danger">{error}</p>}
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
          placeholder="Reply as Meetbeatz…"
          className="field max-h-24 min-h-10 flex-1 resize-y !py-2 text-sm"
        />
        <button type="submit" className="btn-primary !px-4 !py-2.5 text-sm" disabled={sending || !draft.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
