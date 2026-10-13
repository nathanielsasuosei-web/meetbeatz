"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import type { ChatThread } from "@/lib/messages";

/** Keep the inbox current even when no conversation has been opened yet. */
export function MessageThreads({ initialThreads, selectedId }: { initialThreads: ChatThread[]; selectedId: number | null }) {
  const [threads, setThreads] = useState(initialThreads);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/messages", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { threads?: ChatThread[] };
        if (mounted && Array.isArray(data.threads)) setThreads(data.threads);
      } catch {
        // Keep the last available inbox when the connection drops.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  return (
    <div className="card max-h-[36rem] overflow-y-auto p-2">
      {threads.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          No artist chats yet. Signed-in artists can message the producer from their account; each conversation is private.
        </p>
      ) : (
        <div className="space-y-1">
          {threads.map((t) => {
            const hasAccount = t.email !== "artist-caller@meetbeatz.local";
            return (
              <div
                key={t.customerId}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition ${
                  selectedId === t.customerId ? "bg-acid/10 ring-1 ring-acid/40" : "hover:bg-white/5"
                }`}
              >
                <Link href={`/admin/messages?customerId=${t.customerId}`} className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold">{t.name}</p>
                    {t.unread > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-acid px-1 text-[10px] font-bold text-ink">
                        {t.unread > 9 ? "9+" : t.unread}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted">{t.lastBody || "…"}</p>
                  <p className="mt-1 text-[10px] text-muted">{formatDateTime(t.lastAt)}</p>
                </Link>
                {hasAccount && (
                  <Link
                    href={`/admin/call?customerId=${t.customerId}&autoStart=1`}
                    title={`Call ${t.name}`}
                    aria-label={`Call ${t.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#25d366]/20 text-[#39dc78] transition hover:bg-[#25d366] hover:text-[#062b1b]"
                  >
                    <PhoneIcon className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
